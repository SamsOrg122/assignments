"use client";

/**
 * Files in conversations.
 *
 * One set of pieces shared by every chat surface — channels, DMs and the team
 * assistant — because "drop a file in and ask about it" should work the same
 * everywhere. A file attached to a message carries its *extracted text*, so
 * anyone (and the assistant) can read it without a separate indexing step.
 *
 * Everything routes through the same `ingestFile` seam the Team page uses, so
 * a server-side extractor upgrades all of it at once.
 */

import { useCallback, useRef, useState } from "react";
import { ingestFile } from "@/lib/files/ingest";
import type { FileAttachment, MessageAttachment } from "@/lib/chat";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/* ── State ──────────────────────────────────────────────── */

export function useFileAttachments() {
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [busy, setBusy] = useState(false);

  const add = useCallback(async (list: FileList | File[] | null) => {
    const chosen = list ? Array.from(list) : [];
    if (!chosen.length) return;
    setBusy(true);
    try {
      // Sequential: extraction is CPU-bound (unzip + parse), and racing five
      // of them just makes the first one land later.
      for (const file of chosen) {
        const read = await ingestFile(file);
        setFiles((current) => [
          ...current,
          {
            kind: "file",
            id: read.id,
            name: read.name,
            mime: read.mime,
            size: read.size,
            text: read.text,
            status: read.status,
            note: read.note,
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(
    (id: string) => setFiles((c) => c.filter((f) => f.id !== id)),
    [],
  );
  const clear = useCallback(() => setFiles([]), []);

  return { files, busy, add, remove, clear };
}

/* ── Controls ───────────────────────────────────────────── */

export function AttachButton({
  onFiles,
  busy,
  label = "Attach a file",
}: {
  onFiles: (files: FileList | null) => void;
  busy?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        aria-label={label}
        title={label}
        className={cn(
          "mb-0.5 grid size-6 shrink-0 place-items-center rounded-sm border border-line transition-colors duration-150",
          busy
            ? "text-accent"
            : "text-fg-subtle hover:border-line-strong hover:text-fg",
        )}
      >
        <Icon name={busy ? "refresh" : "plus"} size={12} className={busy ? "anim-shimmer" : undefined} />
      </button>
      {/*
        Hidden from the accessibility tree on purpose. The button above is the
        control; leaving this input exposed with the same name puts two
        identically-named things in the tree and makes a screen reader offer a
        choice that doesn't exist.
      */}
      <input
        ref={ref}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          onFiles(e.target.files);
          // Reset so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Pending attachments, above the input, before anything is sent. */
export function AttachmentChips({
  files,
  onRemove,
}: {
  files: FileAttachment[];
  onRemove: (id: string) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {files.map((f) => (
        <span
          key={f.id}
          className={cn(
            "anim-pop flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11.5px]",
            f.status === "ready"
              ? "border-line bg-surface-2 text-fg-muted"
              : "border-warn/30 bg-warn/10 text-warn",
          )}
        >
          <Icon name="file" size={10} />
          <span className="max-w-[180px] truncate">{f.name}</span>
          <span className="font-mono text-[9.5px] opacity-70">
            {describe(f)}
          </span>
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            aria-label={`Remove ${f.name}`}
            className="text-fg-subtle transition-colors hover:text-danger"
          >
            <Icon name="x" size={9} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** A sent attachment, inside a message. */
export function FileCard({ file }: { file: FileAttachment }) {
  const readable = file.status === "ready";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-2.5 py-2",
        readable ? "border-line bg-surface-2" : "border-warn/25 bg-warn/5",
      )}
    >
      <Icon
        name="file"
        size={13}
        className={cn("shrink-0", readable ? "text-fg-muted" : "text-warn")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-fg">{file.name}</span>
        <span className="block truncate text-[10.5px] text-fg-subtle">
          {describe(file)}
          {file.note ? ` · ${file.note}` : ""}
        </span>
      </span>
      {readable && (
        <span
          title="The assistant can read this file's text."
          className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-[9.5px] text-fg-subtle"
        >
          readable
        </span>
      )}
    </div>
  );
}

/* ── Drop target ────────────────────────────────────────── */

/**
 * Wraps a region so files can be dropped anywhere on it.
 *
 * Counts enter/leave rather than toggling a boolean: dragging over a child
 * element fires `dragleave` on the parent, and a naive flag flickers the
 * whole overlay every time the pointer crosses a nested node.
 */
export function DropZone({
  onFiles,
  children,
  className,
  hint = "Drop to attach",
}: {
  onFiles: (files: FileList | null) => void;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  const [over, setOver] = useState(0);

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) setOver((n) => n + 1);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => setOver((n) => Math.max(0, n - 1))}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(0);
        onFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {over > 0 && (
        <div className="anim-fade pointer-events-none absolute inset-1 z-20 grid place-items-center rounded-md border border-dashed border-accent bg-canvas/80 backdrop-blur-sm">
          <span className="flex items-center gap-2 text-[12.5px] text-accent">
            <Icon name="download" size={13} />
            {hint}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Shared ─────────────────────────────────────────────── */

function describe(file: FileAttachment): string {
  if (file.status !== "ready") return file.note ?? file.status;
  const words = file.text.split(/\s+/).filter(Boolean).length;
  return `${words.toLocaleString()} words · ${size(file.size)}`;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Text of every readable file on a message, for handing to the assistant. */
export function attachmentText(
  attachments: MessageAttachment[] | undefined,
): Array<{ name: string; text: string }> {
  return (attachments ?? [])
    .filter((a): a is FileAttachment => a.kind === "file" && a.status === "ready")
    .map((a) => ({ name: a.name, text: a.text }));
}
