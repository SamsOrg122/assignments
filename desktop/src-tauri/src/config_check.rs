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
        assert_eq!(
            w["skipTaskbar"], true,
            "it would sit in the taskbar all day"
        );
        /*
         * Inverted, and stated rather than deleted.
         *
         * This asserted `visible: false` while the app was a note you summon
         * with a hotkey, and that was right then. It is wrong now: the window
         * is a 44-pixel bar that is the app's entire presence, and `false`
         * here means somebody installs it and nothing appears on screen,
         * forever, unless they find the tray icon unaided. That is what
         * shipped for six versions.
         */
        assert_eq!(
            w["visible"], true,
            "nothing would be on screen after installing it"
        );
        assert_eq!(
            w["resizable"], true,
            "the remembered size would be pointless"
        );
    }

    /// The collapsed height, and the one number two files have to agree on.
    ///
    /// `visibility::BAR_HEIGHT` resizes the window back to this after a sheet
    /// closes, and `styles.css` fixes `.bar` at the same number. If the config
    /// and the constant drift apart the bar either clips its own buttons or
    /// floats a strip of empty canvas under itself — neither of which fails a
    /// build, and both of which look like a rendering bug rather than a
    /// three-line disagreement.
    #[test]
    fn it_rests_as_a_bar_and_not_as_a_window() {
        let w = note_window();
        assert_eq!(
            w["height"],
            crate::visibility::BAR_HEIGHT as u64,
            "the resting height and visibility::BAR_HEIGHT disagree"
        );
        assert_eq!(w["width"], 460, "four words and a dot need about this much");
        assert_eq!(
            w["minHeight"],
            crate::visibility::BAR_HEIGHT as u64,
            "a minimum above the bar height would stop it collapsing"
        );
    }

    /// What is allowed on the bar, and the argument for each of them.
    ///
    /// `slots.json` is read here with `include_str!` exactly as
    /// `capabilities/default.json` is below, and the frontend renders that
    /// same file and nothing else. So a new slot cannot arrive as a button
    /// somebody added — it arrives as a change to this file, with a failing
    /// count and three questions to answer in the commit message.
    ///
    /// The three questions are docs/desktop.md's admission rule, and the
    /// sidebar in the web app reaching ten rows is what happens without one.
    #[test]
    fn every_slot_earned_its_place() {
        let slots: Value =
            serde_json::from_str(include_str!("../slots.json")).expect("slots.json is JSON");
        let list = slots["slots"].as_array().expect("there is a slots array");
        let max = slots["maxSlots"].as_u64().expect("maxSlots is a number");

        assert!(
            list.len() as u64 <= max,
            "{} slots on a bar that allows {max}. A fifth is a decision, not a commit.",
            list.len()
        );

        for slot in list {
            let id = slot["id"].as_str().expect("a slot has an id");
            for question in ["intake", "away", "lands"] {
                let answer = slot[question].as_str().unwrap_or("");
                assert!(
                    answer.len() > 20,
                    "slot `{id}` does not answer `{question}`. \
                     See the rule at the top of slots.json: an intake, at a \
                     moment the browser is not on screen, landing on a page \
                     that already exists."
                );
            }
        }
    }

    #[test]
    fn the_webview_can_only_reach_what_it_needs() {
        let config = config();
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .expect("a policy is set");
        // The bundle is local and stays local until step 4, and even then to
        // one host. A wildcard here would undo that in one character.
        assert!(
            csp.contains("default-src 'self'"),
            "no default in the policy"
        );
        assert!(csp.contains("object-src 'none'"));
        assert!(!csp.contains('*'), "the policy has a wildcard in it: {csp}");
        assert!(!csp.contains("unsafe-eval"), "eval is back on: {csp}");

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
    fn the_linux_desktop_entry_can_receive_a_url() {
        // The one that would break sign-in on Linux and nowhere else.
        //
        // A `.desktop` file that claims `x-scheme-handler/tougather` but has
        // no `%u` in its Exec line is launched *without* the URL when the
        // browser hands one over — the app opens, having been told nothing,
        // and the user is left looking at a sign-in screen that did not
        // change. Tauri's own template has no `%u`; this was found by
        // unpacking a built .deb and reading the file inside it.
        let template = include_str!("../tougather-note.desktop");
        assert!(
            template.contains("{{exec}} %u"),
            "the desktop entry cannot receive a URL:\n{template}"
        );
        assert!(
            template.contains("MimeType={{mime_type}}"),
            "the desktop entry does not claim the scheme at all"
        );

        // And the config has to point at it, or the template is a file
        // nobody reads.
        let config = config();
        let linux = &config["bundle"]["linux"];
        assert_eq!(
            linux["deb"]["desktopTemplate"], "tougather-note.desktop",
            "the .deb falls back to Tauri's template"
        );
        assert_eq!(
            linux["rpm"]["desktopTemplate"], "tougather-note.desktop",
            "the .rpm falls back to Tauri's template"
        );
    }

    #[test]
    fn the_url_scheme_is_the_one_the_app_waits_for() {
        // `REDIRECT` in auth/mod.rs and this list have to agree. If they
        // drift, the browser goes somewhere the OS has never heard of.
        let config = config();
        let schemes = config["plugins"]["deep-link"]["desktop"]["schemes"]
            .as_array()
            .expect("a scheme list");
        assert!(
            schemes.iter().any(|s| s == "tougather"),
            "the bundle does not register the scheme sign-in comes back on"
        );
        assert!(
            crate::auth::REDIRECT.starts_with("tougather://"),
            "the app waits on a different scheme than the bundle registers"
        );
    }

    #[test]
    fn signing_is_off_but_the_shape_is_ready_for_it() {
        let config = config();
        // Deliberately unsigned for now. What must not happen is the fields
        // disappearing, because then turning signing on later means guessing
        // the schema again rather than filling in two blanks.
        let macos = &config["bundle"]["macOS"];
        assert!(
            macos.get("signingIdentity").is_some(),
            "macOS signing slot is gone"
        );
        assert!(
            macos.get("entitlements").is_some(),
            "macOS entitlements slot is gone"
        );
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
