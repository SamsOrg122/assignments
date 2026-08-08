"use client";

/**
 * A deck inside a document.
 *
 * The same deck as the one in its own project, at a size that sits in a page:
 * the same themed stage, the same layouts, the same free-form layer with text,
 * shapes and pictures, the same style panel. Nothing is held back for being
 * inline. It used to be a separate, much thinner implementation, and the only
 * thing that made it thinner was that it had been written twice.
 */

import type { SlidesBlock as SlidesBlockModel } from "@/lib/types";
import {
  DeckTools,
  SlideBar,
  SlideStage,
  SpeakerNote,
  useDeck,
} from "@/components/slides/DeckWorkbench";

export function SlidesBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: SlidesBlockModel;
}) {
  const deck = useDeck(projectId, block);

  return (
    <div className="rounded-md border border-line bg-surface p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <DeckTools deck={deck} compact />
      </div>

      {/* Capped by height rather than width: a document column is narrow, and
          a 16:9 stage that filled it would be too short to work in. */}
      <div className="mx-auto w-full max-w-[min(100%,746px)]">
        <SlideStage deck={deck} />
      </div>

      <div className="mt-2.5 space-y-2">
        <SlideBar deck={deck} />
        <SpeakerNote deck={deck} />
      </div>
    </div>
  );
}
