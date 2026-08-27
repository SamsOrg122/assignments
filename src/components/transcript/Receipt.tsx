"use client";

/**
 * What was just made, and the words it was made from.
 *
 * A model listened to a meeting and then wrote into somebody's calendar. That
 * is a useful thing and an alarming one, and the difference between the two is
 * entirely this panel: it opens the moment the landing finishes, it lists
 * every single row that was created — the document, the table, each event,
 * each task, each deadline — and against each one it puts the sentence from
 * the transcript that produced it. Nothing here is a summary of what happened.
 * It is the whole list.
 *
 * Every row can be taken back out in one press, and taking it out actually
 * takes it out: `unland()` deletes the event from the agenda and tombstones it
 * in the account, deletes the assignment, removes the blocks, throws away the
 * document. A receipt whose "remove" only hid a row would be worse than no
 * receipt, because it would teach somebody that the list is the truth when it
 * is not.
 *
 * It also says, once and without apologising for the feature, what a
 * transcript is: speech recognition. It mishears names, numbers and dates, and
 * the model can only work from what it was given. That sentence belongs here
 * rather than on the recording bar because this is the moment somebody is
 * actually deciding whether to trust what they are reading.
 *
 * The panel hosts itself in its own React root — see `hostReceipt()` at the
 * foot of the file — because the shell that mounts the recording bar has no
 * slot for it, and a receipt nobody mounts is the same as no receipt. It
 * deliberately offers no link out to the document: this root would survive a
 * client navigation but not a page load, and a link that carried the undo away
 * with it is exactly the trap the panel exists to avoid. The document is in
 * the library under the label `transcript`, which the panel says in words.
 */

import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import {
  closeReceipt,
  unland,
  useReceipt,
  type LandedItem,
  type LandedKind,
} from "@/lib/transcript/land";

const ICONS: Record<LandedKind, Parameters<typeof Icon>[0]["name"]> = {
  document: "file",
  figures: "table",
  event: "calendar",
  task: "check",
  assignment: "list",
};

export function Receipt() {
  const landing = useReceipt((s) => s.landing);
  const open = useReceipt((s) => s.open);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Focus moves here on its own: this panel is the consequence of an action
    // somebody took a second ago, and Escape has to close it whether or not
    // they clicked in it first.
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeReceipt();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open || !landing) return null;

  const made = landing.items.filter((item) => !item.withheld);
  const kept = made.filter((item) => !item.removed).length;
  const removed = made.length - kept;
  const filed = landing.items.filter(
    (item) => item.kind === "event" || item.kind === "task",
  );
  const deadlines = landing.items.filter((item) => item.kind === "assignment");
  const held = landing.items.filter((item) => item.withheld);

  return (
    <div className="fixed inset-0 z-[95] flex justify-end print:hidden">
      <button
        type="button"
        aria-label="Close"
        onClick={closeReceipt}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label="What was made from the recording"
        className="relative flex h-full w-full max-w-[420px] flex-col border-l border-line bg-surface-2 outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-medium text-fg">
              {landing.title}
            </h2>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              {landing.length} · {formatNumber(landing.words)} words · {kept}{" "}
              {kept === 1 ? "thing" : "things"} made
            </p>
          </div>
          <button
            type="button"
            onClick={closeReceipt}
            aria-label="Close"
            className="-mr-1 rounded-sm p-1 text-fg-subtle hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {landing.simulated && (
            <p
              className="mb-4 rounded-sm border border-line-strong px-3 py-2 text-[11.5px] leading-relaxed text-warn"
              role="alert"
            >
              This transcript was simulated. Nobody said any of it, so nothing
              was written into your agenda, your assignments or your account —
              everything the model read out of it is listed below, unfiled. The
              document was still made, and says on its first line and at the
              head of its transcript that none of this was heard.
            </p>
          )}

          <p className="text-[11.5px] leading-relaxed text-fg-muted">
            This is speech recognition, not a court record. It mishears names,
            numbers and dates, and everything below was read out of what it
            heard. Each row shows the line it came from — check them, and take
            out anything that is wrong.
          </p>

          <Section title="In your library">
            {landing.items
              .filter((item) => item.kind === "document" || item.kind === "figures")
              .map((item) => (
                <Row key={item.id} item={item} />
              ))}
          </Section>

          {filed.length > 0 && (
            <Section title="In your agenda">
              {filed.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </Section>
          )}

          {deadlines.length > 0 && (
            <Section title="In your assignments">
              {deadlines.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </Section>
          )}

          {held.length > 0 && (
            <Section
              title="Found in the words, and not filed"
              note={held[0].reason}
            >
              {held.map((item) => (
                <Row key={item.id} item={item} said={held[0].reason} />
              ))}
            </Section>
          )}

          {landing.dropped.length > 0 && (
            <Section
              title="Heard, and thrown away"
              note="These did not survive checking. Nothing was guessed at to fill the gap, so if one of them was real it is not written down anywhere and you will have to add it yourself."
            >
              {landing.dropped.map((fact, i) => (
                <li
                  key={`${fact.title}-${i}`}
                  className="border-b border-line py-2 text-[11.5px] leading-relaxed text-fg-muted last:border-b-0"
                >
                  <span className="text-fg">{fact.title}</span> — {fact.why}
                </li>
              ))}
            </Section>
          )}

          {landing.skipped > 0 && (
            <p className="mt-5 text-[11px] leading-relaxed text-warn">
              The recording was too long to send whole. The middle{" "}
              {formatNumber(landing.skipped)} characters of it were
              never shown to the model, so anything decided in that stretch is
              not in this list.
            </p>
          )}

          {landing.model && (
            <p className="mt-5 text-[11px] leading-relaxed text-fg-subtle">
              Read by {landing.model}.
            </p>
          )}
        </div>

        <div className="border-t border-line p-4">
          <button
            type="button"
            onClick={closeReceipt}
            className="w-full rounded-sm bg-accent px-3 py-2 text-[12px] font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            Done
          </button>
          <p className="mt-2 text-[10.5px] leading-relaxed text-fg-subtle">
            {removed > 0
              ? `${removed} removed. Removing deletes the thing itself, here and in your account — closing this panel changes nothing further.`
              : "Removing deletes the thing itself, here and in your account. Closing this panel leaves everything above exactly where it is."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <span className="label-mono text-fg-subtle">{title}</span>
      {note && (
        <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">{note}</p>
      )}
      <ul className="mt-1 grid">{children}</ul>
    </div>
  );
}

function Row({ item, said }: { item: LandedItem; said?: string }) {
  return (
    <li className="border-b border-line py-2.5 last:border-b-0">
      <div className="flex items-start gap-2">
        <Icon
          name={ICONS[item.kind]}
          size={12}
          className="mt-[3px] shrink-0 text-fg-subtle"
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[12.5px] leading-snug text-fg",
              item.removed && "text-fg-subtle line-through",
            )}
          >
            {item.title}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-subtle">{item.detail}</p>

          {item.quote ? (
            <div className="mt-1.5 grid gap-1 border-l border-line-strong pl-2">
              {item.quote.split("\n").map((line, i) => (
                <p
                  key={i}
                  className="text-[11.5px] leading-relaxed text-fg-muted"
                >
                  “{line}”
                </p>
              ))}
            </div>
          ) : (
            // The one row nobody can check. Saying so is the point of the
            // panel: it is filed, and it is the first thing to look at.
            <p className="mt-1.5 text-[11px] leading-relaxed text-warn">
              The model did not point at any line in the transcript for this
              one.
            </p>
          )}

          {item.withheld && item.reason && item.reason !== said && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
              {item.reason}
            </p>
          )}
        </div>

        {item.withheld ? null : item.removed ? (
          <span className="shrink-0 pt-0.5 text-[10.5px] text-fg-subtle">
            removed
          </span>
        ) : (
          <button
            type="button"
            onClick={() => unland(item.id)}
            aria-label={`Remove ${item.title}`}
            className="shrink-0 rounded-sm p-1 text-fg-subtle transition-colors hover:text-warn"
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

/* ── Its own root ────────────────────────────────────────────────────── */

let root: Root | null = null;

/**
 * Put the panel on screen, once per page load.
 *
 * Called by `lib/transcript/land` the moment a landing finishes. A second root
 * beside the app's rather than a component in the shell, because the shell
 * belongs to the recording bar and this panel cannot wait for a slot in
 * somebody else's file — and because a React root created here survives the
 * client navigations the rest of the app does, so walking to the agenda to
 * look at what was made does not take the undo away with it.
 *
 * Nothing else should mount `<Receipt />`: it would render the same store
 * twice.
 */
export function hostReceipt(): void {
  if (typeof document === "undefined" || root) return;
  const host = document.createElement("div");
  host.dataset.transcriptReceipt = "";
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<Receipt />);
}
