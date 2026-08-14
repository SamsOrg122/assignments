"use client";

/**
 * The doorway for somebody arriving from Office.
 *
 * Drag a folder onto the Library and it becomes a Library: the Word files
 * become documents, the PowerPoints become decks, the spreadsheets become
 * tables, and the folders you dragged become the folders you see. The readers
 * for all of that already existed — what did not was any way to start from
 * files rather than from an empty project.
 *
 * Three states worth naming, because each one is a place this could quietly
 * go wrong:
 *
 *  - **Dragging.** The overlay appears only for a drag that actually carries
 *    files, so dragging a paragraph inside the page doesn't tell you it is
 *    about to import something.
 *  - **Working.** Long imports report which file they are on. A progress bar
 *    with no name on it is indistinguishable from a hang.
 *  - **The account.** Afterwards, every single file is either listed as a
 *    project or listed with a reason. This is the part that must not be
 *    softened into "23 files imported" — the four that didn't are the ones
 *    somebody needs to know about today rather than in November.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Button } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { formatNumber } from "@/lib/format";
import {
  ACCEPTED,
  filesFromDrop,
  filesFromInput,
  importAll,
  type ImportReport,
  type ImportSink,
  type Progress,
} from "@/lib/import/bulk";

/**
 * The picker, opened from elsewhere.
 *
 * A module-level handler rather than context: exactly one of these is mounted,
 * on the Library, and the New menu needs to reach it without either of them
 * knowing about the other. The same seam the speech and AI providers use.
 */
let request: ((kind: "files" | "folder") => void) | null = null;

export function openImportPicker(kind: "files" | "folder" = "files") {
  request?.(kind);
}

export function ImportZone() {
  const router = useRouter();
  const notify = useUI((s) => s.notify);

  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  /* dragenter/dragleave fire for every child element the pointer crosses;
     counting them is the only way to know when the drag has really left. */
  const depth = useRef(0);

  useEffect(() => {
    request = (kind) =>
      (kind === "folder" ? folderRef : filesRef).current?.click();
    return () => {
      request = null;
    };
  }, []);

  const run = useCallback(
    async (incoming: Awaited<ReturnType<typeof filesFromDrop>>) => {
      if (!incoming.length) return;
      setProgress({ done: 0, total: incoming.length, name: "" });

      const store = useProjects.getState();
      const sink: ImportSink = {
        addFolder: (name, parentId) => store.addFolder(name, parentId),
        addProject: (kind, name) => store.addProject(kind, name),
        setBlocks: (projectId, blocks) => store.setBlocks(projectId, blocks),
        moveProject: (projectId, folderId) =>
          store.moveProject(projectId, folderId),
      };

      try {
        const result = await importAll(incoming, sink, setProgress);
        setReport(result);
      } catch {
        notify("The import stopped. Nothing that already arrived was lost.");
      } finally {
        setProgress(null);
      }
    },
    [notify],
  );

  /* ── The drag ─────────────────────────────────────────── */

  useEffect(() => {
    const carriesFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      // Without this the browser navigates to the file instead of dropping it.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer || !carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void filesFromDrop(e.dataTransfer).then(run);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [run]);

  const pick = (list: FileList | null, input: HTMLInputElement | null) => {
    if (list?.length) void run(filesFromInput(list));
    // Cleared so choosing the same folder twice in a row still fires.
    if (input) input.value = "";
  };

  return (
    <>
      <input
        ref={filesRef}
        type="file"
        multiple
        accept={ACCEPTED}
        className="sr-only"
        aria-label="Choose files to import"
        onChange={(e) => pick(e.target.files, e.target)}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        // Not in React's typings, and the only way to pick a whole folder.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        className="sr-only"
        aria-label="Choose a folder to import"
        onChange={(e) => pick(e.target.files, e.target)}
      />

      {dragging && !progress && (
        <div
          data-testid="import-overlay"
          className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-canvas/80 backdrop-blur-sm"
        >
          <div className="anim-pop rounded-lg border-2 border-dashed border-accent bg-surface px-8 py-7 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
            <p className="text-[15px] font-medium text-fg">
              Drop them here.
            </p>
            <p className="mt-1.5 max-w-[42ch] text-[12.5px] leading-relaxed text-fg-muted">
              Word, PowerPoint, Excel, CSV, text and Markdown. Drop a whole
              folder and its folders come with it.
            </p>
          </div>
        </div>
      )}

      {progress && (
        <div
          role="status"
          aria-live="polite"
          className="anim-slide-up fixed bottom-4 left-4 z-[60] w-[300px] rounded-md border border-line-strong bg-surface p-3 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)]"
        >
          <p className="text-[12.5px] text-fg">
            Reading {formatNumber(Math.min(progress.done + 1, progress.total))}{" "}
            of {formatNumber(progress.total)}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
            {progress.name || "Finishing up…"}
          </p>
          <span className="mt-2 block h-px w-full overflow-hidden bg-line">
            <span
              className="block h-px bg-accent transition-[width] duration-200"
              style={{
                width: `${(progress.done / Math.max(1, progress.total)) * 100}%`,
              }}
            />
          </span>
        </div>
      )}

      {report && (
        <ImportReportDialog
          report={report}
          onClose={() => setReport(null)}
          onOpenFirst={() => {
            const first = report.landed[0];
            setReport(null);
            if (first) router.push(`/p/${first.projectId}`);
          }}
        />
      )}
    </>
  );
}

function ImportReportDialog({
  report,
  onClose,
  onOpenFirst,
}: {
  report: ImportReport;
  onClose: () => void;
  onOpenFirst: () => void;
}) {
  const { landed, refused, folders } = report;

  return (
    <Dialog
      title={
        landed.length
          ? `${formatNumber(landed.length)} ${landed.length === 1 ? "project" : "projects"} came in`
          : "Nothing came in"
      }
      description={
        folders
          ? `${formatNumber(folders)} folder${folders === 1 ? "" : "s"} were made to match where the files sat.`
          : undefined
      }
      onClose={onClose}
      width={600}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {landed.length > 0 && (
            <Button variant="primary" onClick={onOpenFirst}>
              Open the first one
            </Button>
          )}
        </>
      }
    >
      {landed.length > 0 && (
        <ul className="mb-4 max-h-[240px] overflow-y-auto rounded-sm border border-line">
          {landed.map((item) => (
            <li
              key={item.projectId}
              className="flex items-baseline gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0"
            >
              <Icon
                name="check"
                size={11}
                className="translate-y-px shrink-0 text-accent"
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                {item.name}
              </span>
              <span className="shrink-0 text-[11px] text-fg-subtle">
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {refused.length > 0 && (
        <>
          {/*
            Named, every one of them. The number alone is the version of this
            that reads as reassuring and is in fact the problem.
          */}
          <p className="mb-1.5 text-[12.5px] text-fg">
            {formatNumber(refused.length)}{" "}
            {refused.length === 1 ? "file" : "files"} didn&apos;t come in:
          </p>
          <ul className="max-h-[200px] overflow-y-auto rounded-sm border border-warn/30 bg-warn/[0.05]">
            {refused.map((item) => (
              <li
                key={item.name}
                className="border-b border-warn/15 px-2.5 py-1.5 text-[12px] leading-relaxed last:border-b-0"
              >
                <span className="text-fg">{item.name}</span>
                <span className="text-fg-muted"> — {item.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {!landed.length && !refused.length && (
        <p className="text-[13px] leading-relaxed text-fg-muted">
          There was nothing in there this could open. Word, PowerPoint, Excel,
          CSV, text and Markdown all work.
        </p>
      )}
    </Dialog>
  );
}
