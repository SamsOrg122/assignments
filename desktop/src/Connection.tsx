import { useEffect, useState } from "react";
import {
  resetSite,
  setSite,
  siteAddress,
  type SiteAddress,
  type Standing,
} from "./auth";

/**
 * Which tougather.com this app is talking to.
 *
 * Here because the address used to be baked in at build time, and the first
 * build went out pointing at a domain that was not serving yet. The window
 * said "Can't reach tougather.com" and there was nothing anybody could do
 * about it from inside the app — the real reason was on stderr, where nobody
 * looks, and the only fix was a new build.
 *
 * So: the reason, in the window, and a field to point it somewhere else.
 */
export function Connection({
  problem,
  onChanged,
  onClose,
}: {
  problem: string | null;
  onChanged: (next: Standing) => void;
  onClose: () => void;
}) {
  const [site, setSiteState] = useState<SiteAddress | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    siteAddress()
      .then((now) => {
        setSiteState(now);
        setDraft(now.address);
      })
      .catch(() => setSiteState(null));
  }, []);

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    try {
      onChanged(await setSite(draft));
      onClose();
    } catch (error) {
      setRefused(String(error));
    } finally {
      setBusy(false);
    }
  };

  const back = async () => {
    setBusy(true);
    setRefused(null);
    try {
      onChanged(await resetSite());
      const now = await siteAddress();
      setSiteState(now);
      setDraft(now.address);
    } catch (error) {
      setRefused(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="flex">
        <p className="lead">Connection</p>
        <button type="button" className="chip push" onClick={onClose}>
          Back
        </button>
      </div>

      {/* The reason, verbatim. A generic "can't reach it" is what sent
          somebody looking at DNS when the answer was a missing database. */}
      {problem ? (
        <p className="bad" role="alert">
          {problem}
        </p>
      ) : null}

      <form className="password" onSubmit={apply}>
        <label>
          <span>This app talks to</span>
          <input
            type="text"
            value={draft}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="tougather.com"
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button type="submit" className="wide" disabled={busy}>
          {busy ? "Trying…" : "Use this address"}
        </button>
      </form>

      {refused ? (
        <p className="bad" role="alert">
          {refused}
        </p>
      ) : null}

      {site && !site.default ? (
        <button type="button" className="link" onClick={() => void back()}>
          Back to the default
        </button>
      ) : null}

      <p className="quiet">
        Changing this signs you out: a different deployment is a different set
        of accounts. Your notes stay on this computer either way.
      </p>
    </div>
  );
}
