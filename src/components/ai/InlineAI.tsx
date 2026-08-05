"use client";

/**
 * Inline AI.
 *
 * Deliberately not a sidebar chat: it opens where you are (a selection, a block
 * gutter, or ⌘K), streams in place, and any document edit arrives as a
 * *proposal* with Accept / Discard. Nothing is written until you accept.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askAI, type AIChange } from "@/lib/ai";
import { buildContext } from "@/lib/ai/context";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useUI, type AITarget } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import type { Row, TextBlock } from "@/lib/types";

const SUGGESTIONS: Record<string, string[]> = {
  text: ["Summarize this", "Tighten this prose", "Turn this into slides"],
  table: ["Forecast this column", "Summarize this table"],
  chart: ["Explain what this shows", "Summarize the project"],
  slides: ["Tighten these bullets", "Summarize this deck"],
  code: ["Explain this code", "Summarize the project"],
};

/**
 * Mounted only while a target exists, and keyed on the open counter, so every
 * invocation starts from a clean prompt without reset-in-effect gymnastics.
 */
export function InlineAI() {
  const target = useUI((s) => s.aiTarget);
  const openId = useUI((s) => s.aiOpenId);
  if (!target) return null;
  return <AIPopover key={openId} target={target} />;
}

function AIPopover({ target }: { target: AITarget }) {
  const closeAI = useUI((s) => s.closeAI);
  const notify = useUI((s) => s.notify);

  const projects = useProjects((s) => s.projects);
  const updateBlock = useProjects((s) => s.updateBlock);
  const insertBlock = useProjects((s) => s.insertBlock);
  const addValueColumn = useProjects((s) => s.addValueColumn);
  const addProject = useProjects((s) => s.addProject);
  const removeBlock = useProjects((s) => s.removeBlock);
  const router = useRouter();

  const [prompt, setPrompt] = useState(target.seedPrompt ?? "");
  const [answer, setAnswer] = useState("");
  const [change, setChange] = useState<AIChange | null>(null);
  const [status, setStatus] = useState<"idle" | "streaming" | "done">("idle");

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const project = projects.find((p) => p.id === target.projectId) ?? null;

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Abandon any in-flight stream when the popover goes away.
  useEffect(() => {
    const controller = abortRef;
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [answer]);

  const ask = useCallback(
    async (text: string) => {
      if (!project || !text.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setAnswer("");
      setChange(null);
      setStatus("streaming");

      const context = buildContext(
        project,
        projects,
        target.selectionText
          ? {
              blockId: target.blockId,
              blockType: target.blockType,
              text: target.selectionText,
            }
          : undefined,
      );

      try {
        for await (const chunk of askAI(text, context, controller.signal)) {
          if (controller.signal.aborted) return;
          if (chunk.type === "text") setAnswer((a) => a + chunk.value);
          else if (chunk.type === "change") setChange(chunk.value);
          else if (chunk.type === "done") setStatus("done");
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setAnswer((a) => `${a}\n\n_The request failed._`);
        setStatus("done");
      }
    },
    [project, projects, target],
  );

  const accept = useCallback(() => {
    if (!change) return;
    const projectId = target.projectId;

    switch (change.kind) {
      case "replace-text":
        updateBlock<TextBlock>(projectId, change.blockId, { html: change.html });
        break;

      case "append-text": {
        // Appending, never overwriting — dictation adds to what's there.
        const existing = projects
          .find((p) => p.id === projectId)
          ?.blocks.find((b) => b.id === change.blockId);
        const before =
          existing?.type === "text" && existing.html !== "<p></p>"
            ? existing.html
            : "";
        updateBlock<TextBlock>(projectId, change.blockId, {
          html: before + change.html,
        });
        break;
      }

      case "insert-block":
        insertBlock(projectId, change.block, change.afterBlockId || undefined);
        break;

      case "create-project": {
        // The thesis → deck bridge: a brand new Library project, and we land
        // the user in it rather than leaving them to go find it.
        const id = addProject(change.projectKind, change.name);
        for (const block of change.blocks) insertBlock(id, block);
        // The starter block a new project ships with would sit above ours.
        const created = useProjects
          .getState()
          .projects.find((p) => p.id === id);
        if (created)
          for (const block of created.blocks.slice(
            0,
            created.blocks.length - change.blocks.length,
          ))
            removeBlock(id, block.id);
        notify(`Created “${change.name}”`);
        closeAI();
        router.push(`/p/${id}`);
        return;
      }

      case "renumber-headings": {
        // Applied against the live document, not the one the answer saw.
        const current = projects.find((p) => p.id === projectId);
        let n = 0;
        for (const block of current?.blocks ?? []) {
          if (block.type !== "text") continue;
          // h1 is the document title, not section 1.
          const html = block.html.replace(
            /(<h([23])[^>]*>)(.*?)(<\/h\2>)/i,
            (_whole, open: string, _lvl: string, inner: string, close: string) => {
              n++;
              // Strip a previous number before adding the new one, so running
              // this twice renumbers rather than accumulating. The prefix isn't
              // always at character zero — a citation or other inline node can
              // sit in front of it — so clear it from the start of every text
              // run, never from inside a tag.
              const clean = inner.replace(
                /(^|>)([^<]*)/g,
                (_m, boundary: string, text: string) =>
                  boundary + text.replace(/^\s*\d+\s*(?:—|-|\.)\s+/, ""),
              );
              return `${open}${n} — ${clean}${close}`;
            },
          );
          if (html !== block.html)
            updateBlock<TextBlock>(projectId, block.id, { html });
        }
        break;
      }

      case "add-column":
        addValueColumn(
          projectId,
          change.blockId,
          change.column,
          change.values,
          (change.appendRows as Row[] | undefined) ?? [],
        );
        break;
    }

    notify("Change applied");
    closeAI();
  }, [
    change,
    target,
    projects,
    updateBlock,
    insertBlock,
    addValueColumn,
    addProject,
    removeBlock,
    notify,
    closeAI,
    router,
  ]);

  const suggestions = useMemo(
    () => SUGGESTIONS[target.blockType] ?? SUGGESTIONS.text,
    [target],
  );

  if (!project) return null;

  // Keep the popover fully on screen wherever it was invoked from. The
  // accept/reject bar is the point of this surface — it must never be pushed
  // below the fold, so the box is also capped to the remaining height.
  const width = 460;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;

  const left = Math.min(
    Math.max(12, target.anchor.x - width / 2),
    Math.max(12, viewportWidth - width - 12),
  );
  const top = Math.max(
    12,
    Math.min(target.anchor.y, Math.max(72, viewportHeight - 420)),
  );
  const maxHeight = Math.max(220, viewportHeight - top - 16);

  return (
    <div className="fixed inset-0 z-[95] print:hidden" role="dialog" aria-modal="true" aria-label="Ask AI">
      <div className="absolute inset-0" onClick={closeAI} />

      <div
        className="anim-pop absolute flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]"
        style={{ left, top, maxHeight }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeAI();
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Icon name="sparkle" size={13} className="text-accent" />
          <span className="label-mono">Ask AI</span>
          <span className="ml-auto truncate font-mono text-[10px] text-fg-subtle">
            {target.selectionText
              ? `${target.selectionText.split(/\s+/).filter(Boolean).length} words selected`
              : `${project.blocks.length} blocks in context`}
          </span>
          <button
            type="button"
            onClick={closeAI}
            aria-label="Close"
            className="rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5">
          <textarea
            ref={inputRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(prompt);
              }
            }}
            placeholder="Summarize this, forecast this column, turn this into slides…"
            className="max-h-24 min-h-[22px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
          />
          <button
            type="button"
            onClick={() => void ask(prompt)}
            disabled={!prompt.trim() || status === "streaming"}
            aria-label="Send"
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-sm transition-colors duration-150",
              prompt.trim() && status !== "streaming"
                ? "bg-accent text-white hover:brightness-110"
                : "border border-line text-fg-subtle",
            )}
          >
            <Icon name="arrow-up" size={13} />
          </button>
        </div>

        {status === "idle" && !answer && (
          <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setPrompt(s);
                  void ask(s);
                }}
                className="rounded-sm border border-line px-2 py-1 text-[11.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {(status !== "idle" || answer) && (
          <div
            ref={scrollRef}
            // Flexes inside the capped column, so the accept bar below it
            // always stays visible no matter how long the answer runs.
            className="min-h-0 flex-1 overflow-y-auto border-t border-line px-3 py-3"
          >
            <StreamedText text={answer} />
            {status === "streaming" && (
              <span className="anim-shimmer ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-accent" />
            )}
          </div>
        )}

        {change && (
          <div className="shrink-0 border-t border-line bg-surface-2 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-4 place-items-center rounded-xs bg-accent-soft text-accent">
                <Icon name="check" size={10} />
              </span>
              <span className="text-[12px] text-fg">{change.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={accept}
                className="rounded-sm bg-accent px-2.5 py-1 text-[12px] font-medium text-white transition-[filter] duration-150 hover:brightness-110"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => setChange(null)}
                className="rounded-sm border border-line px-2.5 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimal inline markdown — `**bold**`, `_italic_`, `` `code` `` and bullets. */
function StreamedText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-fg-muted">
      {text.split("\n").map((line, i) =>
        line.trim() === "" ? (
          <div key={i} className="h-1" />
        ) : (
          <p key={i} className={line.startsWith("•") ? "pl-1" : undefined}>
            {renderInline(line)}
          </p>
        ),
      )}
    </div>
  );
}

function renderInline(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={i} className="font-medium text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code
          key={i}
          className="rounded-xs border border-line bg-white/5 px-1 py-0.5 font-mono text-[11.5px] text-fg"
        >
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2)
      return (
        <em key={i} className="text-fg-subtle">
          {part.slice(1, -1)}
        </em>
      );
    return <span key={i}>{part}</span>;
  });
}
