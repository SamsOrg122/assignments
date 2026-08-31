"use client";

/**
 * The second screen.
 *
 * Notes, a clock, and the slide that is coming — the three things a presenter
 * is holding in their head while also talking, and the reason people still
 * print their deck. It drives nothing on its own: the arrows here send a
 * request to the window the room is looking at, which decides. One authority,
 * so the two screens cannot disagree.
 *
 * A presenter window opened before the deck is presenting, or after it has
 * stopped, says so rather than showing an empty frame — that is the state
 * somebody will hit thirty seconds before they are due to start.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { elapsed, openChannel, type DeckState, type Message } from "@/lib/deck/channel";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export function PresenterClient() {
  const [state, setState] = useState<DeckState | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const send = useRef<(message: Message) => void>(() => {});

  useEffect(() => {
    const channel = openChannel((message) => {
      if (message.kind === "state") {
        setState(message.state);
        setLive(true);
      }
      if (message.kind === "bye") setLive(false);
    });
    send.current = channel.send;
    // Announce, so a window opened after the deck started still catches up.
    channel.send({ kind: "hello", key: "*" });
    return channel.close;
  }, []);

  // A second is the right resolution for a clock somebody glances at.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const move = useCallback(
    (to: 1 | -1 | number) => {
      if (state) send.current({ kind: "move", key: state.key, to });
    },
    [state],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  if (!state)
    return (
      <Frame>
        <p className="text-[14px] text-fg-muted">
          Waiting for a deck. Press <span className="text-fg">Present</span> in
          the other window and this will follow it.
        </p>
      </Frame>
    );

  const current = state.slides[state.index];
  const next = state.slides[state.index + 1];

  return (
    <Frame>
      <div className="flex h-full flex-col gap-3">
        <header className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[28px] leading-none tracking-tight text-fg tabular-nums">
            {elapsed(state.startedAt, now)}
          </span>
          <button
            type="button"
            onClick={() => send.current({ kind: "clock", key: state.key, action: state.startedAt ? "reset" : "start" })}
            className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            {state.startedAt ? "Reset" : "Start"}
          </button>

          <span className="ml-auto font-mono text-[12px] text-fg-subtle">
            {state.index + 1} / {state.slides.length}
            {current?.steps ? ` · step ${state.step}/${current.steps}` : ""}
          </span>
          {!live && (
            <span className="rounded-full border border-warn/40 bg-warn/[0.08] px-2 py-0.5 font-mono text-[10px] text-warn">
              the other window closed
            </span>
          )}
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
          {/* Notes get the most room, because they are the reason this exists. */}
          <section className="flex min-h-0 flex-col rounded-md border border-line bg-surface p-4">
            <p className="text-meta text-fg-subtle mb-2">Notes</p>
            <h2 className="mb-2 text-[17px] leading-snug font-medium text-fg">
              {current?.title || "Untitled slide"}
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {current?.note?.trim() ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-line text-fg-muted">
                  {current.note}
                </p>
              ) : (
                <p className="text-[13.5px] text-fg-subtle">
                  No notes on this one.
                </p>
              )}
            </div>
          </section>

          <div className="flex min-h-0 flex-col gap-3">
            <section className="rounded-md border border-line bg-surface p-3.5">
              <p className="text-meta text-fg-subtle mb-1.5">This slide</p>
              <ul className="space-y-1">
                {(current?.bullets ?? []).map((bullet, i) => (
                  <li
                    key={i}
                    className={cn(
                      "text-[13px] leading-snug",
                      current?.steps && i >= state.step
                        ? "text-fg-subtle/60"
                        : "text-fg-muted",
                    )}
                  >
                    {bullet}
                  </li>
                ))}
                {!current?.bullets.length && (
                  <li className="text-[13px] text-fg-subtle">No bullets.</li>
                )}
              </ul>
            </section>

            <section className="min-h-0 flex-1 rounded-md border border-line bg-surface p-3.5">
              <p className="text-meta text-fg-subtle mb-1.5">Next</p>
              {next ? (
                <>
                  <p className="text-[14px] font-medium text-fg">{next.title || "Untitled"}</p>
                  <ul className="mt-1 space-y-0.5">
                    {next.bullets.slice(0, 4).map((bullet, i) => (
                      <li key={i} className="truncate text-[12.5px] text-fg-subtle">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[13px] text-fg-subtle">
                  This is the last slide.
                </p>
              )}
            </section>
          </div>
        </div>

        <footer className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Back"
            className="flex items-center gap-1.5 rounded-sm border border-line px-3 py-2 text-[13px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name="chevron-left" size={13} />
            Back
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next"
            className="flex items-center gap-1.5 rounded-sm bg-accent px-3 py-2 text-[13px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
          >
            Next
            <Icon name="chevron-right" size={13} />
          </button>
          <p className="ml-auto text-[11.5px] text-fg-subtle">
            Arrow keys work here too. Put this window on your laptop and the
            other one on the projector.
          </p>
        </footer>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid h-dvh place-items-center bg-canvas p-4">
      <div className="h-full w-full max-w-[1100px]">{children}</div>
    </main>
  );
}
