"use client";

/**
 * The first time somebody arrives.
 *
 * A short curtain: the mark, the name, a horizon, and then the panel lifts
 * off the page. It plays once ever and then never again, which is the only
 * thing that makes an intro tolerable — the second time you see one it is
 * already a thing standing between you and the site.
 *
 * Three rules it keeps, and all three are the reason intros usually deserve
 * their bad reputation:
 *
 *  - **It cannot trap anybody.** Any key, any click, any scroll lifts it
 *    immediately. Nothing here waits for an animation to finish before the
 *    site becomes usable.
 *  - **It is silent for anybody who asked for that.** `prefers-reduced-motion`
 *    skips it entirely, and marks it seen so it is not waiting for them on a
 *    machine where they later turn the setting off.
 *  - **It is not in the markup.** It mounts after the page does, so a crawler,
 *    a reader mode and a slow connection all get the page itself, and there
 *    is no hydration difference to log about.
 *
 * The page underneath is never hidden or made inert — it is loading and
 * laying out behind the curtain the whole time, so lifting it reveals a page
 * that is already finished rather than starting one.
 */

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";

/**
 * Cleared by "Forget this browser", along with everything else under the
 * `assignments:` prefix — so somebody who erases themselves gets the arrival
 * again, which is the right answer for a browser that is being handed back.
 */
const SEEN = "assignments:arrived";

/** Long enough to read the name, short enough not to be a loading screen. */
const PLAY_MS = 1750;
/** The lift itself. */
const LIFT_MS = 760;

type Phase = "playing" | "lifting";

export function Arrival() {
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    // Storage throws in a locked-down browser, and an intro is not worth a
    // broken page: anything unexpected means treat it as already seen.
    let seen = true;
    let calm = false;
    try {
      seen = window.localStorage.getItem(SEEN) === "1";
      calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      seen = true;
    }

    const remember = () => {
      try {
        window.localStorage.setItem(SEEN, "1");
      } catch {
        /* it plays again next time; nothing else breaks */
      }
    };

    if (seen) return;
    remember();
    if (calm) return;

    // Off the effect body: a synchronous setState here cascades, and the
    // curtain is not something anything is waiting on.
    void Promise.resolve().then(() => setPhase("playing"));
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const lift = () => setPhase("lifting");
    const timer = setTimeout(lift, PLAY_MS);

    // Everything a person might do to say "get on with it".
    window.addEventListener("keydown", lift, { once: true });
    window.addEventListener("pointerdown", lift, { once: true });
    window.addEventListener("wheel", lift, { once: true, passive: true });
    window.addEventListener("touchstart", lift, { once: true, passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", lift);
      window.removeEventListener("pointerdown", lift);
      window.removeEventListener("wheel", lift);
      window.removeEventListener("touchstart", lift);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "lifting") return;
    // Unmounted rather than left at `translateY(-100%)`: a full-screen fixed
    // element that is merely off-screen still costs a compositor layer, and
    // still catches a stray pointer event on some browsers.
    const done = setTimeout(() => setPhase(null), LIFT_MS);
    return () => clearTimeout(done);
  }, [phase]);

  if (phase === null) return null;

  return (
    <div
      aria-hidden="true"
      data-phase={phase}
      className="arrival"
      style={{ ["--arrival-lift" as string]: `${LIFT_MS}ms` }}
    >
      <div className="arrival-plate">
        <Logo size={44} className="arrival-mark text-white" />
        <span className="arrival-rule" />
        <span className="arrival-name">Tougather</span>
      </div>

      {/* The horizon. It is the last thing to go, so the curtain leaves a
          line of evening behind it as it rises. */}
      <span className="arrival-horizon" />
    </div>
  );
}
