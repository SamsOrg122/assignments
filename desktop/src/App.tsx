import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { HOTKEY_LABEL } from "./platform";

/**
 * Step one's window: no note yet, on purpose.
 *
 * What is here is everything you can only judge by looking at it — that the
 * window stays above other apps, that it comes back where you left it, that
 * the hotkey and the tray both reach it, that dragging it works without a
 * title bar. Writing the note UI first would have hidden all of that behind a
 * textarea.
 */
export function App() {
  const [autostart, setAutostart] = useState<boolean | null>(null);

  useEffect(() => {
    // Read from the OS rather than from anything we remember, so what is on
    // screen is what is actually configured.
    isEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);

  return (
    <div className="note">
      {/* No decorations means no title bar to grab, so the header is the
          handle. `data-tauri-drag-region` is what makes a plain div draggable
          — without it the window could only be moved with the keyboard. */}
      <header className="bar" data-tauri-drag-region>
        <span className="mark" aria-hidden="true" />
        <span className="name" data-tauri-drag-region>
          Tougather note
        </span>
        <button
          type="button"
          className="put-away"
          title={`Put away (${HOTKEY_LABEL})`}
          onClick={() => getCurrentWindow().hide()}
        >
          <span aria-hidden="true">–</span>
          <span className="sr-only">Put away</span>
        </button>
      </header>

      <main className="body">
        <p className="lead">The window is up.</p>
        <ul className="checks">
          <li>
            <kbd>{HOTKEY_LABEL}</kbd> shows and hides it, from any app.
          </li>
          <li>The tray icon does the same, and holds Quit.</li>
          <li>It stays above other windows, and follows you between desktops.</li>
          <li>Drag the bar to move it; drag an edge to resize.</li>
          <li>Where you leave it is where it comes back.</li>
        </ul>

        <p className="state">
          Open at login:{" "}
          <strong>
            {autostart === null ? "unknown" : autostart ? "on" : "off"}
          </strong>{" "}
          — change it in the tray menu.
        </p>
      </main>

      <footer className="foot">
        Step 1 of 5. Nothing is saved yet — the local note store is next.
      </footer>
    </div>
  );
}
