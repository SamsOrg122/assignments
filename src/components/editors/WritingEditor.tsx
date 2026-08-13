"use client";

/**
 * The Writing editor.
 *
 * The pain that started the product: a word processor where the text is the
 * smallest thing on screen. Here the page is the only thing on screen — the
 * measure is set, the leading is generous, the chrome hides until you reach for
 * it, and focus mode dims everything but the paragraph under the caret.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PeerState, Project } from "@/lib/types";
import { proseVars } from "@/lib/doc-presets";
import { DEFAULT_TYPOGRAPHY } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "@/lib/store";
import { projectWordCount, outline } from "@/lib/summary";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ProjectTopBar } from "./ProjectTopBar";
import { TypographyPanel } from "./TypographyPanel";
import { PagePanel } from "./PagePanel";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { countSuggestions } from "@/lib/suggestions";
import { FindReplace } from "./FindReplace";
import { DictationBar } from "./DictationBar";
import { Canvas } from "@/components/canvas/Canvas";
import { SourcesPanel } from "@/components/sources/SourcesPanel";
import { VersionTimeline } from "./VersionTimeline";
import { NotesList } from "./NotesList";
import { formatNumber } from "@/lib/format";

export function WritingEditor({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const setWordGoal = useProjects((s) => s.setWordGoal);
  const setSectionGoal = useProjects((s) => s.setSectionGoal);
  const snapshot = useProjects((s) => s.snapshot);
  const focusMode = useUI((s) => s.focusMode);
  const setFocusMode = useUI((s) => s.setFocusMode);
  const openAI = useUI((s) => s.openAI);
  const suggestMode = useUI((s) => s.suggestMode);
  const setSuggestMode = useUI((s) => s.setSuggestMode);

  const [typeOpen, setTypeOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const insertBlock = useProjects((s) => s.insertBlock);
  const notify = useUI((s) => s.notify);

  /**
   * Append what came out of the Word file, rather than replacing what is here.
   * An import that silently overwrote a draft would be unforgivable, and
   * appending is undoable by deleting blocks.
   */
  const importDocx = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const { importDocxFile } = await import("@/lib/docx/read");
      const imported = await importDocxFile(file);
      let after = project.blocks[project.blocks.length - 1]?.id;
      for (const block of imported.blocks) {
        after = insertBlock(project.id, block, after);
      }
      const carried = [
        `${imported.blocks.length} block${imported.blocks.length === 1 ? "" : "s"}`,
        imported.notes ? `${imported.notes} note${imported.notes === 1 ? "" : "s"}` : "",
        imported.proposed
          ? `${imported.proposed} proposed change${imported.proposed === 1 ? "" : "s"}`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
      notify(
        `Imported ${carried}` +
          (imported.skipped.length
            ? ` — ${imported.skipped.join(", ")} not carried over`
            : ""),
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not read that file");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const type = project.typography ?? DEFAULT_TYPOGRAPHY;
  const words = useMemo(() => projectWordCount(project), [project]);
  const sections = useMemo(() => outline(project.blocks), [project.blocks]);
  const proposed = useMemo(
    () =>
      project.blocks.reduce(
        (n, b) => n + (b.type === "text" ? countSuggestions(b.html) : 0),
        0,
      ),
    [project.blocks],
  );

  const progress = project.wordGoal
    ? Math.min(1, words / project.wordGoal)
    : null;

  /**
   * Capture history in the background. Debounced well past a keystroke, and
   * the store coalesces anything inside its window, so a session of writing
   * becomes a handful of timeline points rather than hundreds.
   */
  // ⌘F is find & replace here — the browser's own find can't see across
  // virtualised tables anyway, and a writing tool owns this key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const blocks = project.blocks;
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(() => snapshot(project.id, "Writing"), 3000);
    return () => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    };
  }, [blocks, project.id, snapshot]);

  return (
    <>
      {/* In focus mode the bar is gone entirely — that's the point of it. */}
      {!focusMode && (
        <ProjectTopBar
          project={project}
          peers={peers}
          tools={
            <span className="relative flex shrink-0 items-center gap-1">
              <IconToggle
                icon="sort"
                label="Outline"
                active={outlineOpen}
                onClick={() => setOutlineOpen((v) => !v)}
              />
              <IconToggle
                icon="quote"
                label="Sources"
                active={sourcesOpen}
                onClick={() => {
                  setSourcesOpen((v) => !v);
                  setOutlineOpen(false);
                }}
              />
              <IconToggle
                icon="history"
                label="Version timeline"
                active={timelineOpen}
                onClick={() => setTimelineOpen((v) => !v)}
              />
              <IconToggle
                icon="mic"
                label="Speak to prose"
                active={dictating}
                onClick={() => setDictating((v) => !v)}
              />
              <span className="relative">
                <IconToggle
                  icon="file"
                  label="Page setup"
                  active={pageOpen}
                  onClick={() => setPageOpen((v) => !v)}
                />
                {pageOpen && (
                  <PagePanel
                    projectId={project.id}
                    page={project.page}
                    onClose={() => setPageOpen(false)}
                  />
                )}
              </span>
              <span className="relative">
                <IconToggle
                  icon="type"
                  label="Typography"
                  active={typeOpen}
                  onClick={() => setTypeOpen((v) => !v)}
                />
                {typeOpen && (
                  <TypographyPanel
                    projectId={project.id}
                    typography={type}
                    onClose={() => setTypeOpen(false)}
                  />
                )}
              </span>
              <IconToggle
                icon="download"
                label={importing ? "Reading the Word file…" : "Import .docx"}
                active={importing}
                onClick={() => importRef.current?.click()}
              />
              <input
                ref={importRef}
                type="file"
                accept=".docx"
                className="sr-only"
                aria-label="Import a Word file"
                onChange={(e) => void importDocx(e.target.files?.[0])}
              />
              <IconToggle
                icon="check"
                label={suggestMode ? "Suggesting — typing proposes" : "Suggest changes"}
                active={suggestMode}
                onClick={() => {
                  setSuggestMode(!suggestMode);
                  if (!suggestMode) setReviewOpen(true);
                }}
              />
              <IconToggle
                icon="users"
                label={
                  proposed
                    ? `Review ${proposed} proposed change${proposed === 1 ? "" : "s"}`
                    : "Review proposed changes"
                }
                active={reviewOpen}
                onClick={() => setReviewOpen((v) => !v)}
              />
              <IconToggle
                icon="focus"
                label="Focus mode"
                active={focusMode}
                onClick={() => setFocusMode(true)}
              />
            </span>
          }
        />
      )}

      {/*
        The paper class re-points the colour tokens on this element only, so a
        white sheet stays a sheet — the sidebar, top bar and panels around it
        keep the app's own colours rather than the document turning the whole
        window into a second theme.
      */}
      {findOpen && (
        <FindReplace project={project} onClose={() => setFindOpen(false)} />
      )}

      <main
        className={cn(
          "paper relative flex-1 overflow-y-auto",
          focusMode && "focus-mode",
        )}
        data-paper={type.paper && type.paper !== "canvas" ? type.paper : undefined}
      >
        {focusMode && (
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="anim-fade fixed top-4 right-4 z-40 flex items-center gap-2 rounded-md border border-line bg-surface/80 px-2.5 py-1.5 text-[11.5px] text-fg-subtle backdrop-blur transition-colors duration-150 hover:text-fg print:hidden"
          >
            <Icon name="focus" size={11} />
            Exit focus
            <kbd className="kbd">esc</kbd>
          </button>
        )}

        <div
          className="mx-auto w-full"
          style={{
            // The measure is set in `ch`, so it tracks the chosen face and
            // size rather than being a fixed pixel width that drifts.
            maxWidth: `calc(${type.measure}ch + 2 * ${type.margin}px)`,
            paddingLeft: `min(${type.margin}px, 6vw)`,
            paddingRight: `min(${type.margin}px, 6vw)`,
            paddingTop: focusMode ? 96 : 40,
            paddingBottom: 240,
          }}
        >
          {!focusMode && (
            <header className="mb-8 flex items-center gap-3 print:hidden">
              <span className="label-mono">
                {formatNumber(words)} word{words === 1 ? "" : "s"}
              </span>
              {progress !== null && (
                <>
                  <span className="h-px w-16 overflow-hidden bg-line">
                    <span
                      className="block h-px bg-accent transition-[width] duration-300"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-fg-subtle">
                    {Math.round(progress * 100)}% of{" "}
                    {project.wordGoal ? formatNumber(project.wordGoal) : ""}
                  </span>
                </>
              )}
              <span className="h-px flex-1 bg-line" />
              <button
                type="button"
                onClick={() =>
                  openAI({
                    projectId: project.id,
                    blockId: project.blocks[0]?.id ?? "",
                    blockType: "text",
                    selectionText: "",
                    anchor: { x: window.innerWidth / 2, y: 130 },
                    seedPrompt: "Outline my whole thesis and tell me where I am",
                  })
                }
                className="text-[11px] text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                Ask about the whole document
              </button>
            </header>
          )}

          {/* `data-notes-root` resets the note counter once, here, so numbering
              runs across every block rather than restarting in each one. */}
          <div
            className="prose-shell"
            style={proseVars(type)}
            data-family={type.family}
            data-indent={type.firstLineIndent ? "true" : undefined}
            data-notes-root
          >
            <Canvas
              project={project}
              peers={peers}
              proseClassName={
                type.family === "serif"
                  ? "prose-serif"
                  : type.family === "mono"
                    ? "prose-mono"
                    : undefined
              }
              minimal={focusMode}
            />
            {!focusMode && <NotesList project={project} />}
          </div>
        </div>

        {reviewOpen && !focusMode && (
          <SuggestionsPanel project={project} onClose={() => setReviewOpen(false)} />
        )}

        {outlineOpen && !focusMode && (
          <OutlinePanel
            sections={sections}
            goal={project.wordGoal}
            sectionGoals={project.sectionGoals ?? {}}
            onGoal={(g) => setWordGoal(project.id, g)}
            onSectionGoal={(blockId, g) => setSectionGoal(project.id, blockId, g)}
            onClose={() => setOutlineOpen(false)}
          />
        )}

        {sourcesOpen && !focusMode && (
          <SourcesPanel
            projectId={project.id}
            onClose={() => setSourcesOpen(false)}
          />
        )}
      </main>

      {dictating && (
        <DictationBar project={project} onClose={() => setDictating(false)} />
      )}

      {timelineOpen && (
        <VersionTimeline project={project} onClose={() => setTimelineOpen(false)} />
      )}
    </>
  );
}

function IconToggle({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded-sm border p-1.5 transition-colors duration-150",
        active
          ? "border-line-strong bg-surface-2 text-fg"
          : "border-line text-fg-subtle hover:text-fg",
      )}
    >
      <Icon name={icon} size={13} />
    </button>
  );
}

/** Priority 4's "same content as an outline" view, and per-section goals. */
function OutlinePanel({
  sections,
  goal,
  sectionGoals,
  onGoal,
  onSectionGoal,
  onClose,
}: {
  sections: ReturnType<typeof outline>;
  goal?: number;
  sectionGoals: Record<string, number>;
  onGoal: (goal: number | undefined) => void;
  onSectionGoal: (blockId: string, goal?: number) => void;
  onClose: () => void;
}) {
  const goalId = useId();
  const total = sections.reduce((n, s) => n + s.words, 0);

  return (
    <aside className="fixed top-12 right-0 bottom-0 z-30 w-[260px] overflow-y-auto border-l border-line bg-surface/95 p-3 backdrop-blur print:hidden">
      <div className="mb-3 flex items-center justify-between">
        <span className="label-mono">Outline</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close outline"
          className="rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      <ul className="mb-4 flex flex-col gap-0.5">
        {sections.map((s) => {
          const target = sectionGoals[s.blockId];
          const pct = target ? Math.min(1, s.words / target) : null;
          return (
            <li key={s.blockId} className="group/sec">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(`block-${s.blockId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2"
                style={{ paddingLeft: 8 + Math.max(0, s.level - 1) * 12 }}
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
                  {s.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
                  {s.words}
                  {target ? `/${target}` : ""}
                </span>
              </button>

              {/* Per-section target — set it inline, no dialog. */}
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2 pb-1",
                  target ? "" : "opacity-0 group-hover/sec:opacity-100 focus-within:opacity-100",
                )}
                style={{ paddingLeft: 8 + Math.max(0, s.level - 1) * 12 }}
              >
                {pct !== null && (
                  <span className="h-px flex-1 overflow-hidden bg-line">
                    <span
                      className="block h-px bg-accent transition-[width] duration-300"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </span>
                )}
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={target ?? ""}
                  placeholder="target"
                  aria-label={`Word target for ${s.title}`}
                  onChange={(e) =>
                    onSectionGoal(
                      s.blockId,
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  className="w-[62px] rounded-xs border border-line bg-surface-2 px-1.5 py-0.5 text-right font-mono text-[10px] text-fg-muted outline-none focus:border-accent"
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line pt-3">
        {/* Tied to the field, not merely sitting above it: an unassociated
            <label> is a caption, and the input under it has no name at all for
            anybody not reading the screen. */}
        <label className="label-mono mb-1.5 block" htmlFor={goalId}>
          Word goal
        </label>
        <input
          id={goalId}
          type="number"
          min={0}
          step={500}
          value={goal ?? ""}
          placeholder="none"
          onChange={(e) =>
            onGoal(e.target.value ? Number(e.target.value) : undefined)
          }
          className="w-full rounded-sm border border-line bg-surface-2 px-2 py-1.5 font-mono text-[11.5px] text-fg outline-none focus:border-accent"
        />
        <p className="mt-1.5 font-mono text-[10px] text-fg-subtle">
          {formatNumber(total)} written
          {goal ? ` · ${formatNumber(Math.max(0, goal - total))} to go` : ""}
        </p>
      </div>
    </aside>
  );
}
