"use client";

/**
 * One item on the board. Ordinary DOM, positioned in world coordinates — the
 * parent's transform does the pan and zoom, so nothing here has to know about
 * either.
 *
 * Handles (resize, comment) appear on selection only. That's the whole
 * anti-ribbon rule applied at the item level: nothing on screen until the thing
 * it acts on is chosen.
 */

import { useState } from "react";
import type { BoardItem, BoardTone, PeerState } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { prepareImage } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ProjectCardBody } from "./ProjectCardBody";
import { CommentPin } from "./CommentPin";

const STICKY_TONES: Record<BoardTone, string> = {
  neutral: "bg-[#33353a] text-fg",
  accent: "bg-[#1c2b4d] text-[#cfe0ff]",
  mint: "bg-[#153026] text-[#bfe6d2]",
  warn: "bg-[#332a19] text-[#e8d5a8]",
};

const FRAME_TONES: Record<BoardTone, { border: string; title: string }> = {
  neutral: { border: "rgba(255,255,255,0.16)", title: "var(--color-fg-muted)" },
  accent: { border: "color-mix(in srgb, var(--color-accent) 45%, transparent)", title: "var(--color-accent)" },
  mint: { border: "color-mix(in srgb, var(--color-leaf) 45%, transparent)", title: "var(--color-leaf)" },
  warn: { border: "rgba(216,163,60,0.5)", title: "#d8a33c" },
};

/** Which corner a resize grip pulls. */
const GRIPS = [
  ["nw", "-top-1 -left-1 cursor-nwse-resize"],
  ["ne", "-top-1 -right-1 cursor-nesw-resize"],
  ["sw", "-bottom-1 -left-1 cursor-nesw-resize"],
  ["se", "-bottom-1 -right-1 cursor-nwse-resize"],
] as const;

export type Grip = (typeof GRIPS)[number][0];

export function BoardItemView({
  projectId,
  item,
  selected,
  connecting,
  peers,
  onPointerDown,
  onResize,
  onOpen,
  onContextMenu,
  onConnectPick,
}: {
  projectId: string;
  item: BoardItem;
  selected: boolean;
  /** Connector mode is armed — clicking picks an endpoint instead of dragging. */
  connecting: boolean;
  peers: PeerState[];
  onPointerDown: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent, grip: Grip) => void;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onConnectPick?: () => void;
}) {
  const updateBoardItem = useProjects((s) => s.updateBoardItem);
  const notify = useUI((s) => s.notify);
  const [editing, setEditing] = useState(false);
  const [thread, setThread] = useState(false);

  const peer = peers[0];
  const frame = item.kind === "frame";
  const comments = item.comments ?? [];

  return (
    <div
      data-board-item={item.id}
      data-board-kind={item.kind}
      onPointerDown={(e) => {
        if (connecting && onConnectPick) {
          e.stopPropagation();
          e.preventDefault();
          onConnectPick();
          return;
        }
        onPointerDown(e);
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={() => {
        if (onOpen) onOpen();
        else if (item.kind === "text" || item.kind === "sticky") setEditing(true);
        else if (frame) setEditing(true);
      }}
      className={cn(
        "absolute rounded-md transition-shadow duration-150",
        selected ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : "ring-0",
        connecting
          ? "cursor-crosshair"
          : item.locked
            ? "cursor-default"
            : editing
              ? "cursor-text"
              : "cursor-grab active:cursor-grabbing",
      )}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.kind === "text" ? undefined : item.height,
        minHeight: item.kind === "text" ? item.height : undefined,
        // A peer working here gets a coloured outline, same language as the
        // block-level presence chips in the editors.
        boxShadow: peer ? `0 0 0 2px ${peer.user.color}` : undefined,
      }}
    >
      {peer && (
        <span
          className="absolute -top-5 left-0 rounded-xs px-1.5 py-0.5 font-mono text-[9.5px] whitespace-nowrap text-white"
          style={{ background: peer.user.color }}
        >
          {peer.user.name.split(" ")[0]} is {peer.activity ?? "here"}
        </span>
      )}

      {frame && item.kind === "frame" && (
        <div
          className="size-full rounded-md border-2 border-dashed"
          style={{
            borderColor: FRAME_TONES[item.tone].border,
            background: "rgba(255,255,255,0.014)",
          }}
        >
          <div className="absolute -top-6 left-0 flex max-w-full items-center gap-1.5">
            <Icon
              name="frame"
              size={11}
              style={{ color: FRAME_TONES[item.tone].title }}
            />
            {editing ? (
              <input
                autoFocus
                value={item.title}
                aria-label="Frame title"
                onChange={(e) =>
                  updateBoardItem(projectId, item.id, { title: e.target.value })
                }
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" || e.key === "Escape") setEditing(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-[220px] rounded-xs border border-line bg-surface px-1.5 py-0.5 text-[12px] text-fg outline-none focus:border-accent"
              />
            ) : (
              <span
                className="truncate text-[12px] font-medium tracking-tight"
                style={{ color: FRAME_TONES[item.tone].title }}
              >
                {item.title}
              </span>
            )}
          </div>
        </div>
      )}

      {item.kind === "sticky" && (
        <Editable
          value={item.text}
          editing={editing}
          onEditingChange={setEditing}
          onChange={(text) => updateBoardItem(projectId, item.id, { text })}
          placeholder="Note…"
          className={cn(
            "size-full rounded-md p-3.5 text-[13px] leading-snug",
            STICKY_TONES[item.tone] ?? STICKY_TONES.neutral,
          )}
        />
      )}

      {item.kind === "text" && (
        <Editable
          value={item.text}
          editing={editing}
          onEditingChange={setEditing}
          onChange={(text) => updateBoardItem(projectId, item.id, { text })}
          placeholder="Type an idea…"
          className="size-full rounded-md p-2 text-[14px] leading-relaxed text-fg"
        />
      )}

      {item.kind === "image" && (
        <div className="grid size-full place-items-center overflow-hidden rounded-md border border-line bg-surface">
          {item.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URLs, no loader
            <img
              src={item.src}
              alt={item.alt}
              className="size-full object-cover"
              draggable={false}
            />
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 p-4 text-center">
              <Icon name="image" size={18} className="text-fg-subtle" />
              <span className="text-[11.5px] text-fg-subtle">
                Click to add an image
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Through the shared path: a photo straight off a phone is
                  // several megabytes, and a browser's whole storage quota is
                  // five to ten. Two of those would break every other write in
                  // the workspace. `prepareImage` scales it down first.
                  prepareImage(file).then(
                    (image) =>
                      updateBoardItem(projectId, item.id, {
                        src: image.src,
                        alt: image.name,
                      }),
                    (error: unknown) =>
                      notify(
                        error instanceof Error
                          ? error.message
                          : "That picture couldn't be read.",
                      ),
                  );
                }}
              />
            </label>
          )}
        </div>
      )}

      {item.kind === "card" && <ProjectCardBody projectId={item.projectId} />}

      {item.locked && (
        <span
          className="absolute top-1 right-1 rounded-xs bg-canvas/70 p-0.5 text-fg-subtle"
          title="Locked"
        >
          <Icon name="lock" size={10} />
        </span>
      )}

      {/* Comment affordance: always there when a thread exists, on selection
          otherwise — so an unread comment can never hide. */}
      {(comments.length > 0 || selected) && (
        <CommentPin
          projectId={projectId}
          itemId={item.id}
          comments={comments}
          open={thread}
          onOpenChange={setThread}
        />
      )}

      {selected && !item.locked && (
        <>
          {GRIPS.map(([grip, cls]) => (
            <span
              key={grip}
              data-grip={grip}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize(e, grip);
              }}
              className={cn(
                "absolute size-2.5 rounded-[2px] border border-accent bg-canvas",
                cls,
              )}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Click to select, double-click to type. Board items shouldn't swallow the
 * first click — you're usually arranging, not writing.
 */
function Editable({
  value,
  editing,
  onEditingChange,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  if (!editing)
    return (
      <div className={cn(className, "overflow-hidden whitespace-pre-wrap select-none")}>
        {value || <span className="text-fg-subtle">{placeholder}</span>}
      </div>
    );

  return (
    <textarea
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onEditingChange(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onEditingChange(false);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={cn(
        className,
        "resize-none bg-transparent outline-none placeholder:text-fg-subtle",
      )}
    />
  );
}
