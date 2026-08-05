"use client";

/**
 * Speak-to-prose.
 *
 * The distinction from dictation is the whole feature: what you *said* is shown
 * greyed and small while you talk, and what gets written is the cleaned-up
 * prose — punctuated, de-filled, re-broken into paragraphs. You see both, so
 * you can tell it isn't just transcribing you.
 *
 * Capture goes through `listen()` (real Web Speech where available), and the
 * clean-up goes through the same `askAI` seam as everything else, so a real
 * model replaces the rewrite without touching this component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, TextBlock } from "@/lib/types";
import { listen, speechProviderName, type SpeechSession } from "@/lib/speech";
import { askAI, type AIChange } from "@/lib/ai";
import { buildContext } from "@/lib/ai/context";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

type Phase = "idle" | "listening" | "writing" | "ready";

export function DictationBar({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const updateBlock = useProjects((s) => s.updateBlock);
  const notify = useUI((s) => s.notify);
  const focusedBlockId = useUI((s) => s.focusedBlockId);

  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [prose, setProse] = useState("");
  const [change, setChange] = useState<AIChange | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<SpeechSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The block the caret was in when recording began — where prose will land.
  const targetRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      sessionRef.current?.cancel();
      abortRef.current?.abort();
    },
    [],
  );

  const start = useCallback(async () => {
    setError(null);
    setHeard("");
    setProse("");
    setChange(null);
    targetRef.current =
      focusedBlockId ?? project.blocks.filter((b) => b.type === "text").at(-1)?.id ?? null;

    try {
      sessionRef.current = await listen({
        onChunk: (chunk) => setHeard(chunk.text),
        onError: (message) => setError(message),
        onLevel: setLevel,
      });
      setPhase("listening");
    } catch {
      setError("Couldn't start listening. Check microphone permission.");
      setPhase("idle");
    }
  }, [focusedBlockId, project.blocks]);

  /** Stop capture, then run the transcript through the AI clean-up pass. */
  const finish = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;

    const raw = (await session.stop()) || heard;
    setLevel(0);

    if (!raw.trim()) {
      setPhase("idle");
      setError("Nothing was captured.");
      return;
    }

    setPhase("writing");
    setProse("");

    const controller = new AbortController();
    abortRef.current = controller;

    const target = targetRef.current;
    const context = buildContext(
      project,
      projects,
      target
        ? { blockId: target, blockType: "text", text: "" }
        : undefined,
    );

    try {
      // The `__speech__` prefix marks this as a transcript rather than
      // something the user typed, so the provider can't mistake one for
      // the other.
      for await (const chunk of askAI(`__speech__ ${raw}`, context, controller.signal)) {
        if (controller.signal.aborted) return;
        if (chunk.type === "text") setProse((p) => p + chunk.value);
        else if (chunk.type === "change") setChange(chunk.value);
        else if (chunk.type === "done") setPhase("ready");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError("The clean-up pass failed.");
      setPhase("ready");
    }
  }, [heard, project, projects]);

  const accept = useCallback(() => {
    if (!change || change.kind !== "append-text") return;
    const existing = project.blocks.find((b) => b.id === change.blockId);
    const before =
      existing?.type === "text" && existing.html !== "<p></p>" ? existing.html : "";
    updateBlock<TextBlock>(project.id, change.blockId, {
      html: before + change.html,
    });
    notify("Prose inserted");
    onClose();
  }, [change, project, updateBlock, notify, onClose]);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    abortRef.current?.abort();
    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 pb-5 print:hidden">
      <div
        className="anim-slide-up w-full max-w-[620px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)]"
        role="dialog"
        aria-label="Speak to prose"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
          <Icon name="mic" size={13} className={phase === "listening" ? "text-accent" : "text-fg-subtle"} />
          <span className="label-mono">Speak to prose</span>
          <span className="ml-auto font-mono text-[10px] text-fg-subtle">
            {phase === "listening"
              ? "listening…"
              : phase === "writing"
                ? "writing it up…"
                : phase === "ready"
                  ? "ready"
                  : `via ${speechProviderName()}`}
          </span>
          <button
            type="button"
            onClick={cancel}
            aria-label="Close"
            className="rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* What was heard — deliberately quiet and small. It is not the output. */}
        {(phase === "listening" || heard) && (
          <div className="border-b border-line px-3 py-2.5" data-testid="heard">
            <p className="mb-1.5 text-[11px] text-fg-subtle">Heard</p>
            <p className="max-h-[64px] overflow-y-auto font-mono text-[11px] leading-relaxed text-fg-subtle">
              {heard || "…"}
            </p>
          </div>
        )}

        {/* What will be written. */}
        {(phase === "writing" || phase === "ready") && (
          <div className="border-b border-line px-3 py-3" data-testid="written">
            <p className="mb-1.5 text-[11px] text-fg-subtle">Written</p>
            <div className="max-h-[180px] overflow-y-auto text-[13.5px] leading-relaxed text-fg">
              {change && change.kind === "append-text" ? (
                <div
                  className="prose-canvas prose-serif [&_p]:mb-2"
                  // Provider output only — no user HTML reaches this path.
                  dangerouslySetInnerHTML={{ __html: change.html }}
                />
              ) : (
                <p className="text-fg-muted">{prose}</p>
              )}
              {phase === "writing" && (
                <span className="anim-shimmer ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-accent" />
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="border-b border-line px-3 py-2 text-[12px] text-warn">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 px-3 py-2.5">
          {phase === "idle" && (
            <button
              type="button"
              onClick={() => void start()}
              className="flex items-center gap-2 rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
            >
              <Icon name="mic" size={12} />
              Start talking
            </button>
          )}

          {phase === "listening" && (
            <>
              <button
                type="button"
                onClick={() => void finish()}
                className="flex items-center gap-2 rounded-sm border border-line-strong px-3 py-1.5 text-[12.5px] text-fg transition-colors duration-150 hover:bg-surface-2"
              >
                <Icon name="stop" size={11} />
                Stop &amp; write it up
              </button>
              <LevelMeter level={level} />
            </>
          )}

          {phase === "ready" && change && (
            <>
              <button
                type="button"
                onClick={accept}
                className="rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
              >
                Insert
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setChange(null);
                  setProse("");
                  setHeard("");
                }}
                className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                Discard
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

/** Real input level from the microphone, so "listening" isn't a lie. */
function LevelMeter({ level }: { level: number }) {
  const bars = 12;
  const lit = Math.round(Math.min(1, level * 2.2) * bars);
  return (
    <span className="flex items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[2px] rounded-full transition-[height,background-color] duration-100",
            i < lit ? "bg-accent" : "bg-line-strong",
          )}
          style={{ height: i < lit ? 6 + (i % 4) * 3 : 4 }}
        />
      ))}
    </span>
  );
}
