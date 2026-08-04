"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, PeerState } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { BLOCK_META } from "@/components/shell/CommandPalette";

/**
 * Chrome around every block: drag handle, gutter actions, block-level presence.
 * All of it hidden until hover or keyboard focus — the canvas should look like
 * a document, not a toolbar.
 */
export function BlockShell({
  projectId,
  block,
  peers,
  children,
}: {
  projectId: string;
  block: Block;
  peers: PeerState[];
  children: React.ReactNode;
}) {
  const removeBlock = useProjects((s) => s.removeBlock);
  const duplicateBlock = useProjects((s) => s.duplicateBlock);
  const updateBlock = useProjects((s) => s.updateBlock);
  const openAI = useUI((s) => s.openAI);
  const setFocusedBlock = useUI((s) => s.setFocusedBlock);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const meta = BLOCK_META[block.type];
  const titled = block.type !== "text";

  const askAI = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    openAI({
      projectId,
      blockId: block.id,
      blockType: block.type,
      selectionText: "",
      anchor: {
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? Math.min(rect.top + 40, window.innerHeight - 340) : 160,
      },
    });
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rootRef.current = node;
      }}
      id={`block-${block.id}`}
      data-block-id={block.id}
      data-block-type={block.type}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onFocusCapture={() => setFocusedBlock(block.id)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setFocusedBlock(null);
      }}
      className={cn(
        "group/block relative scroll-mt-20",
        isDragging && "z-20 opacity-60",
      )}
    >
      {/* Gutter — sits outside the content column on wide screens. */}
      <div
        className={cn(
          "absolute top-0.5 -left-9 hidden items-center gap-0.5 lg:flex",
          "opacity-0 transition-opacity duration-150",
          "group-hover/block:opacity-100 group-focus-within/block:opacity-100",
          menuOpen && "opacity-100",
          "print:hidden",
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${meta.label} block`}
          className="cursor-grab rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg active:cursor-grabbing"
        >
          <Icon name="grip" size={13} />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`${meta.label} block options`}
          aria-expanded={menuOpen}
          className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          <Icon name="dots" size={13} />
        </button>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="anim-pop absolute top-8 -left-9 z-30 w-[184px] rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.85)] print:hidden"
        >
          <MenuItem
            icon="sparkle"
            label="Ask AI about this"
            onClick={() => {
              setMenuOpen(false);
              askAI();
            }}
          />
          <MenuItem
            icon="copy"
            label="Duplicate"
            onClick={() => {
              duplicateBlock(projectId, block.id);
              setMenuOpen(false);
            }}
          />
          <MenuItem
            icon="trash"
            label="Delete"
            danger
            onClick={() => {
              removeBlock(projectId, block.id);
              setMenuOpen(false);
            }}
          />
        </div>
      )}

      {/* Header row for non-text blocks: editable title + peer chip + AI. */}
      {(titled || peers.length > 0) && (
        <div className="mb-1.5 flex items-center gap-2">
          {titled && (
            <>
              <Icon
                name={meta.icon}
                size={12}
                className="shrink-0 text-fg-subtle"
              />
              <input
                value={block.title ?? ""}
                onChange={(e) =>
                  updateBlock(projectId, block.id, { title: e.target.value })
                }
                placeholder={meta.label}
                aria-label={`${meta.label} block title`}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-fg-muted outline-none placeholder:text-fg-subtle focus:text-fg"
              />
            </>
          )}

          <div className={cn("flex items-center gap-1.5", !titled && "ml-auto")}>
            {peers.map((p) => (
              <span
                key={p.user.id}
                className="anim-fade flex items-center gap-1.5 rounded-xs border px-1.5 py-0.5 font-mono text-[9.5px] whitespace-nowrap"
                style={{
                  borderColor: `${p.user.color}44`,
                  color: p.user.color,
                  background: `${p.user.color}12`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-1 rounded-full"
                  style={{ background: p.user.color }}
                />
                {p.user.name.split(" ")[0]} is {p.activity ?? "here"}
              </span>
            ))}
          </div>

          {titled && (
            <button
              type="button"
              onClick={askAI}
              aria-label="Ask AI about this block"
              className="shrink-0 rounded-xs p-1 text-fg-subtle opacity-0 transition-[opacity,color] duration-150 group-hover/block:opacity-100 hover:text-accent focus-visible:opacity-100 print:hidden"
            >
              <Icon name="sparkle" size={12} />
            </button>
          )}
        </div>
      )}

      {children}

      {/* Mobile controls — no gutter room, so they live under the block. */}
      <div className="mt-1.5 flex items-center gap-1 lg:hidden print:hidden">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${meta.label} block`}
          className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="grip" size={12} />
        </button>
        <button
          type="button"
          onClick={askAI}
          aria-label="Ask AI about this block"
          className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-accent"
        >
          <Icon name="sparkle" size={12} />
        </button>
        <button
          type="button"
          onClick={() => duplicateBlock(projectId, block.id)}
          aria-label="Duplicate block"
          className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="copy" size={12} />
        </button>
        <button
          type="button"
          onClick={() => removeBlock(projectId, block.id)}
          aria-label="Delete block"
          className="rounded-xs p-1 text-fg-subtle transition-colors hover:text-danger"
        >
          <Icon name="trash" size={12} />
        </button>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: "sparkle" | "copy" | "trash";
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[12.5px] transition-colors duration-150",
        danger
          ? "text-fg-muted hover:bg-danger/10 hover:text-danger"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );
}
