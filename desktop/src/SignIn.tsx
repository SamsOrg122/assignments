import { useState } from "react";
import {
  beginSignIn,
  providerName,
  signInWithPassword,
  type Standing,
} from "./auth";

/**
 * The screen before the note.
 *
 * Signing in happens in the user's own browser, where they can see the
 * address bar and are usually signed in already. What this window sends there
 * is a hash of a secret it keeps; whoever intercepts the reply holds half a
 * pair and can do nothing with it. That is why no key with power over the
 * database has to exist anywhere for this to work.
 *
 * The password form below is the fallback, not the offer. A deployment with
 * no provider configured has no browser flow to delegate to, and refusing to
 * let those people in would be worse than asking them to type a password into
 * a window they installed.
 */
export function SignIn({
  standing,
  onSignedIn,
}: {
  standing: Standing;
  onSignedIn: (next: Standing) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  /*
   * A failure that arrives from outside this window.
   *
   * The browser comes back through a link this window never sees; Rust
   * finishes the sign-in, or fails to, and says so through the prop. Two
   * earlier attempts got this wrong in opposite directions — one read the
   * prop once at mount, so the panel sat on "Waiting for your browser…"
   * forever with the reason one prop away; the next synced it in an effect,
   * which is the cascade React's own lint refuses.
   *
   * This is the pattern React documents for exactly this: notice the prop
   * changed *while rendering*, and adjust. No effect, no cascade, and the
   * message is on screen in the same paint as the change.
   */
  const [seen, setSeen] = useState(standing.problem);
  if (seen !== standing.problem) {
    setSeen(standing.problem);
    setMine(null);
    if (standing.problem) setBusy(null);
  }

  // What is shown: whatever came from outside, or whatever happened in here.
  const problem = standing.problem ?? mine;
  const setProblem = setMine;

  const viaBrowser = async (provider: string) => {
    setProblem(null);
    setBusy(provider);
    try {
      await beginSignIn(provider);
      // Deliberately stays "waiting": the browser has the user now, and the
      // window has nothing useful to say until the link comes back. Rust
      // raises this window again when it does.
    } catch (error) {
      setProblem(String(error));
      setBusy(null);
    }
  };

  const viaPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setBusy("password");
    try {
      onSignedIn(await signInWithPassword(email, password));
    } catch (error) {
      setProblem(String(error));
    } finally {
      setBusy(null);
      setPassword("");
    }
  };

  if (!standing.can_remember)
    return (
      <div className="gate">
        <p className="lead">This computer has no keychain.</p>
        <p className="quiet">
          Signing in can&apos;t be remembered safely here, so the app won&apos;t ask you
          to. On Linux that usually means no Secret Service is running — install
          gnome-keyring or KeePassXC and start the app again.
        </p>
        <p className="quiet">Your notes are still kept on this computer.</p>
      </div>
    );

  if (!standing.configured)
    return (
      <div className="gate">
        <p className="lead">Can&apos;t reach tougather.com.</p>
        <p className="quiet">
          {problem ?? "The app will keep trying. Notes you write are saved here meanwhile."}
        </p>
      </div>
    );

  return (
    <div className="gate door">
      <Face />

      <div className="door-body">
        <h1 className="door-title">Sign in</h1>
        <p className="quiet">
          So your notes are in your account rather than only on this computer.
        </p>

      {standing.providers.length > 0 ? (
        <>
          <div className="providers">
            {standing.providers.map((provider) => (
              <button
                key={provider}
                type="button"
                className="wide"
                disabled={busy !== null}
                onClick={() => void viaBrowser(provider)}
              >
                {busy === provider
                  ? "Waiting for your browser…"
                  : `Continue with ${providerName(provider)}`}
              </button>
            ))}
          </div>
          <p className="quiet">
            Your browser opens at tougather.com. Nothing you type there comes
            through this window.
          </p>
        </>
      ) : (
        <form className="password" onSubmit={viaPassword}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="wide" disabled={busy !== null}>
            {busy === "password" ? "Signing in…" : "Sign in"}
          </button>
          <p className="quiet">
            This deployment has no sign-in provider configured, so there is no
            browser to hand you to.
          </p>
        </form>
      )}

      {problem ? (
        <p className="bad" role="alert">
          {problem}
        </p>
      ) : null}
      </div>
    </div>
  );
}

/**
 * The mark, as the web sign-in screen wears it.
 *
 * Drawn rather than imported, for the same reason everything else in this
 * window is: the bundle must not reach the network, and at this size a
 * raster would need three exports and still soften. Anisotropic on purpose
 * — the vertical arm longest, the diagonals shortest — which is the whole
 * character of it; equal arms would be a snowflake.
 */
function Face() {
  return (
    <div className="door-face" aria-hidden="true">
      <span className="door-rule door-rule-h" />
      <span className="door-rule door-rule-v" />
      <svg
        className="door-mark"
        viewBox="-120 -120 240 240"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      >
        <path d="M0 -112V112" />
        <path d="M-92 0H92" />
        <path d="M-45 -45L45 45" />
        <path d="M45 -45L-45 45" />
      </svg>
    </div>
  );
}
