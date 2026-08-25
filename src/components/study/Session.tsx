"use client";

/**
 * Going through a set, one card at a time.
 *
 * The whole surface is one card and two answers, because everything else is
 * a way of not answering. No timer, no score, no streak: the thing being
 * measured is whether you know it, and a number climbing in the corner is a
 * different game.
 *
 * The front is shown alone until you say you have thought about it. That gap
 * is the entire mechanism — a card whose answer is already on screen is a
 * page of notes with extra clicks.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { DayKey } from "@/lib/agenda/model";
import { answer, dropCard, editCard } from "@/lib/study";
import { dueCards, TOP_BOX, type Card, type StudySet } from "@/lib/study/model";

export function Session({
  set,
  today,
  onClose,
}: {
  set: StudySet;
  today: DayKey;
  onClose: () => void;
}) {
  /**
   * The order is fixed when the session starts.
   *
   * Held in state with an initialiser rather than derived, because it must
   * *not* follow the store: recomputing after every answer would re-sort the
   * deck under the person mid-session, and a card answered right would leave
   * the queue and make everything behind it jump. The page mounts this fresh
   * per set, so once per session is exactly the life it should have.
   */
  const [queue] = useState<string[]>(() => dueCards(set, today).map((c) => c.id));

  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [right, setRight] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ front: "", back: "" });

  const cardId = queue[at];
  const card: Card | undefined = set.cards.find((c) => c.id === cardId);
  const done = at >= queue.length;

  const say = (got: boolean) => {
    if (!card) return;
    answer(set.id, card.id, got, today);
    if (got) setRight((n) => n + 1);
    setShown(false);
    setEditing(false);
    setAt((n) => n + 1);
  };

  // Space reveals, then 1 and 2 answer. The three keys somebody's hand is
  // already on, and every one of them has a button beside it saying so.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === "Escape") return onClose();
      if (done) return;
      if (event.key === " " && !shown) {
        event.preventDefault();
        setShown(true);
      } else if (shown && (event.key === "1" || event.key === "2")) {
        event.preventDefault();
        say(event.key === "2");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-[11.5px] text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="chevron-left" size={12} />
          All sets
        </button>
        <span className="truncate text-[13px] font-medium text-fg">{set.name}</span>
        <span className="ml-auto text-[11.5px] tabular-nums text-fg-subtle">
          {Math.min(at + 1, queue.length)} / {queue.length}
        </span>
      </div>

      {/* How far through, as a line rather than a number. */}
      <div className="h-px w-full bg-line">
        <div
          className="h-px bg-accent transition-[width] duration-300"
          style={{ width: `${queue.length ? (at / queue.length) * 100 : 0}%` }}
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        {done || !card ? (
          <div className="max-w-[420px] text-center">
            <p className="text-[15px] text-fg">
              {queue.length === 0 ? "Nothing due in this set." : "That's the lot."}
            </p>
            {queue.length > 0 && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-subtle">
                {right} of {queue.length} right. The ones you missed come back
                today; the rest are spaced out.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-sm bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="w-full max-w-[560px]">
            {editing ? (
              <div className="grid gap-2 rounded-md border border-line bg-surface p-3">
                <label className="grid gap-1">
                  <span className="label-mono text-fg-subtle">Front</span>
                  <textarea
                    value={draft.front}
                    onChange={(e) => setDraft({ ...draft, front: e.target.value })}
                    rows={2}
                    className="w-full resize-none rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="label-mono text-fg-subtle">Back</span>
                  <textarea
                    value={draft.back}
                    onChange={(e) => setDraft({ ...draft, back: e.target.value })}
                    rows={4}
                    className="w-full resize-none rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] leading-relaxed text-fg outline-none focus:border-accent"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      editCard(set.id, card.id, {
                        front: draft.front.trim() || card.front,
                        back: draft.back.trim() || card.back,
                      });
                      setEditing(false);
                    }}
                    className="rounded-sm bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent"
                  >
                    Save the card
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] text-fg-subtle hover:text-fg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-line bg-surface p-6 text-center">
                  <p className="text-[17px] leading-snug text-fg">{card.front}</p>

                  {shown ? (
                    <>
                      <div className="my-4 h-px bg-line" />
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg-muted">
                        {card.back}
                      </p>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShown(true)}
                      className="mt-5 rounded-sm border border-line px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                    >
                      Show the answer
                      <span className="ml-1.5 text-fg-subtle">space</span>
                    </button>
                  )}
                </div>

                {shown && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => say(false)}
                      className="rounded-sm border border-line px-3 py-2 text-[12.5px] text-fg-muted transition-colors hover:border-warn hover:text-warn"
                    >
                      Not yet
                      <span className="ml-1.5 text-[11px] text-fg-subtle">1</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => say(true)}
                      className="rounded-sm border border-line px-3 py-2 text-[12.5px] text-fg transition-colors hover:border-line-strong hover:bg-surface-2"
                    >
                      Got it
                      <span className="ml-1.5 text-[11px] text-fg-subtle">2</span>
                    </button>
                  </div>
                )}

                {/* A model wrote these cards. The person studying them is the
                    one who can tell when one is wrong, so fixing and binning
                    are here rather than behind a settings screen. */}
                <div className="mt-3 flex items-center justify-center gap-3">
                  <span className={cn("text-[11px]", card.box >= TOP_BOX ? "text-fg-muted" : "text-fg-subtle")}>
                    box {card.box + 1} of {TOP_BOX + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ front: card.front, back: card.back });
                      setEditing(true);
                    }}
                    className="text-[11px] text-fg-subtle transition-colors hover:text-fg"
                  >
                    Fix this card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dropCard(set.id, card.id);
                      setShown(false);
                      setAt((n) => n + 1);
                    }}
                    className="text-[11px] text-fg-subtle transition-colors hover:text-warn"
                  >
                    Throw it out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
