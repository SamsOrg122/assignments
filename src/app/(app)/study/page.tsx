"use client";

/**
 * Study — what the reading turns into once it has been done.
 *
 * The tool could already read a PDF, take the lecture note and write the
 * essay. The one thing left was being asked about any of it, which is the
 * part an exam consists of. So: cards made from something already in the
 * account, and a session that asks the ones you keep missing more often than
 * the ones you know.
 *
 * The list is deliberately thin. A set is a name, how much of it has stuck,
 * and a button that starts. Everything else about a set — fixing a card,
 * throwing one out — happens while looking at that card, because that is
 * when somebody knows it is wrong.
 */

import { useEffect, useState } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { keyOf, type DayKey } from "@/lib/agenda/model";
import {
  deleteSet,
  hydrateStudy,
  pullStudy,
  resetProgress,
  useStudy,
} from "@/lib/study";
import { nextDue, progressOf } from "@/lib/study/model";
import { NewSet } from "@/components/study/NewSet";
import { Session } from "@/components/study/Session";

export default function StudyPage() {
  const sets = useStudy((s) => s.sets);
  const problem = useStudy((s) => s.problem);

  const [today, setToday] = useState<DayKey>("");
  const [making, setMaking] = useState(false);
  const [studying, setStudying] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    hydrateStudy();
    // Off the effect body: a synchronous setState here cascades, and a
    // microtask later is soon enough for something nothing is waiting on.
    void Promise.resolve().then(() => setToday(keyOf(new Date())));
    void pullStudy();
  }, []);

  const open = sets.find((s) => s.id === studying);

  return (
    <>
      <TopBar
        right={
          <button
            type="button"
            onClick={() => setMaking(true)}
            className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-[11.5px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Icon name="plus" size={12} />
            New set
          </button>
        }
      >
        <span className="text-[13px] font-medium text-fg">Study</span>
      </TopBar>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* A session is the whole page while it lasts. Half a screen of card
            beside a list of other sets is an invitation to stop. */}
        {open && today ? (
          <Session set={open} today={today} onClose={() => setStudying(null)} />
        ) : (
          <>
            {problem && (
              <p className="border-b border-line px-4 py-1.5 text-[11.5px] text-warn" role="status">
                {problem}
              </p>
            )}

            {sets.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-[400px] text-center">
                  <p className="text-[13.5px] text-fg">Nothing to be asked about yet.</p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-fg-subtle">
                    Point this at a lecture note, a document you have written
                    or a PDF on your shelf, and it will write cards from it —
                    only from what is actually in there.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMaking(true)}
                    className="mt-3 rounded-sm bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent"
                  >
                    Make the first set
                  </button>
                </div>
              </div>
            ) : (
              <ul className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-4">
                {[...sets]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((set) => {
                    const how = today
                      ? progressOf(set, today)
                      : { total: set.cards.length, known: 0, due: 0 };
                    const later = today ? nextDue(set, today) : null;
                    return (
                      <li
                        key={set.id}
                        className="rounded-md border border-line bg-surface p-3 transition-colors hover:border-line-strong"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                            {set.name}
                          </span>
                          {set.source && (
                            <span className="shrink-0 text-[10.5px] text-fg-subtle">
                              from a {set.source}
                            </span>
                          )}
                        </div>

                        {/* How much has stuck, drawn rather than counted. */}
                        <div className="mt-2 flex h-1 gap-px overflow-hidden rounded-xs">
                          {set.cards.map((card) => (
                            <span
                              key={card.id}
                              className={cn(
                                "h-full flex-1",
                                card.box >= 4
                                  ? "bg-accent"
                                  : card.box > 0
                                    ? "bg-accent/40"
                                    : "bg-line",
                              )}
                            />
                          ))}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-fg-subtle">
                            {how.known} of {how.total} known
                            {today &&
                              (how.due > 0
                                ? ` · ${how.due} due`
                                : later
                                  ? ` · ${later}`
                                  : "")}
                          </span>

                          <span className="ml-auto flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => resetProgress(set.id)}
                              className="rounded-xs border border-line px-1.5 py-0.5 text-[11px] text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
                            >
                              Start over
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                confirming === set.id
                                  ? (deleteSet(set.id), setConfirming(null))
                                  : setConfirming(set.id)
                              }
                              className={cn(
                                "rounded-xs border px-1.5 py-0.5 text-[11px] transition-colors",
                                confirming === set.id
                                  ? "border-warn text-warn"
                                  : "border-line text-fg-subtle hover:border-line-strong hover:text-fg",
                              )}
                            >
                              {confirming === set.id ? "Really delete" : "Delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudying(set.id)}
                              disabled={!today || how.total === 0}
                              className="rounded-sm bg-accent px-2.5 py-1 text-[11.5px] font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                              {how.due > 0 ? "Study" : "Look through"}
                            </button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </>
        )}
      </main>

      {making && (
        <NewSet
          onClose={() => setMaking(false)}
          onMade={(id) => {
            setMaking(false);
            setStudying(id);
          }}
        />
      )}
    </>
  );
}
