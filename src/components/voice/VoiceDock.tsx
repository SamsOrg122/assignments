"use client";

/**
 * Voice mode.
 *
 * One surface for both directions: you talk, it answers, and it can read the
 * answer back. It docks bottom-centre rather than taking over the screen,
 * because the thing you're talking *about* is usually the thing behind it —
 * a full-screen voice mode makes you close it to check what you just asked for.
 *
 * Two keys drive it, and they're the whole interface if you want them to be:
 * ⌘⇧V starts and stops talking, ⌘⇧S makes the assistant read the answer aloud.
 *
 * The waveform is fed a real measurement in both directions — the microphone
 * while you speak, the synthesiser's word boundaries while it does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { askAI } from "@/lib/ai";
import { buildContext } from "@/lib/ai/context";
import { useTeamContext } from "@/lib/ai/use-team-context";
import { listen, type SpeechSession } from "@/lib/speech";
import {
  canSpeak,
  speak,
  stopSpeaking,
  type SpeakHandle,
} from "@/lib/speech/speak";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { Waveform } from "./Waveform";

type Phase = "idle" | "listening" | "thinking" | "answering";

export function VoiceDock() {
  const open = useUI((s) => s.voiceOpen);
  if (!open) return null;
  return <Dock />;
}

function Dock() {
  const setVoiceOpen = useUI((s) => s.setVoiceOpen);
  const notify = useUI((s) => s.notify);
  const projects = useProjects((s) => s.projects);
  const team = useTeamContext();
  const params = useParams<{ projectId?: string }>();
  const project = projects.find((p) => p.id === params?.projectId) ?? null;

  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [level, setLevel] = useState(0);
  const [readAloud, setReadAloud] = useState(canSpeak());
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<SpeechSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<SpeakHandle | null>(null);
  const answerRef = useRef("");

  const teardown = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    abortRef.current?.abort();
    speechRef.current?.stop();
    speechRef.current = null;
    stopSpeaking();
  }, []);

  useEffect(() => teardown, [teardown]);

  /* ── Speaking the answer ──────────────────────────────── */

  const readOut = useCallback((text: string) => {
    if (!text.trim() || !canSpeak()) return;
    speechRef.current?.stop();
    setPhase("answering");
    speechRef.current = speak(text, {
      onLevel: setLevel,
      onEnd: () => {
        speechRef.current = null;
        setPhase("idle");
      },
      onError: () => {
        // A browser can expose speechSynthesis and still have no voice
        // installed. Say so once and stop trying, rather than failing on
        // every answer with a raw error code.
        setError("This browser has no voice installed, so it can't read aloud.");
        setReadAloud(false);
        setPhase("idle");
      },
    });
  }, []);

  /* ── Asking ───────────────────────────────────────────── */

  const ask = useCallback(
    async (question: string) => {
      setPhase("thinking");
      setAnswer("");
      answerRef.current = "";

      const controller = new AbortController();
      abortRef.current = controller;

      const context = project
        ? buildContext(project, projects, undefined, team)
        : {
            projectId: "",
            projectName: team.workspaceName,
            projectKind: "doc" as const,
            blocks: [],
            workspace: projects.map((p) => ({
              id: p.id,
              name: p.name,
              kind: p.kind,
              summary: `${p.blocks.length} blocks`,
            })),
            team,
            words: 0,
          };

      try {
        for await (const chunk of askAI(question, context, controller.signal)) {
          if (controller.signal.aborted) return;
          if (chunk.type === "text") {
            answerRef.current += chunk.value;
            setAnswer(answerRef.current);
          } else if (chunk.type === "done") {
            // Read the whole answer at once rather than chasing the stream —
            // synthesis mid-sentence sounds like a bad phone line.
            if (readAloud) readOut(answerRef.current);
            else setPhase("idle");
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("That request failed.");
        setPhase("idle");
      }
    },
    [project, projects, readAloud, readOut, team],
  );

  /* ── Listening ────────────────────────────────────────── */

  const startListening = useCallback(async () => {
    setError(null);
    setHeard("");
    setAnswer("");
    speechRef.current?.stop();
    stopSpeaking();
    // Say "listening" before the microphone finishes opening. Permission and
    // device setup take a few hundred milliseconds, and a panel that reads
    // "press to talk" while it is in fact starting to listen invites you to
    // press it again and cancel yourself.
    setPhase("listening");

    try {
      sessionRef.current = await listen({
        onChunk: (chunk) => setHeard(chunk.text),
        onError: (message) => setError(message),
        onLevel: setLevel,
      });
    } catch {
      setError("Couldn't reach the microphone. Check permission.");
      setPhase("idle");
    }
  }, []);

  const stopListening = useCallback(async () => {
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
    setHeard(raw);
    void ask(raw);
  }, [ask, heard]);

  const toggleTalking = useCallback(() => {
    if (phase === "listening") void stopListening();
    else void startListening();
  }, [phase, startListening, stopListening]);

  /* ── Keys ─────────────────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        toggleTalking();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (phase === "answering") {
          speechRef.current?.stop();
          speechRef.current = null;
          setPhase("idle");
        } else if (answerRef.current.trim()) readOut(answerRef.current);
        else notify("Nothing to read out yet");
      } else if (e.key === "Escape") {
        teardown();
        setVoiceOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTalking, phase, readOut, notify, teardown, setVoiceOpen]);

  // Opening voice mode means you want to talk, so it starts listening. Nobody
  // opens this to look at it.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startListening();
  }, [startListening]);

  const busy = phase === "listening" || phase === "answering";
  const status =
    phase === "listening"
      ? "listening"
      : phase === "thinking"
        ? "thinking"
        : phase === "answering"
          ? "speaking"
          : "idle";

  // While listening, keep the *newest* words on screen. Truncating from the
  // front is what a normal one-line clamp does, and it hides exactly the part
  // you're watching to check it heard you correctly.
  const tail = heard.length > 96 ? `…${heard.slice(-96)}` : heard;
  const caption =
    phase === "thinking"
      ? "…"
      : phase === "listening"
        ? tail
        : answer || heard || "Press ⌘⇧V to talk";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[85] flex justify-center px-4 print:hidden">
      <div
        role="dialog"
        aria-label="Voice"
        className="anim-slide-up pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-md border border-line-strong bg-surface shadow-[0_16px_50px_-12px_rgba(0,0,0,0.7)]"
      >
        {/* Status strip. Everything about where you are, on one mono line. */}
        <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
          <span
            className={cn(
              "size-[6px] shrink-0 rounded-full",
              phase === "listening"
                ? "bg-accent"
                : phase === "thinking"
                  ? "bg-fg-subtle"
                  : phase === "answering"
                    ? "bg-leaf"
                    : "bg-line-strong",
            )}
          />
          <span className="font-mono text-[10px] tracking-tight text-fg-subtle">
            {status}
          </span>
          <span className="truncate font-mono text-[10px] text-fg-subtle/70">
            · {project ? project.name : "workspace"}
          </span>

          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setReadAloud((v) => !v)}
              disabled={!canSpeak()}
              aria-pressed={readAloud}
              aria-label="Read answers aloud"
              title={
                canSpeak()
                  ? "Read answers aloud (⌘⇧S)"
                  : "This browser has no speech synthesis"
              }
              className={cn(
                "flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-[10px] transition-colors duration-150",
                !canSpeak()
                  ? "text-fg-subtle opacity-40"
                  : readAloud
                    ? "bg-accent-soft text-accent"
                    : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
              )}
            >
              aloud
              <kbd className="kbd">⌘⇧S</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                teardown();
                setVoiceOpen(false);
              }}
              aria-label="Close voice"
              className="rounded-xs p-0.5 text-fg-subtle transition-colors hover:text-fg"
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        </div>

        {/* The line itself: meter, then words, then the one control. */}
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <Waveform level={level} active={busy} className="h-[26px]" />

          <p
            className={cn(
              "min-w-0 flex-1 overflow-hidden text-[13px] leading-snug whitespace-nowrap",
              phase === "listening" ? "text-right" : "truncate",
              phase === "thinking" || !answer.length
                ? "text-fg-muted"
                : "text-fg",
            )}
            // Fading the leading edge, because that's the end being pushed off
            // as new words arrive. The newest word stays sharp.
            style={
              phase === "listening" && heard.length > 40
                ? {
                    maskImage:
                      "linear-gradient(to right, transparent 0%, #000 12%)",
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent 0%, #000 12%)",
                  }
                : undefined
            }
          >
            {caption}
          </p>

          <button
            type="button"
            onClick={toggleTalking}
            aria-label={phase === "listening" ? "Stop talking" : "Start talking"}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors duration-150",
              phase === "listening"
                ? "border-accent text-accent hover:bg-accent-soft"
                : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            <Icon name={phase === "listening" ? "stop" : "mic"} size={11} />
            {phase === "listening" ? "stop" : "talk"}
            <kbd className="kbd">⌘⇧V</kbd>
          </button>
        </div>

        {/* The answer, when there is one worth more than a single line. */}
        {phase !== "listening" && answer.length > 90 && (
          <p className="max-h-[132px] overflow-y-auto border-t border-line px-2.5 py-2 text-[12.5px] leading-relaxed text-fg-muted">
            {answer}
          </p>
        )}

        {error && (
          <p className="border-t border-line px-2.5 py-1.5 font-mono text-[10.5px] text-warn">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
