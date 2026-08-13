"use client";

/**
 * Reading the link.
 *
 * The document is in `location.hash`, so this can only happen in the browser
 * and only after mount — there is no server render of a shared project, by
 * construction. Decoding is async (it decompresses), so the page has three
 * honest states: reading, a document, or a clear reason why not.
 *
 * The link also carries what the sender offered. A view link opens a reader; an
 * edit link opens the real editor in a live session, where the two of you see
 * each other's pointer and each other's changes.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import { decodeShare, type SharePermission } from "@/lib/share";
import { SharedProject } from "@/components/viewer/SharedProject";
import { GuestEditor } from "@/components/viewer/GuestEditor";
import { Icon } from "@/components/ui/Icon";
import { KINDS } from "@/lib/kinds";
import { formatDate } from "@/lib/format";

type State =
  | { status: "reading" }
  | { status: "ready"; project: Project; permission: SharePermission }
  | { status: "empty" }
  | { status: "expired"; at: number }
  | { status: "broken" };

export function ViewerClient() {
  const [state, setState] = useState<State>({ status: "reading" });

  useEffect(() => {
    let live = true;
    const read = () => {
      const payload = window.location.hash.slice(1);
      if (!payload) {
        setState({ status: "empty" });
        return;
      }
      setState({ status: "reading" });
      decodeShare(payload).then(
        (decoded) => {
          if (!live) return;
          setState(
            !decoded
              ? { status: "broken" }
              : decoded.expired
                ? { status: "expired", at: decoded.expires ?? 0 }
                : {
                    status: "ready",
                    project: decoded.project,
                    permission: decoded.permission,
                  },
          );
        },
        () => live && setState({ status: "broken" }),
      );
    };

    read();
    // Someone pasting a second link into the same tab changes only the
    // fragment, which is not a navigation — without this the page would keep
    // showing the first document.
    window.addEventListener("hashchange", read);
    return () => {
      live = false;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  // The editor mode takes over the whole page: it brings its own top bar,
  // its own header and a live session, and stacking this page's chrome on top
  // of that would be two headers saying different things.
  if (
    state.status === "ready" &&
    (state.permission === "edit" || state.permission === "suggest")
  )
    return (
      <GuestEditor
        project={state.project}
        suggesting={state.permission === "suggest"}
      />
    );

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
        <Link
          href="/"
          className="flex items-center gap-2 text-[12.5px] font-medium text-fg transition-opacity hover:opacity-70"
        >
          {/* The nav's notched square, so a link opened cold still arrives
              wearing the same face as the site it came from. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[17px] shrink-0">
            <path
              d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinejoin="round"
            />
          </svg>
          Tougather
        </Link>

        {state.status === "ready" && (
          <>
            <span aria-hidden="true" className="h-3.5 w-px bg-line" />
            <Icon
              name={KINDS[state.project.kind].icon}
              size={12}
              className="shrink-0 text-fg-subtle"
            />
            <h1 className="min-w-0 truncate text-[13px] font-medium text-fg">
              {state.project.name}
            </h1>
          </>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          <span className="hidden rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-fg-subtle sm:inline">
            READ ONLY
          </span>
          <Link
            href="/library"
            className="rounded-sm bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Make your own
          </Link>
        </span>
      </header>

      {state.status === "reading" && (
        <div className="grid flex-1 place-items-center" aria-busy="true">
          <p className="text-[13px] text-fg-subtle">Opening the link…</p>
        </div>
      )}

      {state.status === "ready" && <SharedProject project={state.project} />}

      {state.status === "empty" && (
        <Explain
          title="Nothing to show"
          body="This address needs the rest of the link — the part after the # carries the document. Copy the whole link and try again."
        />
      )}

      {state.status === "expired" && (
        <Explain
          title="That link has expired"
          body={`Whoever shared this set it to stop working on ${formatDate(
            state.at,
          )}. Ask them for a new one — the document itself is untouched.`}
        />
      )}

      {state.status === "broken" && (
        <Explain
          title="That link didn't open"
          body="The document in it couldn't be read. Links get cut short by some chat apps; ask for it again, or ask the sender for the file instead."
        />
      )}

      {state.status === "ready" && (
        <footer className="shrink-0 border-t border-line px-4 py-2 text-center text-[11px] text-fg-subtle">
          A read-only copy, carried inside the link itself. Nothing was
          uploaded, and edits here aren&apos;t possible or saved.
        </footer>
      )}
    </div>
  );
}

function Explain({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid flex-1 place-items-center px-6">
      <div className="max-w-[42ch] text-center">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{body}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-[12.5px] text-accent transition-opacity hover:opacity-80"
        >
          Go to Tougather
        </Link>
      </div>
    </div>
  );
}
