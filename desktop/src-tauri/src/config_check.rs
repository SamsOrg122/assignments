//! What `tauri.conf.json` must keep saying.
//!
//! Every one of these is a line somebody could remove while tidying, and
//! none of them would fail a build — the app would still start, still open a
//! window, and be quietly wrong: visible in the taskbar, or behind the
//! browser, or on screen at every login. A compiled test is the only thing
//! that notices, because there is no way to unit-test "it floats".
//!
//! The permission list is checked for the opposite reason: the danger there
//! is something being *added*. A webview that can reach the filesystem or
//! spawn a process is a very different thing to audit than one that can hide
//! its own window, and that change should not be able to happen quietly
//! either.

#[cfg(test)]
mod tests {
    use serde_json::Value;

    fn config() -> Value {
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json is JSON")
    }

    fn note_window() -> Value {
        let config = config();
        config["app"]["windows"]
            .as_array()
            .expect("there is a windows array")
            .iter()
            .find(|w| w["label"] == "note")
            .expect("the window is labelled `note` — visibility.rs looks it up by that name")
            .clone()
    }

    #[test]
    fn the_window_behaves_like_a_note_and_not_like_an_app() {
        let w = note_window();
        assert_eq!(w["alwaysOnTop"], true, "it would sink behind other windows");
        assert_eq!(w["decorations"], false, "a title bar would make it an app");
        assert_eq!(w["skipTaskbar"], true, "it would sit in the taskbar all day");
        assert_eq!(w["visible"], false, "it would appear uninvited at every start");
        assert_eq!(w["resizable"], true, "the remembered size would be pointless");
    }

    #[test]
    fn it_is_the_size_that_was_asked_for() {
        let w = note_window();
        assert_eq!(w["width"], 340);
        assert_eq!(w["height"], 480);
    }

    #[test]
    fn the_webview_can_only_reach_what_it_needs() {
        let config = config();
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .expect("a policy is set");
        // The bundle is local and stays local until step 4, and even then to
        // one host. A wildcard here would undo that in one character.
        assert!(csp.contains("default-src 'self'"), "no default in the policy");
        assert!(csp.contains("object-src 'none'"));
        assert!(!csp.contains('*'), "the policy has a wildcard in it: {csp}");
        assert!(
            !csp.contains("unsafe-eval"),
            "eval is back on: {csp}"
        );

        assert_eq!(
            config["app"]["security"]["assetProtocol"]["enable"], false,
            "the asset protocol hands the webview a path into the filesystem"
        );
    }

    #[test]
    fn the_frontend_holds_no_dangerous_permissions() {
        let caps: Value = serde_json::from_str(include_str!("../capabilities/default.json"))
            .expect("capabilities/default.json is JSON");
        let granted: Vec<&str> = caps["permissions"]
            .as_array()
            .expect("there is a permission list")
            .iter()
            .filter_map(Value::as_str)
            .collect();

        // Not an exhaustive list of every bad idea — a list of the plugins
        // whose whole purpose is to reach outside the window. If one of these
        // is ever genuinely needed, it should be a decision somebody makes on
        // purpose, with this test in the diff.
        for danger in ["fs:", "shell:", "http:", "process:", "updater:"] {
            assert!(
                !granted.iter().any(|p| p.starts_with(danger)),
                "the webview was granted `{danger}…` — {granted:?}"
            );
        }
    }

    #[test]
    fn signing_is_off_but_the_shape_is_ready_for_it() {
        let config = config();
        // Deliberately unsigned for now. What must not happen is the fields
        // disappearing, because then turning signing on later means guessing
        // the schema again rather than filling in two blanks.
        let macos = &config["bundle"]["macOS"];
        assert!(macos.get("signingIdentity").is_some(), "macOS signing slot is gone");
        assert!(macos.get("entitlements").is_some(), "macOS entitlements slot is gone");
        let windows = &config["bundle"]["windows"];
        assert!(
            windows.get("certificateThumbprint").is_some(),
            "Windows signing slot is gone"
        );
        assert!(
            windows.get("timestampUrl").is_some(),
            "a signed build with no timestamp expires with the certificate"
        );
    }
}
