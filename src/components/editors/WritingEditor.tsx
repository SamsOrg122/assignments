"use client";

/**
 * The Writing editor.
 *
 * The pain that started the product: a word processor where the text is the
 * smallest thing on screen. Here the page is the only thing on screen — the
 * measure is set, the leading is generous, the chrome hides until you reach for
 * it, and focus mode dims everything but the paragraph under the caret.
 */

import { useMemo, useState } from "react";
import type { PeerState, Project } from "@/lib/types";
import { DEFAULT_TYPOGRAPHY } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useProjects } from "@/lib/store";
import { projectWordCount, outline } from "@/lib/summary";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ProjectTopBar } from "./ProjectTopBar";
import { TypographyPanel } from "./TypographyPanel";
import { DictationBar } from "./DictationBar";
import { Canvas } from "@/components/canvas/Canvas";

export function WritingEditor({
  project,
  peers,
}: {
  project: Project;
  peers: PeerState[];
}) {
  const setWordGoal = useProjects((s) => s.setWordGoal);
  const focusMode = useUI((s) => s.focusMode);
  const setFocusMode = useUI((s) => s.setFocusMode);
  const openAI = useUI((s) => s.openAI);

  const [typeOpen, setTypeOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [dictating, setDictating] = useState(false);

  const type = project.typography ?? DEFAULT_TYPOGRAPHY;
  const words = useMemo(() => projectWordCount(project), [project]);
  const sections = useMemo(() => outline(project.blocks), [project.blocks]);

  const progress = project.wordGoal
    ? Math.min(1, words / project.wordGoal)
    : null;

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
                icon="history"
                label="Outline"
                active={outlineOpen}
                onClick={() => setOutlineOpen((v) => !v)}
              />
              <IconToggle
                icon="mic"
                label="Speak to prose"
                active={dictating}
                onClick={() => setDictating((v) => !v)}
              />
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
                icon="focus"
                label="Focus mode"
                active={focusMode}
                onClick={() => setFocusMode(true)}
              />
            </span>
          }
        />
      )}

      <main
        className={cn(
          "relative flex-1 overflow-y-auto",
          focusMode && "focus-mode",
        )}
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
                {words.toLocaleString()} word{words === 1 ? "" : "s"}
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
                    {project.wordGoal?.toLocaleString()}
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
                className="label-mono transition-colors duration-150 hover:!text-fg-muted"
              >
                Ask about the whole document
              </button>
            </header>
          )}

          <div
            className="prose-shell"
            style={
              {
                "--prose-size": `${type.fontSize}px`,
                "--prose-leading": String(type.lineHeight),
                "--prose-tracking": `${type.letterSpacing}em`,
              } as React.CSSProperties
            }
            data-family={type.family}
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
          </div>
        </div>

        {outlineOpen && !focusMode && (
          <OutlinePanel
            sections={sections}
            goal={project.wordGoal}
            onGoal={(g) => setWordGoal(project.id, g)}
            onClose={() => setOutlineOpen(false)}
          />
        )}
      </main>

      {dictating && (
        <DictationBar project={project} onClose={() => setDictating(false)} />
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
  onGoal,
  onClose,
}: {
  sections: ReturnType<typeof outline>;
  goal?: number;
  onGoal: (goal: number | undefined) => void;
  onClose: () => void;
}) {
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
        {sections.map((s) => (
          <li key={s.blockId}>
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
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-line pt-3">
        <label className="label-mono mb-1.5 block">Word goal</label>
        <input
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
          {total.toLocaleString()} written
          {goal ? ` · ${Math.max(0, goal - total).toLocaleString()} to go` : ""}
        </p>
      </div>
    </aside>
  );
}
