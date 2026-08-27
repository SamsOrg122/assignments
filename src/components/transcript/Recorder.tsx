"use client";

/**
 * The recording bar.
 *
 * A card at top centre, over whatever you are doing: a live meter, the words
 * as they arrive, the elapsed time, one button that stops and keeps and one
 * that throws the whole thing away. Mounted once in `AppShell`, so you can
 * start it in the notepad, walk to the library, and still be recording.
 *
 * This file is only the view and the handoff. The recording itself belongs to
 * `@/lib/transcript`, which supervises a rolling series of browser sessions,
 * writes every segment to disk as it is heard, and reconnects on its own — a
 * second recorder living in a component would be a second microphone and a
 * second transcript of the same meeting.
 *
 * ── What this bar refuses to do ────────────────────────────────────────────
 *
 * `@/lib/speech`'s `listen()` hands over to `mock.ts` whenever the Web Speech
 * API is missing, errors fatally, or produces nothing for 2.2 seconds — and
 * `mock.ts` does not transcribe, it recites: a scripted monologue about
 * interface density with invented figures ("twenty four people", "nine minutes
 * versus five"). For the notepad that is a fair demo of speech-to-prose. Here
 * it would be the worst thing this product could do, because the far end of
 * this bar writes appointments into somebody's agenda and deadlines into their
 * assignments — a meeting nobody called, in a real calendar, with no way to
 * tell.
 *
 * So nothing here calls `listen()`. `startRecording()` refuses outright when
 * real capture is not possible, and this bar shows that refusal instead of
 * words. The simulated provider stays reachable — the product has to be
 * demoable in Firefox and in a headless browser — but only through a button
 * that says in plain words that it is fake, and after that the fact is welded
 * on in four independent places:
 *
 *   1. a warn band across the top of this bar, with no way to dismiss it, for
 *      every phase from recording through to the finished document;
 *   2. the status word is "simulating", never "recording";
 *   3. `provenance` on the recording and `simulated` on every segment, so the
 *      mark survives being copied out of the store;
 *   4. `SIMULATED_BANNER` at the head of `transcriptOf()`, so even a consumer
 *      that only takes a string — the model prompt included — is told in words
 *      that nobody said any of it.
 *
 * Marking rather than deleting, because a fallback that only exists in code
 * nobody can reach gets quietly re-enabled by the next person who needs a
 * demo. A fallback that is loud is one that stays honest.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import {
  cancelRecording,
  clockOf,
  discardRecording,
  elapsedMs,
  interruptedRecordings,
  isSimulated,
  linkRecording,
  resumeRecording,
  startRecording,
  stopRecording,
  subscribeLevel,
  transcriptOf,
  useActiveRecording,
  useTranscript,
  wordCount,
  type Recording,
} from "@/lib/transcript";
import { DEFAULT_LANGUAGE } from "@/lib/dictionary";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { Waveform } from "@/components/voice/Waveform";

/* ── The seam to whatever makes the document ─────────────────────────────── */

/** What the bar shows once there is a document to open. */
export interface TranscriptOutcome {
  /** Routed to as `/p/{projectId}`. */
  projectId: string;
  /** The title the model gave it. */
  title: string;
}

export interface TranscriptContext {
  /** The project the recorder was started from, if any. Provenance only. */
  originProjectId: string | null;
}

/**
 * Saves the recording as a document and runs the extraction pass, resolving
 * once there is something to open.
 *
 * Takes the whole `Recording` rather than a string so the provenance travels
 * with it: read the words with `transcriptOf()` (which carries the banner),
 * and call `assertReal()` before writing anything to the agenda or the
 * assignments. Throwing is fine — the bar keeps the transcript and offers it
 * for copying rather than losing an hour of somebody's meeting.
 */
export type TranscriptSink = (
  recording: Recording,
  context: TranscriptContext,
) => Promise<TranscriptOutcome>;

let sink: TranscriptSink | null = null;

/**
 * Register the thing that turns a finished recording into a document.
 *
 * A registration seam rather than an import because the bar has to work — and
 * has to keep the words safe — whether or not that module exists yet. With
 * nothing registered a recording still completes, is still on disk, and is
 * still offered for copying.
 */
export function setTranscriptSink(next: TranscriptSink | null) {
  sink = next;
}

/* ── The bar's own state ─────────────────────────────────────────────────── */

/**
 * Everything after the microphone closes. The phases *before* that come from
 * `useTranscript().status`, which is the only thing that knows them.
 */
type AfterPhase =
  /** Nothing of ours on screen. */
  | "hidden"
  /** Real capture isn't possible here, and we will not fake it silently. */
  | "blocked"
  /** Stopped; the sink is reading it. */
  | "working"
  /** There is a document. */
  | "done"
  /** Something failed. The words are still held, and still on disk. */
  | "failed";

interface BarState {
  phase: AfterPhase;
  /** A sentence, already in words somebody can act on. */
  error: string | null;
  outcome: TranscriptOutcome | null;
  /** The finished recording, so a failure can still be copied out. */
  kept: Recording | null;
  originProjectId: string | null;
  lang: string;
}

const useBar = create<BarState>()(() => ({
  phase: "hidden",
  error: null,
  outcome: null,
  kept: null,
  originProjectId: null,
  lang: DEFAULT_LANGUAGE,
}));

/* ── When the recorder gives up on its own ───────────────────────────────── */

/**
 * True while a recording this bar started is running.
 *
 * The recorder can end a recording without anybody pressing stop: six failed
 * restarts in a row and it gives up. Status simply returns to `idle`, and
 * without this the bar would vanish mid-meeting with the explanation sitting
 * unread in `problem`. Cleared before stop and discard so the person's own
 * presses do not come back through here.
 */
let ours = false;

useTranscript.subscribe((next, prev) => {
  if (!ours || prev.status === "idle" || next.status !== "idle") return;
  ours = false;

  const closed = prev.activeId
    ? (next.recordings.find((r) => r.id === prev.activeId) ?? null)
    : null;

  // Words were heard before the microphone went. They are worth a document —
  // an hour of a meeting is not thrown away because the last minute failed.
  if (closed?.segments.length) {
    void file(closed);
    return;
  }

  if (closed) discardRecording(closed.id);
  useBar.setState({
    phase: "blocked",
    kept: null,
    error:
      next.problem ??
      "The recorder stopped before it heard anything, and nothing was recorded.",
  });
});

/* ── Turning it on ───────────────────────────────────────────────────────── */

/** Whether a microphone is open right now. Read this before opening another. */
export function isCapturing(): boolean {
  return useTranscript.getState().status !== "idle";
}

/** One microphone at a time — voice mode holds a recogniser of its own. */
async function standDownVoiceMode() {
  if (!useUI.getState().voiceOpen) return;
  useUI.getState().setVoiceOpen(false);
  // The dock releases the device when it unmounts, which is a render away. A
  // browser grants one recogniser at a time, so starting before it has let go
  // fails with a message about neither of them.
  await new Promise((resolve) => setTimeout(resolve, 140));
}

/**
 * Turn the transcriber on.
 *
 * Safe to call from anywhere — a command palette row, a button in the notepad,
 * a control in the tool. Pass the project you are in so the document can say
 * where the recording came from, and its proofing language so the recogniser
 * is told what it is about to hear rather than guessing from the language the
 * browser's menus are in.
 */
export async function startTranscription(options?: {
  projectId?: string | null;
  lang?: string | null;
}) {
  if (isCapturing()) {
    useUI.getState().notify("Already recording.");
    return;
  }

  const lang = options?.lang || DEFAULT_LANGUAGE;
  useBar.setState({
    phase: "hidden",
    error: null,
    outcome: null,
    kept: null,
    originProjectId: options?.projectId ?? null,
    lang,
  });

  await standDownVoiceMode();

  const outcome = await startRecording({ lang });
  ours = outcome === "recording";
  if (outcome === "no-recogniser") {
    useBar.setState({
      phase: "blocked",
      error:
        useTranscript.getState().problem ??
        "This browser can't transcribe, so nothing was recorded.",
    });
  }
}

/**
 * Record a *simulated* transcript instead. Only reachable from the blocked
 * state, by a press on a button that says what it is.
 */
export async function startSimulatedTranscription() {
  if (useBar.getState().phase !== "blocked" || isCapturing()) return;
  useBar.setState({ phase: "hidden", error: null });
  await standDownVoiceMode();
  ours = (await startRecording({ lang: useBar.getState().lang, simulate: true })) === "recording";
}

/** Carry on into a recording a crash or a reload cut off. */
export async function resumeTranscription(id: string) {
  if (isCapturing()) return;
  useBar.setState({ phase: "hidden", error: null, outcome: null, kept: null });
  await standDownVoiceMode();
  const outcome = await resumeRecording(id);
  ours = outcome === "recording";
  if (outcome === "no-recogniser") {
    useBar.setState({
      phase: "blocked",
      error:
        useTranscript.getState().problem ??
        "This browser can't transcribe, so the recording wasn't resumed.",
    });
  }
}

/** Put the bar away. Whatever it was showing is already saved or discarded. */
export function dismissTranscriber() {
  useBar.setState({ phase: "hidden", error: null, outcome: null, kept: null });
}

/** Hand a finished recording to the sink and show what came back. */
async function file(recording: Recording) {
  const { originProjectId } = useBar.getState();
  useBar.setState({ phase: "working", kept: recording, error: null, outcome: null });

  if (!sink) {
    useBar.setState({
      phase: "failed",
      error:
        "Nothing is set up yet to turn a recording into a document. The transcript is kept — copy it, or carry on from the library.",
    });
    return;
  }

  try {
    const outcome = await sink(recording, { originProjectId });
    // So the recording knows which document was written from it, and the
    // document is reachable from the recording rather than only the reverse.
    linkRecording(recording.id, outcome.projectId);
    useBar.setState({ phase: "done", outcome, error: null });
  } catch {
    useBar.setState({
      phase: "failed",
      error: "That didn't save. The transcript is kept — copy it before you close this.",
    });
  }
}

/** Stop, keep the words, and make the document. */
export async function stopTranscription() {
  if (!isCapturing()) return;
  ours = false;
  const recording = await stopRecording();
  if (!recording) return;

  if (!recording.segments.length) {
    // An empty recording is not worth a row in the list or a document with
    // nothing in it. Say so and clear it away.
    discardRecording(recording.id);
    useBar.setState({
      phase: "failed",
      kept: null,
      error: "Nothing was heard, so there is nothing to save.",
    });
    return;
  }

  await file(recording);
}

/** Throw the recording away. Nothing is saved and nothing is sent anywhere. */
export function discardTranscription() {
  ours = false;
  cancelRecording();
  dismissTranscriber();
}

/* ── The bar ─────────────────────────────────────────────────────────────── */

export function Recorder() {
  const status = useTranscript((s) => s.status);
  const phase = useBar((s) => s.phase);
  if (status === "idle" && phase === "hidden") return <Rescue />;
  return <Bar />;
}

function Bar() {
  const router = useRouter();
  const status = useTranscript((s) => s.status);
  const heard = useTranscript((s) => s.heard);
  const problem = useTranscript((s) => s.problem);
  const recording = useActiveRecording();
  const phase = useBar((s) => s.phase);
  const error = useBar((s) => s.error);
  const outcome = useBar((s) => s.outcome);
  const kept = useBar((s) => s.kept);

  const peak = useRef(0);
  const tailRef = useRef<HTMLParagraphElement>(null);
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(0);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const live = status !== "idle";
  const shown = recording ?? kept;
  const simulated = shown ? isSimulated(shown) : false;

  // The recorder publishes the level at animation-frame rate. Take the peak
  // between reads rather than a sample: re-rendering this card sixty times a
  // second to move a few pixels is how a canvas app starts dropping frames,
  // but reading only every twelfth value would miss the peaks that are what
  // make a meter look like a voice.
  useEffect(() => subscribeLevel((next) => {
    if (next > peak.current) peak.current = next;
  }), []);

  // One timer for the two things that move on their own.
  useEffect(() => {
    if (!live) {
      // Off the effect body: setState during an effect cascades renders.
      void Promise.resolve().then(() => setLevel(0));
      return;
    }
    const id = window.setInterval(() => {
      setLevel(peak.current);
      peak.current = 0;
      setNow(Date.now());
    }, 80);
    return () => window.clearInterval(id);
  }, [live]);

  // Closing the tab mid-recording costs the last sentence, not the meeting —
  // segments are on disk within 250ms — but nobody wants to find that out.
  useEffect(() => {
    if (!live && phase !== "working") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live, phase]);

  // Arming the discard expires. Walking away from the bar and coming back
  // should not leave a live "throw it away" button under the pointer.
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  /*
   * The running tail: the last few committed segments plus the words being
   * revised right now. Long enough to read a sentence back, short enough that
   * an hour of transcript is not being laid out on every chunk.
   */
  const tail = useMemo(() => {
    const parts = (recording?.segments ?? kept?.segments ?? [])
      .slice(-6)
      .map((segment) => segment.text.trim())
      .filter(Boolean);
    const joined = [...parts, heard.trim()].filter(Boolean).join(" ");
    return joined.length > 240 ? joined.slice(-240) : joined;
  }, [recording, kept, heard]);

  /*
   * Keep the end of the line in view.
   *
   * `text-align: right` does not do this: when a nowrap line is wider than its
   * box, CSS ignores the alignment and overflows on the end side, so the words
   * that just arrived are the ones clipped away — exactly the ones being
   * watched to check it heard you. Scrolling the box to its end works whatever
   * the line does, and the mask fades the old words off the other edge.
   */
  useEffect(() => {
    const el = tailRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [tail]);

  const copy = useCallback(() => {
    if (!shown) return;
    void navigator.clipboard?.writeText(transcriptOf(shown)).then(
      () => setCopied(true),
      () => useUI.getState().notify("This browser wouldn't let the page copy."),
    );
  }, [shown]);

  const open = useCallback(() => {
    if (!outcome) return;
    const id = outcome.projectId;
    dismissTranscriber();
    router.push(`/p/${id}`);
  }, [outcome, router]);

  const elapsed = shown ? elapsedMs(shown, now || shown.heardUntil) : 0;
  const count = shown ? wordCount(shown) : 0;

  const label =
    status === "starting"
      ? "opening the microphone"
      : status === "recording"
        ? simulated
          ? "simulating"
          : "recording"
        : status === "reconnecting"
          ? "reconnecting"
          : status === "stopping"
            ? "finishing"
            : phase === "working"
              ? "reading it back"
              : phase === "done"
                ? "saved"
                : phase === "blocked"
                  ? "can't transcribe here"
                  : "stopped";

  // A message from the recorder while it is still running is about the
  // recogniser dropping out, and it is already reconnecting. One from the bar
  // is about the document. They never both apply.
  const note = live ? problem : error;

  return (
    <div
      className={cn(
        // Below `lg` it sits *under* the top bar rather than over it: at a
        // phone width there is no room beside the sidebar toggle and the
        // palette button, and a card centred there covers one of them. Above
        // `lg` the top bar's middle is empty and it can float.
        "pointer-events-none fixed inset-x-0 top-14 z-[88] flex justify-center px-3 lg:top-2",
        "print:hidden",
      )}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label={simulated ? "Simulated transcript, not a recording" : "Recording"}
        className={cn(
          "anim-pop pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-lg",
          "border bg-surface shadow-[0_18px_60px_-14px_rgba(0,0,0,0.75)]",
          simulated ? "border-warn/45" : "border-line-strong",
        )}
      >
        {/*
          The mark. No close button, no collapse, present from the moment the
          demo provider is chosen through to the finished document — because
          the one thing that must never happen is somebody reading a document
          built from this and believing a word of it.
        */}
        {simulated && (
          <div className="flex items-start gap-2 border-b border-warn/40 bg-warn/[0.09] px-3 py-2">
            <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rounded-full bg-warn" />
            <p className="text-[11.5px] leading-relaxed text-warn">
              Simulated. Nobody said these words — the dates, times and numbers
              are invented. Nothing from this goes in your agenda.
            </p>
          </div>
        )}

        {/* Where you are, how long it has run, and the two acts. */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            aria-hidden="true"
            className={cn(
              "size-[7px] shrink-0 rounded-full",
              status === "recording" && simulated && "bg-warn",
              status === "recording" && !simulated && "anim-shimmer bg-accent",
              (status === "starting" || status === "stopping") && "bg-fg-subtle",
              status === "reconnecting" && "anim-shimmer bg-warn",
              !live && phase === "working" && "anim-shimmer bg-fg-muted",
              !live && phase === "done" && "bg-accent",
              !live && (phase === "blocked" || phase === "failed") && "bg-warn",
            )}
          />
          <span className="font-mono text-[10.5px] tracking-tight text-fg-subtle">
            {label}
          </span>
          {shown && phase !== "blocked" && (
            <span className="font-mono text-[10.5px] text-fg-subtle/70">
              · {clockOf(elapsed)}
              {count > 0 && ` · ${count} words`}
            </span>
          )}

          {live && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {/*
                Discard is the opposite intention from stop, so it is a
                different shape — quiet text, not a filled circle — and it asks
                once. Losing an hour of a supervision meeting to a stray click
                is not recoverable from anywhere.
              */}
              <button
                type="button"
                onClick={() => (armed ? discardTranscription() : setArmed(true))}
                aria-label={
                  armed ? "Confirm: throw this recording away" : "Throw this recording away"
                }
                className={cn(
                  "flex items-center gap-1 rounded-xs px-1.5 py-1 font-mono text-[10.5px] transition-colors duration-150",
                  armed
                    ? "bg-warn/[0.12] text-warn"
                    : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon name="trash" size={11} />
                {armed ? "throw it away?" : "discard"}
              </button>
              <button
                type="button"
                onClick={() => void stopTranscription()}
                disabled={status === "stopping"}
                aria-label="Stop recording and save it"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-[filter] duration-150 enabled:hover:brightness-110 disabled:opacity-50"
              >
                <Icon name="stop" size={14} />
              </button>
            </span>
          )}

          {!live && phase !== "working" && (
            <button
              type="button"
              onClick={dismissTranscriber}
              aria-label="Close"
              className="ml-auto rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        {/* The meter and the words. */}
        {(live || phase === "working") && (
          <div className="border-t border-line px-3 py-2.5">
            <div className="flex justify-center">
              {/*
                Fed the recorder's own meter — one microphone tap held for the
                whole recording, so the bars do not blink every time the
                recogniser is cycled underneath. It moves because somebody is
                talking. Under the demo provider the words are invented but the
                level is not: `mock.ts` opens the real device, so this is still
                a measurement rather than a timer.
              */}
              <Waveform
                level={level}
                active={status === "recording" || status === "reconnecting"}
                className="h-[22px]"
              />
            </div>

            <p
              ref={tailRef}
              className={cn(
                "mt-2 h-[22px] overflow-hidden text-[15px] leading-[22px] whitespace-nowrap",
                tail ? "text-fg-muted" : "text-fg-subtle",
              )}
              style={
                tail.length > 60
                  ? {
                      maskImage: "linear-gradient(to right, transparent 0%, #000 18%)",
                      WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 18%)",
                    }
                  : undefined
              }
            >
              {tail || (status === "starting" ? "opening the microphone…" : "nothing heard yet")}
            </p>
          </div>
        )}

        {/* Working: say what is being done, not that something is happening. */}
        {phase === "working" && !live && (
          <p className="border-t border-line px-3 py-2 font-mono text-[10.5px] text-fg-subtle">
            <span className="anim-shimmer">
              reading the transcript once, for dates, numbers and what was decided
            </span>
          </p>
        )}

        {/* Refusing to record, and the one deliberate way past it. */}
        {phase === "blocked" && !live && (
          <div className="border-t border-line px-3 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-fg-muted">{error}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
              Nothing was recorded. This bar will not invent a transcript to
              fill the gap — the appointments it found would go straight into
              your agenda.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={dismissTranscriber}
                className="rounded-sm border border-line px-2 py-1 font-mono text-[10.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
              >
                close
              </button>
              <button
                type="button"
                onClick={() => void startSimulatedTranscription()}
                className="flex items-center gap-1.5 rounded-sm border border-warn/40 px-2 py-1 font-mono text-[10.5px] text-warn transition-colors duration-150 hover:bg-warn/[0.1]"
              >
                <Icon name="play" size={11} />
                run the fake demo transcript
              </button>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-fg-subtle">
              The demo recites a script. It is for showing how this works, and
              it is marked as invented on the bar, in the transcript and on the
              document it makes.
            </p>
          </div>
        )}

        {/* Done: the document, and the way into it. */}
        {phase === "done" && outcome && !live && (
          <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
            <Icon name="check" size={13} className="shrink-0 text-accent" />
            <p className="min-w-0 flex-1 truncate text-[13px] text-fg">{outcome.title}</p>
            <button
              type="button"
              onClick={open}
              className="flex shrink-0 items-center gap-1 rounded-sm bg-accent px-2 py-1 font-mono text-[10.5px] text-on-accent transition-[filter] duration-150 hover:brightness-110"
            >
              open
              <Icon name="arrow-right" size={11} />
            </button>
          </div>
        )}

        {/* Failed after capture: the words are the thing to protect. */}
        {phase === "failed" && !live && (
          <div className="border-t border-line px-3 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-fg-muted">{error}</p>
            {kept && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="flex items-center gap-1 rounded-sm border border-line px-2 py-1 font-mono text-[10.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  <Icon name={copied ? "check" : "copy"} size={11} />
                  {copied ? "copied" : `copy the transcript · ${count} words`}
                </button>
                <button
                  type="button"
                  onClick={() => void file(kept)}
                  className="flex items-center gap-1 rounded-sm border border-line px-2 py-1 font-mono text-[10.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  <Icon name="refresh" size={11} />
                  try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* The recogniser dropping out mid-meeting, said plainly. */}
        {note && live && (
          <p className="border-t border-warn/35 bg-warn/[0.07] px-3 py-1.5 text-[11.5px] leading-relaxed text-warn">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── What is left of a recording the tab died in the middle of ───────────── */

/**
 * A meeting that was cut off by a reload or a crash is still on disk, and
 * without an offer like this nobody would ever find out. It is the one thing
 * worth interrupting somebody's screen for on arrival, so it is quiet, it is
 * dismissible, and it only ever appears when there is something real to lose.
 */
function Rescue() {
  const recordings = useTranscript((s) => s.recordings);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const cut = useMemo(
    () =>
      interruptedRecordings(recordings).find(
        (r) => r.segments.length > 0 && !r.projectId && !dismissed.includes(r.id),
      ),
    [recordings, dismissed],
  );
  if (!cut) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[88] flex justify-center px-3 print:hidden lg:top-2">
      <div
        className={cn(
          "anim-pop pointer-events-auto flex w-full max-w-[560px] flex-wrap items-center gap-2",
          "rounded-lg border border-line-strong bg-surface px-3 py-2",
          "shadow-[0_18px_60px_-14px_rgba(0,0,0,0.75)]",
        )}
      >
        <Icon name="history" size={13} className="shrink-0 text-fg-subtle" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-muted">
          A recording was cut off — {clockOf(cut.ms)}, {wordCount(cut)} words.
          It is still here.
          {isSimulated(cut) && (
            <span className="text-warn"> It was simulated, not heard.</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void resumeTranscription(cut.id)}
          className="rounded-sm border border-line px-2 py-1 font-mono text-[10.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          carry on
        </button>
        <button
          type="button"
          onClick={() => void file(cut)}
          className="rounded-sm bg-accent px-2 py-1 font-mono text-[10.5px] text-on-accent transition-[filter] duration-150 hover:brightness-110"
        >
          make the document
        </button>
        <button
          type="button"
          onClick={() => setDismissed((ids) => [...ids, cut.id])}
          aria-label="Not now"
          className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
    </div>
  );
}
