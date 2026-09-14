/**
 * The workspace, repositioned.
 *
 * For a year this was the product and the browser did not exist. Now it is
 * built into the browser — `⌘⇧O` opens it, it is served from `tougather://`
 * rather than over the network, and it is what the paid plan is for.
 *
 * ── THE HONEST WORD IS NOT "EXTENSION" ─────────────────────────────────
 * It is tempting to call it one, because that is what it behaves like from the
 * outside: the browser is free, this is the thing you get when you pay. But
 * the browser has no extension system — `browser/CLAUDE.md` lists extensions
 * under "not built yet" — and the workspace is compiled into the application
 * by `npm run bouw-app`. Calling it an extension would set up an expectation
 * of an extensions page, a store, and a way to install other ones, none of
 * which exists. So: it comes with the browser, and the subscription is what
 * switches it on. That is the same sentence without the false promise.
 */

import Link from "next/link";
import { Glass, Reveal, Section, SectionHead } from "./primitives";
import { Icon } from "@/components/ui/Icon";

const KINDS = [
  ["Documents", "text"],
  ["Decks", "slides"],
  ["Sheets", "table"],
  ["Boards", "board"],
  ["Notes", "sticky"],
  ["Code", "code"],
] as const;

export function WorkspaceIncluded() {
  return (
    <Section id="workspace" className="pb-24 sm:pb-32">
      <SectionHead
        eyebrow="What the subscription is for"
        title="The workspace is already inside it."
        lead={
          <>
            Press <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>O</Kbd> and Tougather opens in
            a tab: documents, decks, sheets, boards, notes and code in one
            project, with an assistant that has read all of it. It is served
            from inside the application rather than over the network, so it
            opens at the speed of a local page and keeps working when the wifi
            does not.
          </>
        }
      />

      <Reveal>
        <Glass className="mt-11 flex flex-col gap-7 rounded-[28px] p-8 sm:p-10">
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([label, icon]) => (
              <span
                key={label}
                className="glass-soft inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] text-fg"
              >
                <Icon name={icon} size={13} className="text-fg-subtle" />
                {label}
              </span>
            ))}
          </div>

          <div className="grid gap-7 border-t border-line pt-7 sm:grid-cols-2">
            <div>
              <p className="text-[15px] font-medium text-fg">
                Free, the browser is the whole browser
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                Every tab, every workspace, the assistant on your own plan, and
                nothing switched off to make a point. We would rather you used
                it than paid for it.
              </p>
            </div>
            <div>
              <p className="text-[15px] font-medium text-fg">
                Paid, the workspace comes on
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                The projects, the editors and the library, syncing to your
                account so the same work is there on your other machine. One
                subscription, and{" "}
                {/* The promise is one page away rather than repeated here:
                    a number that appears twice is a number that will disagree
                    with itself the first time one of them is edited. */}
                <Link
                  href="/pricing"
                  className="text-fg underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-muted"
                >
                  what it costs
                </Link>{" "}
                is on one page with nothing hidden under it.
              </p>
            </div>
          </div>
        </Glass>
      </Reveal>
    </Section>
  );
}

/** A key, drawn the way the app draws one. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-[1.6em] items-center justify-center rounded-md bg-[var(--kbd)] px-1.5 py-0.5 text-[0.85em] text-fg">
      {children}
    </kbd>
  );
}
