//! What the window may ask about signing in.
//!
//! Six verbs, and none of them hands a token back. The window is told whether
//! somebody is signed in and under which address; the session itself stays on
//! this side, because a window that never holds a token is a window that
//! cannot leak one.

use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use super::{gotrue, keychain, now_ms, pkce_pair, Auth, Standing, REDIRECT};

/// The address this app is talking to, and whether it is the default.
#[tauri::command]
pub async fn site_address<R: Runtime>(app: AppHandle<R>) -> Result<SiteAddress, ()> {
    let now = super::site(&app);
    Ok(SiteAddress {
        default: now == super::built_site(),
        address: now,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SiteAddress {
    pub address: String,
    pub default: bool,
}

/// Point the app somewhere else, and try it at once.
///
/// Saved before it is tried, deliberately. An address that is right but
/// temporarily unreachable — a deployment mid-build, a laptop asleep — must
/// not be thrown away because the first attempt failed; the app would forget
/// what it was told every time the network hiccuped.
#[tauri::command]
pub async fn site_set<R: Runtime>(app: AppHandle<R>, address: String) -> Result<Standing, String> {
    let tidy = super::tidy_site(&address)?;

    {
        let store = app.state::<crate::store::Store>();
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        crate::store::settings::set(&connection, crate::store::settings::SITE, &tidy)?;
    }

    // A different deployment is a different set of accounts. Whatever is in
    // the keychain was issued by the old one and will not work here.
    let _ = keychain::clear();
    {
        let auth = app.state::<Auth>();
        let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        state.session = None;
        state.config = None;
        state.expires_at = 0;
        state.verifier = None;
    }

    reach_for_it(&app, &tidy).await
}

/// Go back to the address the app shipped with.
#[tauri::command]
pub async fn site_reset<R: Runtime>(app: AppHandle<R>) -> Result<Standing, String> {
    {
        let store = app.state::<crate::store::Store>();
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        crate::store::settings::clear(&connection, crate::store::settings::SITE)?;
    }
    let back = super::built_site();
    reach_for_it(&app, &back).await
}

/// Try the address now and say what happened, rather than at the next launch.
async fn reach_for_it<R: Runtime>(app: &AppHandle<R>, address: &str) -> Result<Standing, String> {
    let reached = gotrue::config(address).await;
    {
        let auth = app.state::<Auth>();
        let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        match &reached {
            Ok(config) => {
                state.config = Some(config.clone());
                state.problem = None;
            }
            Err(problem) => state.problem = Some(problem.clone()),
        }
    }
    reached?;
    Ok(standing_now(&app.state::<Auth>()))
}

/// Tell the window what to draw.
///
/// Async, and that is not cosmetic. A synchronous command runs on the main
/// thread, and this one asks the OS keychain whether it exists — which on
/// Linux is a D-Bus call that, with no session bus running, blocks while
/// libdbus tries to start one. The app froze before its window had even
/// painted: no note, no tray, no hotkey, no message. Async moves it to a
/// worker thread, where a slow answer is just a slow answer.
#[tauri::command]
pub async fn auth_standing(auth: State<'_, Auth>) -> Result<Standing, ()> {
    Ok(standing_now(&auth))
}

/// The same answer, for callers already off the main thread.
pub fn standing_now(auth: &State<'_, Auth>) -> Standing {
    let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
    Standing {
        signed_in: state.session.is_some(),
        email: state.session.as_ref().and_then(|s| s.user.email.clone()),
        providers: state
            .config
            .as_ref()
            .map(|c| c.providers.clone())
            .unwrap_or_default(),
        configured: state.config.is_some(),
        can_remember: keychain::available(),
        problem: state.problem.clone(),
    }
}

/// Open the user's own browser at the sign-in page.
///
/// The secret half of the PKCE pair is kept here and never leaves. What goes
/// into the browser — and therefore into the address bar, the history, and
/// any log along the way — is only its hash.
#[tauri::command]
pub async fn auth_begin<R: Runtime>(
    app: AppHandle<R>,
    auth: State<'_, Auth>,
    provider: String,
) -> Result<(), String> {
    let config = {
        let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        state
            .config
            .clone()
            .ok_or_else(|| "This app hasn't been able to reach tougather.com yet.".to_string())?
    };

    if !config.providers.iter().any(|p| p == &provider) {
        return Err(format!(
            "{provider} isn't switched on for this deployment, so signing in with it would fail in the browser."
        ));
    }

    let (verifier, challenge) = pkce_pair();
    {
        let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        state.verifier = Some(verifier);
    }

    let url = gotrue::browser_url(&config, &provider, &challenge, REDIRECT);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open your browser: {e}"))
}

/// The fallback, for deployments where no provider is configured.
#[tauri::command]
pub async fn auth_with_password<R: Runtime>(
    app: AppHandle<R>,
    auth: State<'_, Auth>,
    email: String,
    password: String,
) -> Result<Standing, String> {
    let config = {
        let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        state
            .config
            .clone()
            .ok_or_else(|| "This app hasn't been able to reach tougather.com yet.".to_string())?
    };

    let session = gotrue::password(&config, email.trim(), &password).await?;
    super::adopt(&app, session)
}

/// Finish a browser sign-in. Called when the `tougather://auth` link arrives.
pub async fn finish<R: Runtime>(app: &AppHandle<R>, link: &str) -> Result<Standing, String> {
    let code = super::code_in(link)?;

    let auth = app.state::<Auth>();
    let (config, verifier) = {
        let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        // Taken, not read. An authorization code is spent once, and a second
        // link arriving — a double-click on the browser's button, a replayed
        // URL — must not be able to reuse the secret.
        let verifier = state.verifier.take();
        (state.config.clone(), verifier)
    };

    let config = config.ok_or_else(|| "This app hasn't reached tougather.com yet.".to_string())?;
    let verifier = verifier.ok_or_else(|| {
        "That sign-in link doesn't belong to this window — start signing in from the app again."
            .to_string()
    })?;

    let session = gotrue::exchange(&config, &code, &verifier).await?;
    super::adopt(app, session)
}

#[tauri::command]
pub async fn auth_sign_out<R: Runtime>(app: AppHandle<R>) -> Result<Standing, String> {
    let auth = app.state::<Auth>();
    let (config, access) = {
        let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        let access = state.session.take().map(|s| s.access_token);
        state.expires_at = 0;
        state.verifier = None;
        (state.config.clone(), access)
    };

    // Everything here was sent to an account this machine is no longer signed
    // in to. Leaving the stamps would mean that whoever signs in next
    // inherits "already sent" for notes their account has never seen.
    if let Some(store) = app.try_state::<crate::store::Store>() {
        let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
        let _ = crate::store::notes::forget_sync_state(&connection);
    }

    // The keychain first. If the network call below fails, the token is
    // already gone from this machine — a sign-out that leaves somebody signed
    // in because the wifi was down is not a sign-out.
    let cleared = keychain::clear();

    if let (Some(config), Some(access)) = (config, access) {
        gotrue::sign_out(&config, &access).await;
    }

    cleared?;
    Ok(standing_now(&app.state::<Auth>()))
}

/// A token good for right now, refreshing it if it is about to lapse.
///
/// Unused until step 4 and kept deliberately: it is the single funnel every
/// call to the account will go through, and writing it beside the rest of the
/// session handling is what keeps refresh logic from being scattered across
/// however many callers there turn out to be.
///
/// Everything that talks to the account goes through here, so there is one
/// place where an expired session becomes a refreshed one — or becomes an
/// honest "you have been signed out" rather than a string of failures nobody
/// can explain.
#[allow(dead_code)] // Unused until step 4; see the note above.
pub async fn access_token<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    let auth = app.state::<Auth>();
    let (config, refresh_token, current, expires_at) = {
        let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        (
            state.config.clone(),
            state.session.as_ref().map(|s| s.refresh_token.clone()),
            state.session.as_ref().map(|s| s.access_token.clone()),
            state.expires_at,
        )
    };

    let config = config.ok_or_else(|| "No connection to tougather.com.".to_string())?;
    let refresh_token = refresh_token.ok_or_else(|| "Not signed in.".to_string())?;

    if let Some(token) = current {
        if now_ms() < expires_at {
            return Ok(token);
        }
    }

    match gotrue::refresh(&config, &refresh_token).await {
        Ok(session) => {
            let token = session.access_token.clone();
            super::adopt(app, session)?;
            Ok(token)
        }
        Err(why) => {
            // A refusal here means the session is over — revoked from another
            // device, or simply too old. Clearing it is the honest response;
            // leaving a dead token in the keychain means every future attempt
            // fails the same way and the user is never told to sign in again.
            {
                let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
                state.session = None;
                state.expires_at = 0;
            }
            let _ = keychain::clear();
            Err(format!(
                "Your session has ended — please sign in again. ({why})"
            ))
        }
    }
}
