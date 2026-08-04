"use client";

/**
 * One item on the board. Ordinary DOM, positioned in world coordinates — the
 * parent's transform does the pan and zoom, so nothing here has to know about
 * either.
 */

import { useState } from "react";
import type { BoardItem, PeerState } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ProjectCardBody } from "./ProjectCardBody";

const STICKY_TONES: Record<string, string> = {
  neutral: "bg-[#1f1f1f] text-fg",
  accent: "bg-[#16233f] text-[#cfe0ff]",
  mint: "bg-[#13291f] text-[#bfe6d2]",
  warn: "bg-[#2c2415] text-[#e8d5a8]",
};

export function BoardItemView({
  projectId,
  item,
  selected,
  peers,
  scale,
  onPointerDown,
  onOpen,
}: {
  projectId: string;
  item: BoardItem;
  selected: boolean;
  peers: PeerState[];
  scale: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpen?: () => void;
}) {
  const updateBoardItem = useProjects((s) => s.updateBoardItem);
  const [editing, setEditing] = useState(false);

  const peer = peers[0];

  return (
    <div
      data-board-item={item.id}
      data-board-kind={item.kind}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        if (onOpen) onOpen();
        else if (item.kind === "text" || item.kind === "sticky") setEditing(true);
      }}
      className={cn(
        "absolute rounded-md transition-shadow duration-150",
        selected
          ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
          : "ring-0",
        editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
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
                  // Read to a data URL so it survives a reload with the rest
                  // of the persisted document.
                  const reader = new FileReader();
                  reader.onload = () =>
                    updateBoardItem(projectId, item.id, {
                      src: String(reader.result),
                      alt: file.name,
                    });
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
        </div>
      )}

      {item.kind === "card" && (
        <ProjectCardBody projectId={item.projectId} scale={scale} />
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
