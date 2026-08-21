import { useEffect, useState } from "react";
import { Pixels } from "./Pixels";
import type { SyncStanding } from "./notes";

/**
 * The island: one pill that drops in under the header when something is
 * happening, says what, and gets out of the way.
 *
 * The footer used to carry this as a static line, which meant the
 * interesting moment — your words leaving for the account — looked identical
 * to nothing happening. The pill only exists during a moment: saving
 * (amber), saved (green, briefly), sending and landed (brass then green), a
 * dropped file kept, a failure (red, and it stays, because a failure that
 * fades is a failure nobody saw).
 *
 * Built on the notice-during-render pattern rather than effects: the props
 * *are* the events, so the comparison happens where React allows state to be
 * adjusted, and the only effect left is the pair of timers that retract the
 * pill — which is genuinely external, being time.
 */

export interface Flash {
  /** Changes per flash so the same label can fire twice in a row. */
  id: number;
  tone: "amber" | "green" | "brass" | "red";
  label: string;
}

interface Moment {
  tone: "amber" | "green" | "brass" | "red";
  label: string;
  /** How long it stays; absent means until replaced. */
  hold?: number;
  sticky?: boolean;
}

interface Seen {
  saving: boolean;
  failed: string | null;
  flashId: number | undefined;
  waiting: number;
}

export function StatusPill({
  saving,
  failed,
  sync,
  flash,
}: {
  saving: boolean;
  failed: string | null;
  sync: SyncStanding | null;
  flash?: Flash | null;
}) {
  const waiting = sync?.waiting ?? 0;

  const [seen, setSeen] = useState<Seen>({
    saving,
    failed,
    flashId: flash?.id,
    waiting,
  });
  const [moment, setMoment] = useState<Moment | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // Something changed since the last render: decide, in priority order,
  // whether it deserves a pill. Sticky red is only ever replaced by its own
  // cause clearing.
  if (
    saving !== seen.saving ||
    failed !== seen.failed ||
    flash?.id !== seen.flashId ||
    waiting !== seen.waiting
  ) {
    let next: Moment | null | undefined;

    if (failed && failed !== seen.failed) {
      next = { tone: "red", label: "Not saved", sticky: true };
    } else if (!failed && seen.failed) {
      next = null;
    } else if (flash && flash.id !== seen.flashId) {
      next = { tone: flash.tone, label: flash.label, hold: 2000 };
    } else if (saving && !seen.saving) {
      next = { tone: "amber", label: "Saving" };
    } else if (!saving && seen.saving && !failed) {
      next = { tone: "green", label: "Saved", hold: 1400 };
    } else if (waiting > 0 && waiting !== seen.waiting && !saving && !failed) {
      next = { tone: "brass", label: `Sending ${waiting}` };
    } else if (waiting === 0 && seen.waiting > 0 && !failed) {
      next = { tone: "green", label: "In your account", hold: 1800 };
    }

    setSeen({ saving, failed, flashId: flash?.id, waiting });
    if (next !== undefined && !(moment?.sticky && next !== null && failed)) {
      setMoment(next);
      setLeaving(false);
      setEpoch((e) => e + 1);
    }
  }

  useEffect(() => {
    if (!moment?.hold) return;
    const retract = setTimeout(() => setLeaving(true), moment.hold);
    const gone = setTimeout(() => setMoment(null), moment.hold + 260);
    return () => {
      clearTimeout(retract);
      clearTimeout(gone);
    };
  }, [moment, epoch]);

  if (!moment) return null;
  return (
    <div
      className={`island island-${moment.tone}${leaving ? " island-out" : ""}`}
      role="status"
    >
      <Pixels tone={moment.tone} />
      <span className="island-label">{moment.label}</span>
    </div>
  );
}
