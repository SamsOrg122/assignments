"use client";

/**
 * A picture in the document.
 *
 * The thing being copied here is the board's image tile, which people like
 * because getting a photo in costs two clicks and nothing else. So: click the
 * frame, pick a file, done. Drop one on it, or paste one, and it costs zero.
 *
 * Everything after that — width, alignment, edge, caption — is a control that
 * appears on hover and disappears again. A picture in a thesis should look like
 * a picture, not like a widget with a picture inside it.
 */

import { useCallback, useRef, useState } from "react";
import type { ImageAlign, ImageBlock as ImageBlockModel, ImageFrame } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { figureFor } from "@/lib/figures";
import { useUI } from "@/lib/ui-store";
import { formatImageSize, imageFrom, pickImage, prepareImage } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const ALIGNS: Array<{ value: ImageAlign; label: string }> = [
  { value: "left", label: "Left" },
  { value: "centre", label: "Centre" },
  { value: "full", label: "Full" },
];

const FRAMES: Array<{ value: ImageFrame; label: string }> = [
  { value: "none", label: "Plain" },
  { value: "line", label: "Border" },
  { value: "shadow", label: "Lifted" },
];

/** Percentage of the column, clamped to something a page can still read. */
const MIN_SCALE = 25;
const MAX_SCALE = 100;

export function ImageBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: ImageBlockModel;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);
  /** "Figure 3", or nothing while the frame is still empty. */
  const number = useProjects(
    (s) =>
      figureFor(
        s.projects.find((p) => p.id === projectId)?.blocks ?? [],
        block.id,
      )?.label ?? "",
  );
  const notify = useUI((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const scale = block.scale ?? 100;
  const align = block.align ?? "centre";
  const frame = block.frame ?? "none";

  const patch = useCallback(
    (next: Partial<ImageBlockModel>) =>
      updateBlock<ImageBlockModel>(projectId, block.id, next),
    [updateBlock, projectId, block.id],
  );

  /** One path in, wherever the file came from. */
  const accept = useCallback(
    async (file: File | Blob | null) => {
      if (!file) return;
      setBusy(true);
      try {
        const image = await prepareImage(file);
        patch({
          src: image.src,
          alt: block.alt || image.name.replace(/\.[a-z0-9]+$/i, ""),
          naturalWidth: image.width,
          naturalHeight: image.height,
          bytes: image.bytes,
        });
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "That picture couldn't be read.",
        );
      } finally {
        setBusy(false);
      }
    },
    [patch, block.alt, notify],
  );

  const choose = useCallback(async () => {
    setBusy(true);
    try {
      const image = await pickImage();
      if (!image) return;
      patch({
        src: image.src,
        alt: block.alt || image.name.replace(/\.[a-z0-9]+$/i, ""),
        naturalWidth: image.width,
        naturalHeight: image.height,
        bytes: image.bytes,
      });
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "That picture couldn't be read.",
      );
    } finally {
      setBusy(false);
    }
  }, [patch, block.alt, notify]);

  /**
   * Drag the right edge to set the width.
   *
   * Pointer capture rather than window listeners: the drag keeps working over
   * the image, over the toolbar, and outside the window, and it ends even if
   * the pointer is released somewhere this component never hears about.
   */
  const onResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const column = frameRef.current?.parentElement?.getBoundingClientRect();
    if (!column || column.width === 0) return;
    const startX = e.clientX;
    const startScale = scale;
    // Centred pictures grow from both edges, so a pixel of pointer travel is
    // two pixels of width. Anything else feels like the handle is slipping.
    const gain = align === "centre" ? 2 : 1;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - startX) * gain * 100) / column.width;
      patch({
        scale: Math.round(
          Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale + delta)),
        ),
      });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      const file = imageFrom(e.dataTransfer);
      if (!file) return;
      e.preventDefault();
      setOver(false);
      void accept(file);
    },
    onPaste: (e: React.ClipboardEvent) => {
      const file = imageFrom(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void accept(file);
    },
  };

  if (!block.src) {
    return (
      <div
        {...dropHandlers}
        tabIndex={0}
        role="button"
        onClick={choose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void choose();
          }
        }}
        className={cn(
          "grid min-h-[168px] cursor-pointer place-items-center rounded-md border border-dashed text-center transition-colors duration-150 outline-none",
          over
            ? "border-accent bg-accent/5"
            : "border-line hover:border-line-strong focus-visible:border-accent",
        )}
      >
        <div className="flex flex-col items-center gap-2 px-6 py-8">
          <span className="grid size-9 place-items-center rounded-sm border border-line text-fg-subtle">
            <Icon name={busy ? "refresh" : "image"} size={15} />
          </span>
          <span className="text-[12.5px] text-fg-muted">
            {busy ? "Reading the picture…" : "Add a picture"}
          </span>
          <span className="text-[11px] text-fg-subtle">
            Click to choose, or drop a file here. ⌘V pastes one.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div {...dropHandlers} className="group/image relative">
      <div
        className={cn(
          "flex",
          align === "left" && "justify-start",
          align === "centre" && "justify-center",
          align === "full" && "justify-stretch",
        )}
      >
        <div
          ref={frameRef}
          className="relative"
          style={{ width: align === "full" ? "100%" : `${scale}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL
              from the user's own disk; the optimiser has nothing to fetch. */}
          <img
            src={block.src}
            alt={block.alt}
            width={block.naturalWidth || undefined}
            height={block.naturalHeight || undefined}
            className={cn(
              "block h-auto w-full rounded-sm",
              frame === "line" && "border border-line",
              frame === "shadow" &&
                "shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)]",
            )}
          />

          {/* Width handle. Hidden until hover — see the note up top. */}
          {align !== "full" && (
            <button
              type="button"
              onPointerDown={onResize}
              aria-label="Drag to resize the picture"
              className="absolute top-1/2 -right-1.5 h-12 w-3 -translate-y-1/2 cursor-ew-resize touch-none opacity-0 transition-opacity duration-150 group-hover/image:opacity-100 focus-visible:opacity-100 print:hidden"
            >
              <span className="mx-auto block h-full w-0.5 rounded-full bg-fg-subtle" />
            </button>
          )}

          {/* Controls. One row, on hover, floating over the picture's own top
              edge rather than above the block — a bar that sits above would
              cover the sentence the figure belongs to. */}
          <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-line-strong bg-surface/95 p-1 opacity-0 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.85)] backdrop-blur-sm transition-opacity duration-150 group-hover/image:pointer-events-auto group-hover/image:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 print:hidden">
            <Segmented
              options={ALIGNS}
              value={align}
              onChange={(value) => patch({ align: value })}
            />
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            <Segmented
              options={FRAMES}
              value={frame}
              onChange={(value) => patch({ frame: value })}
            />
            <span aria-hidden="true" className="h-4 w-px bg-line" />
            <button
              type="button"
              onClick={choose}
              className="rounded-xs px-1.5 py-1 text-[11px] whitespace-nowrap text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() =>
                patch({ src: "", naturalWidth: undefined, naturalHeight: undefined, bytes: undefined })
              }
              aria-label="Remove the picture"
              className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
            >
              <Icon name="trash" size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* The number is rendered beside the caption rather than typed into it,
          so it stays right when a picture is inserted above this one. */}
      <div
        className={cn(
          "mt-2 flex w-full items-baseline gap-1.5",
          align === "centre" && "justify-center",
        )}
      >
        {number && (
          <span className="shrink-0 text-[12px] font-medium text-fg-muted">
            {number}.
          </span>
        )}
        <input
          value={block.caption ?? ""}
          onChange={(e) => patch({ caption: e.target.value })}
          placeholder="Add a caption"
          aria-label="Picture caption"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[12px] text-fg-subtle outline-none placeholder:text-fg-subtle/60 focus:text-fg-muted",
            align === "centre" && !block.caption && "text-center",
            // A caption that only appears when there's something to read, or
            // when you're looking for it.
            !block.caption &&
              "opacity-0 transition-opacity duration-150 group-hover/image:opacity-100 focus:opacity-100 print:hidden",
          )}
        />
      </div>

      {/* Alt text and weight, out of the way but not hidden: one is what a
          screen reader says, the other is why the workspace got heavy. */}
      <div className="mt-1.5 flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover/image:opacity-100 focus-within:opacity-100 print:hidden">
        <label className="label-mono shrink-0" htmlFor={`alt-${block.id}`}>
          Alt
        </label>
        <input
          id={`alt-${block.id}`}
          value={block.alt}
          onChange={(e) => patch({ alt: e.target.value })}
          placeholder="Describe the picture"
          className="min-w-0 flex-1 bg-transparent font-mono text-[10.5px] text-fg-subtle outline-none placeholder:text-fg-subtle/60 focus:text-fg-muted"
        />
        {block.bytes ? (
          <span className="shrink-0 font-mono text-[9.5px] text-fg-subtle">
            {formatImageSize(block.bytes)}
            {block.naturalWidth
              ? ` · ${block.naturalWidth}×${block.naturalHeight}`
              : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xs px-1.5 py-1 text-[11px] whitespace-nowrap transition-colors duration-150",
            value === option.value
              ? "bg-surface-3 text-fg"
              : "text-fg-subtle hover:text-fg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
