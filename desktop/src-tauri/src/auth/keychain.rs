//! Where the refresh token lives.
//!
//! The OS keychain, and nowhere else. A refresh token in a file under the
//! app's data directory is readable by anything running as you — every
//! program you installed, every script you ran once — and it is the one
//! secret worth having, because it mints new access tokens indefinitely.
//! Keychain on macOS, Credential Manager on Windows, Secret Service on Linux.
//!
//! When there is no keychain, this refuses rather than falling back to a
//! file. A headless Linux box with no Secret Service running is a real case,
//! and the honest answer there is "this machine cannot keep you signed in
//! safely" rather than quietly writing the token to disk and saying nothing.

use keyring::Entry;

const SERVICE: &str = "com.tougather.note";
const ACCOUNT: &str = "supabase-refresh-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(describe)
}

/// Turn a keyring failure into something a person can act on.
///
/// The two failures below look identical in the type and need opposite fixes,
/// which is worth the string matching. An earlier version told somebody with
/// a perfectly working but *locked* keyring to go and install one — a message
/// that would have had them chasing the wrong thing for an afternoon. Found
/// by running the app rather than by reading it.
fn describe(error: keyring::Error) -> String {
    let said = error.to_string();

    if said.contains("IsLocked") || said.to_lowercase().contains("locked") {
        return "Your keychain is locked, so signing in can't be saved. Unlock \
                it and try again — on Linux that usually means unlocking your \
                login keyring, on macOS your Keychain."
            .into();
    }

    match error {
        keyring::Error::NoStorageAccess(_) | keyring::Error::PlatformFailure(_) => format!(
            "This computer's keychain can't be reached, so signing in cannot be \
             remembered safely. On Linux that usually means no Secret Service is \
             running — install gnome-keyring or KeePassXC and try again. ({said})"
        ),
        other => format!("The keychain refused: {other}"),
    }
}

pub fn store(refresh_token: &str) -> Result<(), String> {
    entry()?.set_password(refresh_token).map_err(describe)
}

/// The stored token, or `None` when nobody has signed in on this machine.
pub fn read() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(other) => Err(describe(other)),
    }
}

pub fn clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        // Already gone is the desired state, not a failure. Signing out of an
        // app you were never signed into must not show an error.
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(other) => Err(describe(other)),
    }
}

/// Whether this machine looks like it has a keychain at all.
///
/// Best effort, and worth being honest about: reading an entry that was never
/// written succeeds trivially on a keychain that would refuse a *write* — a
/// locked collection being the obvious case. So this catches "there is no
/// keychain here" and not "there is one and it will say no", and the real
/// answer arrives when a sign-in is actually stored. That is acceptable
/// because a failed store is now shown in the window with its reason and the
/// button can be pressed again; it would not be acceptable if the failure
/// were silent.
pub fn available() -> bool {
    entry()
        .map(|e| !matches!(e.get_password(), Err(keyring::Error::NoStorageAccess(_))))
        .unwrap_or(false)
}
