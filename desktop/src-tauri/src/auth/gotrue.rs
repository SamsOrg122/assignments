//! The handful of HTTP calls that make up signing in.
//!
//! Supabase's auth service speaks a small, stable API, and calling it from
//! here rather than running its JavaScript client in the webview buys three
//! things worth the extra hundred lines:
//!
//!  - The session never exists in JavaScript, so a bug in the window cannot
//!    read it out.
//!  - The window's content policy stays `default-src 'self'` with no network
//!    exceptions at all, because the window makes no network calls.
//!  - Step 4's sync lives next to the store, in Rust, which is where a queue
//!    that must survive the window being closed belongs anyway.
//!
//! Nothing here is invented: this is the PKCE authorization-code flow, and
//! the password grant beside it for accounts with no provider configured.

use serde::{Deserialize, Serialize};

/// Where the app was pointed, and with what key.
///
/// Fetched from `/api/config` at startup rather than baked in, exactly as the
/// web app does it — so one deployment's desktop build is not hard-wired to
/// one database, and a key is never compiled into a binary handed to people.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub url: String,
    pub anon_key: String,
    /// Providers this deployment has actually turned on. An offer to
    /// "Continue with Google" on a deployment where Google was never enabled
    /// is a dead end dressed up as a feature.
    pub providers: Vec<String>,
}

/// A signed-in session, as the auth service describes it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    /// Seconds from now until the access token stops working.
    #[serde(default)]
    pub expires_in: i64,
    #[serde(default)]
    pub user: User,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct User {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub email: Option<String>,
}

/// What the service says when it refuses.
#[derive(Debug, Deserialize)]
struct Refusal {
    #[serde(default)]
    error_description: Option<String>,
    #[serde(default)]
    msg: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

impl Refusal {
    fn into_sentence(self) -> String {
        self.error_description
            .or(self.msg)
            .or(self.message)
            .or(self.error)
            .unwrap_or_else(|| "The sign-in service refused, without saying why.".into())
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        // A sign-in that hangs forever looks exactly like one that is about to
        // work, and the window would sit on "Signing in…" until it was killed.
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(concat!("TougatherNote/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("could not start the network client: {e}"))
}

/// Read the deployment's public configuration.
pub async fn config(site: &str) -> Result<Config, String> {
    #[derive(Deserialize)]
    struct Payload {
        supabase: Option<Keys>,
        #[serde(default)]
        auth: Auth,
    }
    #[derive(Deserialize)]
    struct Keys {
        url: String,
        #[serde(rename = "anonKey")]
        anon_key: String,
    }
    #[derive(Deserialize, Default)]
    struct Auth {
        #[serde(default)]
        providers: Vec<String>,
    }

    let response = client()?
        .get(format!("{}/api/config", site.trim_end_matches('/')))
        .send()
        .await
        .map_err(|e| format!("Could not reach {site}: {e}"))?;

    let payload: Payload = response
        .json()
        .await
        .map_err(|e| format!("{site} answered with something unreadable: {e}"))?;

    let keys = payload.supabase.ok_or_else(|| {
        format!("{site} is running without a database configured, so there is no account to sign in to.")
    })?;

    Ok(Config {
        url: keys.url,
        anon_key: keys.anon_key,
        providers: payload.auth.providers,
    })
}

/// The URL to open in the user's own browser to begin signing in.
///
/// `code_challenge` is the public half of a secret this app keeps. Whoever
/// receives the authorization code afterwards can only exchange it by
/// presenting the other half — so an authorization code intercepted on its
/// way back, in a log or by another app that registered the same URL scheme,
/// is worth nothing on its own. That is the entire point of PKCE, and it is
/// why this flow needs no privileged key anywhere.
pub fn browser_url(config: &Config, provider: &str, challenge: &str, redirect: &str) -> String {
    let base = config.url.trim_end_matches('/');
    format!(
        "{base}/auth/v1/authorize\
         ?provider={provider}\
         &redirect_to={redirect}\
         &code_challenge={challenge}\
         &code_challenge_method=S256",
        provider = urlencoding(provider),
        redirect = urlencoding(redirect),
        challenge = urlencoding(challenge),
    )
}

/// Percent-encode a query value. Small enough not to need a crate, and the
/// alphabet is the unreserved set from RFC 3986 exactly.
fn urlencoding(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

async fn token(
    config: &Config,
    grant: &str,
    body: serde_json::Value,
) -> Result<Session, String> {
    let response = client()?
        .post(format!(
            "{}/auth/v1/token?grant_type={grant}",
            config.url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach the sign-in service: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("The sign-in service answered with nothing readable: {e}"))?;

    if !status.is_success() {
        return Err(serde_json::from_str::<Refusal>(&text)
            .map(Refusal::into_sentence)
            .unwrap_or_else(|_| format!("The sign-in service refused ({status}).")));
    }

    serde_json::from_str(&text)
        .map_err(|e| format!("The sign-in service sent a session this app could not read: {e}"))
}

/// Turn the authorization code from the browser into a session.
pub async fn exchange(config: &Config, code: &str, verifier: &str) -> Result<Session, String> {
    token(
        config,
        "pkce",
        serde_json::json!({ "auth_code": code, "code_verifier": verifier }),
    )
    .await
}

/// For deployments with no provider configured, where a password is the only
/// way in. Typed into this window rather than the browser, which is worse and
/// is why it is the fallback rather than the offer.
pub async fn password(config: &Config, email: &str, password: &str) -> Result<Session, String> {
    token(
        config,
        "password",
        serde_json::json!({ "email": email, "password": password }),
    )
    .await
}

/// Trade a stored refresh token for a working session.
pub async fn refresh(config: &Config, refresh_token: &str) -> Result<Session, String> {
    token(
        config,
        "refresh_token",
        serde_json::json!({ "refresh_token": refresh_token }),
    )
    .await
}

/// End the session on the server as well as here.
///
/// Best effort on purpose: if this fails, the local token is still thrown
/// away, because a sign-out that leaves somebody signed in because the
/// network was down is not a sign-out.
pub async fn sign_out(config: &Config, access_token: &str) {
    let Ok(client) = client() else { return };
    let _ = client
        .post(format!("{}/auth/v1/logout", config.url.trim_end_matches('/')))
        .header("apikey", &config.anon_key)
        .bearer_auth(access_token)
        .send()
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config {
            url: "https://example.supabase.co/".into(),
            anon_key: "anon".into(),
            providers: vec!["google".into()],
        }
    }

    #[test]
    fn the_browser_url_carries_the_challenge_and_the_method() {
        let url = browser_url(&config(), "google", "abc123", "tougather://auth");
        assert!(url.contains("code_challenge=abc123"), "{url}");
        assert!(url.contains("code_challenge_method=S256"), "{url}");
        assert!(url.contains("provider=google"), "{url}");
        // The trailing slash on the configured URL must not become a double
        // slash in the path — some gateways treat that as a different route.
        assert!(!url.contains("co//auth"), "{url}");
    }

    #[test]
    fn the_redirect_is_encoded_rather_than_pasted_in() {
        let url = browser_url(&config(), "google", "c", "tougather://auth?x=1");
        assert!(url.contains("redirect_to=tougather%3A%2F%2Fauth%3Fx%3D1"), "{url}");
        // Otherwise its `?` would end the query string and the challenge
        // would silently never arrive.
        assert!(url.contains("code_challenge=c"), "{url}");
    }

    #[test]
    fn a_refusal_is_read_out_rather_than_guessed_at() {
        let refusal: Refusal =
            serde_json::from_str(r#"{"error_description":"Invalid login credentials"}"#).unwrap();
        assert_eq!(refusal.into_sentence(), "Invalid login credentials");
        // GoTrue is not consistent about which field it uses.
        let other: Refusal = serde_json::from_str(r#"{"msg":"Email not confirmed"}"#).unwrap();
        assert_eq!(other.into_sentence(), "Email not confirmed");
        let empty: Refusal = serde_json::from_str("{}").unwrap();
        assert!(empty.into_sentence().contains("without saying why"));
    }

    #[test]
    fn a_session_missing_its_optional_parts_still_reads() {
        // Not every grant returns a user object, and a sign-in that fails to
        // parse because of a field nobody needs is a sign-in that fails.
        let session: Session =
            serde_json::from_str(r#"{"access_token":"a","refresh_token":"r"}"#).unwrap();
        assert_eq!(session.refresh_token, "r");
        assert_eq!(session.user.email, None);
    }
}
