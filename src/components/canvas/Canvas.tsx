"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import type { Block, PeerState, Project } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { BlockShell } from "./BlockShell";
import { Cursors } from "@/components/presence/Cursors";
import { TextBlock } from "@/components/blocks/TextBlock";
import { TableBlock } from "@/components/blocks/TableBlock";
import { ChartBlock } from "@/components/blocks/ChartBlock";
import { SlidesBlock } from "@/components/blocks/SlidesBlock";
import { CodeBlock } from "@/components/blocks/CodeBlock";
import { ImageBlock } from "@/components/blocks/ImageBlock";
import { BibliographyBlock } from "@/components/blocks/BibliographyBlock";
import { Icon } from "@/components/ui/Icon";
import { BLOCK_META } from "@/components/shell/CommandPalette";
import { imageFrom, prepareImage } from "@/lib/images";
import { createImageBlock } from "@/lib/factories";
import { fillImageBlock } from "@/lib/image-block";
import type { BlockType } from "@/lib/types";

const ADDABLE: BlockType[] = [
  "text",
  "table",
  "chart",
  "slides",
  "image",
  "code",
  "bibliography",
];

export function Canvas({
  project,
  peers,
  proseClassName,
  minimal = false,
}: {
  project: Project;
  peers: PeerState[];
  /** Extra class applied to prose blocks — carries the chosen type face. */
  proseClassName?: string;
  /** Focus mode: drop the add-bar and every non-essential affordance. */
  minimal?: boolean;
}) {
  const moveBlock = useProjects((s) => s.moveBlock);
  const addBlock = useProjects((s) => s.addBlock);
  const insertBlock = useProjects((s) => s.insertBlock);
  const notify = useUI((s) => s.notify);
  const [dragging, setDragging] = useState<Block | null>(null);
  const [dropping, setDropping] = useState(false);

  const ids = useMemo(() => project.blocks.map((b) => b.id), [project.blocks]);

  const sensors = useSensors(
    // A small distance threshold keeps clicks inside blocks from starting drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const peersByBlock = useMemo(() => {
    const map = new Map<string, PeerState[]>();
    for (const p of peers) {
      if (!p.activeBlockId) continue;
      map.set(p.activeBlockId, [...(map.get(p.activeBlockId) ?? []), p]);
    }
    return map;
  }, [peers]);

  const onDragStart = (e: DragStartEvent) =>
    setDragging(project.blocks.find((b) => b.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    moveBlock(
      project.id,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
  };

  const append = (type: BlockType) => {
    const id = addBlock(project.id, type);
    notify(`${BLOCK_META[type].label} block added`);
    requestAnimationFrame(() =>
      document
        .getElementById(`block-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    if (type === "image") fillImageBlock(project.id, id, notify);
  };

  /**
   * Drop a picture anywhere on the page and it becomes a block where you
   * dropped it — not at the end, and not after a dialog. The insertion point
   * is read off the DOM under the pointer: the block you're pointing at, on
   * the side you're pointing at.
   */
  const onDrop = async (e: React.DragEvent) => {
    const file = imageFrom(e.dataTransfer);
    if (!file) return;
    e.preventDefault();
    setDropping(false);

    const host = (e.target as HTMLElement | null)?.closest?.("[data-block-id]");
    let after: string | undefined;
    if (host instanceof HTMLElement) {
      const rect = host.getBoundingClientRect();
      const below = e.clientY > rect.top + rect.height / 2;
      const index = project.blocks.findIndex(
        (b) => b.id === host.dataset.blockId,
      );
      after = below
        ? (host.dataset.blockId ?? undefined)
        : project.blocks[index - 1]?.id;
      // Dropping above the very first block has no "after" — but an undefined
      // id appends, which is the opposite of what was asked for. Insert after
      // the first block instead and let the author drag it up if they care.
      if (!after && index === 0) after = project.blocks[0]?.id;
    }

    try {
      const image = await prepareImage(file);
      const block = createImageBlock();
      insertBlock(
        project.id,
        {
          ...block,
          src: image.src,
          alt: image.name.replace(/\.[a-z0-9]+$/i, ""),
          naturalWidth: image.width,
          naturalHeight: image.height,
          bytes: image.bytes,
        },
        after,
      );
      requestAnimationFrame(() =>
        document
          .getElementById(`block-${block.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "That picture couldn't be read.",
      );
    }
  };

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <Cursors peers={peers} />

      {dropping && (
        <div
          aria-hidden="true"
          className="anim-fade pointer-events-none absolute -inset-4 z-40 grid place-items-center rounded-lg border border-dashed border-accent bg-canvas/60 print:hidden"
        >
          <span className="rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] text-fg-muted">
            Drop to place the picture
          </span>
        </div>
      )}

      <DndContext
        // A stable id keeps dnd-kit's generated aria ids identical on the
        // server and the client; without it they diverge and React reports a
        // hydration mismatch.
        id="block-canvas"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-5">
            {project.blocks.map((block) => (
              <BlockShell
                key={block.id}
                projectId={project.id}
                block={block}
                peers={peersByBlock.get(block.id) ?? []}
                minimal={minimal}
              >
                <BlockBody
                  projectId={project.id}
                  block={block}
                  proseClassName={proseClassName}
                />
              </BlockShell>
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="rounded-md border border-accent/40 bg-surface/90 px-3 py-2 text-[12.5px] text-fg-muted shadow-[0_20px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur">
              <span className="flex items-center gap-2">
                <Icon name={BLOCK_META[dragging.type].icon} size={12} />
                {dragging.title ?? BLOCK_META[dragging.type].label}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {project.blocks.length === 0 && (
        <p className="py-10 text-center text-[13px] text-fg-subtle">
          An empty canvas. Add the first block below.
        </p>
      )}

      {!minimal && (
      <div className="mt-8 flex flex-wrap items-center gap-1.5 border-t border-line pt-4 print:hidden">
        <span className="label-mono mr-1">Add</span>
        {ADDABLE.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => append(type)}
            className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
          >
            <Icon name={BLOCK_META[type].icon} size={11} />
            {BLOCK_META[type].label}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

function BlockBody({
  projectId,
  block,
  proseClassName,
}: {
  projectId: string;
  block: Block;
  proseClassName?: string;
}) {
  switch (block.type) {
    case "text":
      return (
        <TextBlock
          projectId={projectId}
          block={block}
          proseClassName={proseClassName}
        />
      );
    case "table":
      return <TableBlock projectId={projectId} block={block} />;
    case "chart":
      return <ChartBlock projectId={projectId} block={block} />;
    case "slides":
      return <SlidesBlock projectId={projectId} block={block} />;
    case "code":
      return <CodeBlock projectId={projectId} block={block} />;
    case "image":
      return <ImageBlock projectId={projectId} block={block} />;
    case "bibliography":
      return <BibliographyBlock projectId={projectId} block={block} />;
  }
}
