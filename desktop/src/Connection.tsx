import { useEffect, useState } from "react";
import {
  resetSite,
  retrySite,
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
 * What it leads with matters. Almost everybody who ever opens this has a
 * deployment mid-build, a laptop that has just woken, or a minute of no wifi
 * — so the first thing is "Try again". The address field is underneath, for
 * the rare case where the app is genuinely pointed at the wrong place;
 * offering that first is handing somebody a spanner because their car will
 * not start.
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
  const [busy, setBusy] = useState<"retry" | "address" | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [showAddress, setShowAddress] = useState(false);

  useEffect(() => {
    siteAddress()
      .then((now) => {
        setSiteState(now);
        setDraft(now.address);
      })
      .catch(() => setSiteState(null));
  }, []);

  const again = async () => {
    setBusy("retry");
    setRefused(null);
    try {
      onChanged(await retrySite());
      onClose();
    } catch (error) {
      setRefused(String(error));
    } finally {
      setBusy(null);
    }
  };

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("address");
    setRefused(null);
    try {
      onChanged(await setSite(draft));
      onClose();
    } catch (error) {
      setRefused(String(error));
    } finally {
      setBusy(null);
    }
  };

  const back = async () => {
    setBusy("address");
    setRefused(null);
    try {
      onChanged(await resetSite());
      const now = await siteAddress();
      setSiteState(now);
      setDraft(now.address);
    } catch (error) {
      setRefused(String(error));
    } finally {
      setBusy(null);
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

      <button
        type="button"
        className="wide"
        disabled={busy !== null}
        onClick={() => void again()}
      >
        {busy === "retry" ? "Trying…" : "Try again"}
      </button>

      <p className="quiet">
        Your notes are safe on this computer meanwhile, and go up on their own
        as soon as this works.
      </p>

      {refused ? (
        <p className="bad" role="alert">
          {refused}
        </p>
      ) : null}

      {showAddress ? (
        <>
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
            <button type="submit" className="wide" disabled={busy !== null}>
              {busy === "address" ? "Trying…" : "Use this address"}
            </button>
          </form>

          {site && !site.default ? (
            <button
              type="button"
              className="link"
              onClick={() => void back()}
            >
              Back to the default
            </button>
          ) : null}

          <p className="quiet">
            Changing this signs you out: a different deployment is a different
            set of accounts. Your notes stay on this computer either way.
          </p>
        </>
      ) : (
        <button
          type="button"
          className="link"
          onClick={() => setShowAddress(true)}
        >
          This app is pointed at the wrong place
        </button>
      )}

    </div>
  );
}
