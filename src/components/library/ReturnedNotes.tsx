"use client";

/**
 * What came back while you were away.
 *
 * The half of sharing that was missing. Somebody could already open a link and
 * comment on a paragraph — but the note lived in their browser, and unless the
 * author happened to be in the same live session at the same second, nobody
 * ever saw it. A comment nobody receives is not a comment.
 *
 * So on opening the Library this asks, for each document a comment link was
 * made for, whether anything is waiting; merges what it finds into the
 * document itself, so the notes sit on the paragraphs they were left on; and
 * says so once, here, naming the documents.
 *
 * Quiet when there is nothing — which is most of the time, and is the whole
 * reason it can afford to be a bar rather than a badge somebody has to hunt
 * for. And quiet when the note box cannot be reached at all: a server that has
 * restarted looks exactly like nobody having commented, and pretending
 * otherwise would mean an alarm on every load for most people.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useProjects } from "@/lib/store";
import { useShared } from "@/lib/collab/shared";
import { asComment, waitingNotes } from "@/lib/collab/notes";
import { formatNumber } from "@/lib/format";

interface Arrival {
  projectId: string;
  name: string;
  count: number;
}

export function ReturnedNotes() {
  const awaiting = useShared((s) => s.awaiting);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!awaiting.length) return;
    let live = true;

    void (async () => {
      const found: Arrival[] = [];

      for (const projectId of awaiting) {
        const notes = await waitingNotes(projectId);
        if (!notes.length) continue;

        const store = useProjects.getState();
        const project = store.projects.find((p) => p.id === projectId);
        // The document may have been deleted since the link went out. The
        // notes then have nowhere to land, and saying so would be noise.
        if (!project) continue;

        const before = countComments(projectId);
        for (const note of notes) {
          store.receiveComment(projectId, note.blockId, asComment(note));
        }
        const added = countComments(projectId) - before;
        if (added > 0)
          found.push({ projectId, name: project.name, count: added });
      }

      if (live && found.length) setArrivals(found);
    })();

    return () => {
      live = false;
    };
  }, [awaiting]);

  if (dismissed || !arrivals.length) return null;

  const total = arrivals.reduce((n, a) => n + a.count, 0);

  return (
    <div className="anim-slide-up mb-4 flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent-soft p-3">
      <Icon name="quote" size={12} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg">
          {formatNumber(total)} note{total === 1 ? "" : "s"} came back on{" "}
          {arrivals.length === 1
            ? "a document"
            : `${formatNumber(arrivals.length)} documents`}
          .
        </p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {arrivals.map((arrival) => (
            <li key={arrival.projectId}>
              <Link
                href={`/p/${arrival.projectId}`}
                className="text-[12.5px] text-fg-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg"
              >
                {arrival.name}
                <span className="text-fg-subtle"> · {arrival.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-sm p-1 text-fg-subtle transition-colors hover:text-fg"
      >
        <Icon name="x" size={11} />
      </button>
    </div>
  );
}

/** How many comments a project holds right now, across every block. */
function countComments(projectId: string): number {
  const project = useProjects
    .getState()
    .projects.find((p) => p.id === projectId);
  if (!project) return 0;
  return project.blocks.reduce((n, b) => n + (b.comments?.length ?? 0), 0);
}
