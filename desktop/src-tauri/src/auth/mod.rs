//! Signing in, and staying signed in.
//!
//! The shape, in one paragraph: the app makes a secret, opens the user's own
//! browser at Supabase carrying only a *hash* of that secret, and waits. The
//! browser does the signing in — where the user can see the address bar, and
//! where they are usually signed in already — and hands back an authorization
//! code through a `tougather://auth` link. The app trades that code plus the
//! original secret for a session. Whoever intercepts the code has half of a
//! pair and can do nothing with it.
//!
//! No privileged key is involved anywhere, which is the whole reason this
//! flow was chosen over showing a short code and polling. That one needs the
//! server to mint a session on somebody's behalf, and minting sessions is a
//! power that comes bundled with the power to read every account in the
//! database.
//!
//! The refresh token goes to the OS keychain and the access token stays in
//! memory here. Neither ever crosses into the webview.

pub mod commands;
pub mod gotrue;
pub mod keychain;

use std::sync::Mutex;

use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};

use gotrue::{Config, Session};

/// Where the browser is sent back to. Registered with the OS at install time.
pub const REDIRECT: &str = "tougather://auth";

/// Which tougather.com to ask. Overridable at build time so a staging build
/// can point at staging without a code change.
pub fn site() -> String {
    option_env!("TOUGATHER_SITE")
        .unwrap_or("https://tougather.com")
        .to_string()
}

/// Everything about being signed in, in one place behind one lock.
#[derive(Default)]
pub struct Auth(pub Mutex<State>);

#[derive(Default)]
pub struct State {
    /// Read once at startup. `None` until the app has reached the site.
    pub config: Option<Config>,
    /// The live session. Absent when signed out.
    pub session: Option<Session>,
    /// When the access token stops working, in milliseconds since the epoch.
    pub expires_at: i64,
    /// The secret half of the pair, kept only between opening the browser and
    /// the code coming back. Dropped afterwards so a second link cannot reuse
    /// it — an authorization code is meant to be spent once.
    pub verifier: Option<String>,
}

/// What the window is told. Deliberately not the session: the window has no
/// business holding a token it cannot use for anything.
#[derive(Debug, Clone, Serialize)]
pub struct Standing {
    pub signed_in: bool,
    pub email: Option<String>,
    /// Providers this deployment has turned on, for the buttons to offer.
    pub providers: Vec<String>,
    /// False when the app has not managed to read the site's configuration.
    pub configured: bool,
    /// False on a machine with no keychain, where being signed in cannot be
    /// remembered safely — asked before the button is offered rather than
    /// after a password has been typed.
    pub can_remember: bool,
    /// Set when something went wrong that the user should see.
    pub problem: Option<String>,
}

/// A code verifier and the challenge derived from it.
///
/// The verifier is 32 random bytes in base64url — the length RFC 7636 asks
/// for, from the OS's own randomness rather than anything seeded.
pub fn pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 32];
    getrandom(&mut bytes);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest);
    (verifier, challenge)
}

/// Randomness from the operating system.
///
/// Through `getrandom`, which every dependency here already pulls in, rather
/// than a pseudo-random generator seeded from the clock — this is the secret
/// the whole flow rests on.
fn getrandom(buffer: &mut [u8]) {
    getrandom::fill(buffer).expect("the operating system has no randomness");
}

/// Pull the authorization code out of the link the browser sent back.
///
/// Returns `Err` with the service's own words when the link carries a
/// refusal instead — a user who declined, or a provider that failed — because
/// a window that shows nothing at all after a failed sign-in is a window
/// somebody clicks the button on five more times.
pub fn code_in(link: &str) -> Result<String, String> {
    let parsed = url::Url::parse(link).map_err(|_| format!("That link made no sense: {link}"))?;

    // Supabase puts the code in the query string, and errors in either the
    // query or the fragment depending on which way the flow failed.
    let from_query = |key: &str| {
        parsed
            .query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    };
    let from_fragment = |key: &str| {
        parsed.fragment().and_then(|fragment| {
            url::form_urlencoded::parse(fragment.as_bytes())
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.into_owned())
        })
    };

    if let Some(code) = from_query("code") {
        return Ok(code);
    }
    if let Some(described) =
        from_query("error_description").or_else(|| from_fragment("error_description"))
    {
        return Err(described);
    }
    if let Some(error) = from_query("error").or_else(|| from_fragment("error")) {
        return Err(match error.as_str() {
            "access_denied" => "Sign-in was declined in the browser.".into(),
            other => format!("The browser came back with: {other}"),
        });
    }
    Err("The browser came back without an authorization code.".into())
}

/// Take a new session: remember it, keep the refresh token, tell the window.
///
/// One place, so there is exactly one path by which this app becomes signed
/// in — whether that came from the browser, from a password, or from a
/// refresh an hour later.
pub fn adopt<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session: Session,
) -> Result<Standing, String> {
    use tauri::Manager;

    // The keychain before the state. If storing fails — no Secret Service, a
    // locked keychain — the user is signed in for this run and would be
    // signed out again at the next launch with no explanation. Better to
    // refuse now and say why.
    keychain::store(&session.refresh_token)?;

    // A different person than last time. Everything on this machine was
    // marked as "already sent" to somebody else's account, which is not the
    // same as having been sent to this one — so the stamps go and the whole
    // lot is queued again.
    let auth = app.state::<Auth>();
    let switched = {
        let state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        state
            .session
            .as_ref()
            .map(|s| s.user.id != session.user.id)
            .unwrap_or(false)
    };
    if switched {
        if let Some(store) = app.try_state::<crate::store::Store>() {
            let connection = store.0.lock().unwrap_or_else(|p| p.into_inner());
            let _ = crate::store::notes::forget_sync_state(&connection);
        }
    }

    {
        let mut state = auth.0.lock().unwrap_or_else(|p| p.into_inner());
        state.expires_at = expiry_from(session.expires_in);
        state.session = Some(session);
        state.verifier = None;
    }
    Ok(commands::standing_now(&auth))
}

/// Milliseconds since the epoch.
pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// When an access token should be replaced.
///
/// A minute early, deliberately. A token that is valid for another two
/// seconds is a token that will have expired by the time the request carrying
/// it arrives, and the failure would look like being signed out rather than
/// like a clock.
pub fn expiry_from(expires_in: i64) -> i64 {
    now_ms() + (expires_in.max(60) - 60) * 1000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_challenge_is_the_hash_of_the_verifier_and_not_the_verifier() {
        let (verifier, challenge) = pkce_pair();
        assert_ne!(
            verifier, challenge,
            "the secret was sent as its own challenge"
        );
        // Base64url of a SHA-256 digest, unpadded.
        assert_eq!(challenge.len(), 43, "not a sha-256 digest: {challenge}");
        assert!(!challenge.contains('='), "padded, which the spec forbids");
        assert!(
            !challenge.contains('+') && !challenge.contains('/'),
            "not url-safe"
        );
        // And it must be reproducible from the verifier, or the exchange fails.
        let again = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(challenge, again);
    }

    #[test]
    fn two_sign_ins_never_share_a_secret() {
        let mut seen = std::collections::HashSet::new();
        for _ in 0..1_000 {
            assert!(seen.insert(pkce_pair().0), "a verifier repeated");
        }
    }

    #[test]
    fn the_code_is_read_out_of_the_link() {
        assert_eq!(code_in("tougather://auth?code=abc123").unwrap(), "abc123");
        assert_eq!(
            code_in("tougather://auth?code=abc123&other=1").unwrap(),
            "abc123"
        );
    }

    #[test]
    fn a_declined_sign_in_says_so_instead_of_nothing() {
        let refused = code_in("tougather://auth?error=access_denied").unwrap_err();
        assert!(refused.contains("declined"), "unhelpful: {refused}");
    }

    #[test]
    fn an_error_in_the_fragment_is_found_too() {
        // Which half of the URL carries the failure depends on where the flow
        // broke, and a window that shows nothing is a window somebody presses
        // the button on five more times.
        let refused = code_in("tougather://auth#error_description=Provider%20is%20not%20enabled")
            .unwrap_err();
        assert!(refused.contains("not enabled"), "unhelpful: {refused}");
    }

    #[test]
    fn a_link_with_neither_is_still_an_error() {
        assert!(code_in("tougather://auth").is_err());
        assert!(code_in("not a url at all").is_err());
    }

    #[test]
    fn a_token_is_replaced_before_it_expires_rather_than_after() {
        let at = expiry_from(3600);
        let ahead = at - now_ms();
        assert!(ahead > 0, "already expired");
        assert!(ahead < 3600 * 1000, "renewed only after it stops working");
        // A pathologically short lifetime must not produce a time in the past,
        // which would spin the refresh loop.
        assert!(
            expiry_from(1) >= now_ms(),
            "a short-lived token expired instantly"
        );
    }
}
