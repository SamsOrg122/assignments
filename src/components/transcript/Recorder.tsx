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
  byNewest,
  cancelRecording,
  clockOf,
  discardRecording,
  elapsedMs,
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
  type Ended,
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
  /**
   * A microphone has been asked for and the answer has not come back.
   *
   * The bar's own window, not the recorder's: `status` says `"starting"` from
   * the request until the first word arrives, which through an opening silence
   * is a legitimate recording somebody must be able to stop. This is the
   * narrower thing the acts below actually care about — there is no session
   * and no tap to hand over yet, so a press lands on nothing.
   */
  arming: boolean;
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
  arming: false,
  error: null,
  outcome: null,
  kept: null,
  originProjectId: null,
  lang: DEFAULT_LANGUAGE,
}));

/* ── When the recorder gives up on its own ───────────────────────────────── */

/**
 * The id of the recording this bar started, while it is still running.
 *
 * The recorder can end a recording without anybody pressing stop: six failed
 * restarts in a row and it gives up. Status simply returns to `idle`, and
 * without this the bar would vanish mid-meeting with the explanation sitting
 * unread in `problem`. Cleared before stop and discard so the person's own
 * presses do not come back through here.
 *
 * An id held here rather than `prev.activeId` read at the transition, because
 * by then it is gone: `finish()` closes the recording — and `close()` clears
 * `activeId` — *before* it sets the status to `idle`, so both halves of the
 * state already say nothing is active. Leaning on the order those two setters
 * run in is how an hour of a real meeting gets filed as "nothing was
 * recorded" and answered with an offer of the fake demo.
 */
let ours: string | null = null;

useTranscript.subscribe((next, prev) => {
  if (!ours || prev.status === "idle" || next.status !== "idle") return;
  const id = ours;
  ours = null;

  const closed = next.recordings.find((r) => r.id === id) ?? null;

  // Words were heard before the microphone went. They are worth a document —
  // an hour of a meeting is not thrown away because the last minute failed.
  if (closed?.segments.length) {
    void file(closed);
    return;
  }

  // No longer in the store at all, so something threw it away rather than the
  // recorder giving up on it. Nothing to report and nothing to keep.
  if (!closed) {
    useBar.setState({ phase: "hidden", kept: null, error: null, outcome: null });
    return;
  }

  // Said in our own words rather than passing `problem` through: the
  // recorder's line ends "What was heard is kept", which is true of the branch
  // above and a flat lie about this one. `ended` carries the same reason.
  discardRecording(closed.id);
  useBar.setState({
    phase: "blocked",
    kept: null,
    error:
      closed.ended === "microphone-denied"
        ? "The microphone stopped working, and nothing had been heard yet."
        : "The browser gave up transcribing and would not start again. Nothing had been heard yet.",
  });
});

/* ── Turning it on ───────────────────────────────────────────────────────── */

/** Whether a microphone is open right now. Read this before opening another. */
export function isCapturing(): boolean {
  return useTranscript.getState().status !== "idle";
}

/**
 * The one microphone at a time rule, as one call any capture surface can make.
 *
 * `true` means: do not start, the person has already been told why.
 *
 * Every other surface captures through `lib/speech`'s `listen()`, and what
 * makes this worth a shared helper is how `listen()` fails — not with an
 * error, but with a silent swap to `mock.ts`. A second recogniser opened
 * during a meeting takes the device off this bar, so the real recording drops
 * into its retry loop while the surface that stole it starts writing a
 * scripted monologue about interface density onto the page as if it had been
 * heard. Two lies for the price of one press.
 */
export function microphoneBusy(): boolean {
  if (!isCapturing()) return false;
  useUI.getState().notify("The transcriber is recording. Stop it first.");
  return true;
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
    arming: true,
  });

  await standDownVoiceMode();

  // `finally`, because a start that throws must still give the acts back —
  // buttons stuck disabled around a live microphone is the worse failure.
  try {
    const outcome = await startRecording({ lang });
    // Which recording, not just that there is one — see `ours` above.
    ours = outcome === "recording" ? useTranscript.getState().activeId : null;
    if (outcome === "no-recogniser") {
      useBar.setState({
        phase: "blocked",
        error:
          useTranscript.getState().problem ??
          "This browser can't transcribe, so nothing was recorded.",
      });
    }
  } finally {
    useBar.setState({ arming: false });
  }
}

/**
 * Record a *simulated* transcript instead. Only reachable from the blocked
 * state, by a press on a button that says what it is.
 */
export async function startSimulatedTranscription() {
  if (useBar.getState().phase !== "blocked" || isCapturing()) return;
  useBar.setState({ phase: "hidden", error: null, arming: true });
  await standDownVoiceMode();
  try {
    const outcome = await startRecording({ lang: useBar.getState().lang, simulate: true });
    ours = outcome === "recording" ? useTranscript.getState().activeId : null;
  } finally {
    useBar.setState({ arming: false });
  }
}

/** Carry on into a recording a crash or a reload cut off. */
export async function resumeTranscription(id: string) {
  if (isCapturing()) return;
  useBar.setState({ phase: "hidden", error: null, outcome: null, kept: null, arming: true });
  await standDownVoiceMode();
  try {
    const outcome = await resumeRecording(id);
    ours = outcome === "recording" ? useTranscript.getState().activeId : null;
    if (outcome === "recording") return;
    // "already-recording" means another tab is driving this one right now.
    // It is not "blocked" — that panel's heading reads "can't transcribe
    // here", which would be false and would send somebody looking for a
    // browser problem instead of the other tab. Say what the engine said.
    if (outcome === "already-recording") {
      useBar.setState({
        phase: "failed",
        // "failed", not "blocked": that panel's heading reads "can't
        // transcribe here", which would be false and would send somebody
        // looking for a browser problem instead of the other tab. This phase
        // already means "something did not happen and the words are still
        // held", which is exactly the case.
        kept: useTranscript.getState().recordings.find((r) => r.id === id) ?? null,
        error:
          useTranscript.getState().problem ??
          "That recording is open in another tab, and still going there.",
      });
      return;
    }
    useBar.setState({
      phase: "blocked",
      // The recording was refused, not touched: it still holds every word it
      // ever heard. The panel below reads this to decide whether it is allowed
      // to say nothing was recorded.
      kept: useTranscript.getState().recordings.find((r) => r.id === id) ?? null,
      error:
        useTranscript.getState().problem ??
        "This browser can't transcribe, so the recording wasn't resumed.",
    });
  } finally {
    useBar.setState({ arming: false });
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
  ours = null;
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
  ours = null;
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
  const arming = useBar((s) => s.arming);

  const peak = useRef(0);
  const tailRef = useRef<HTMLParagraphElement>(null);
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(0);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const live = status !== "idle";
  // The two windows where the microphone is not yet — or no longer — this
  // bar's to hand over. See the acts below. Deliberately not `status ===
  // "starting"`: that lasts until the first word arrives, and an opening
  // silence is a real recording somebody must be able to stop.
  const settling = arming || status === "stopping";
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

  // "starting" covers everything before the first word, which is two different
  // states to somebody watching: the microphone being opened, and an open
  // microphone that has not heard anything yet. Calling the second one
  // "opening the microphone" is the bar describing a wait that finished a
  // minute ago; calling it "recording" is the claim the recorder declines to
  // make until it hears something.
  const label = arming
    ? "opening the microphone"
    : status === "starting"
      ? "listening"
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
        role="group"
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
          {/*
            The only thing on this card allowed to speak, and it holds two
            words. The card as a whole changes about twelve times a second —
            the clock ticks, the tail moves on every chunk — so a live region
            wrapped around all of it re-reads the whole card, over and over,
            for the length of the meeting. What is worth interrupting somebody
            for is the phase changing, and whether these words were invented.
          */}
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="font-mono text-[10.5px] tracking-tight text-fg-subtle"
          >
            {label}
            {simulated && (
              <span className="sr-only">, simulated — nobody said these words</span>
            )}
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

                Both acts stand down while the bar is arming and while it is
                stopping. Not because the engine would leak a microphone — it
                no longer can, since `run()` closes the tap it is handed even
                when teardown ran first — but because during `stopping` the
                last words are still being collected, and a discard then is a
                stop nobody asked for.
              */}
              <button
                type="button"
                onClick={() => (armed ? discardTranscription() : setArmed(true))}
                disabled={settling}
                aria-label={
                  armed ? "Confirm: throw this recording away" : "Throw this recording away"
                }
                className={cn(
                  "flex items-center gap-1 rounded-xs px-1.5 py-1 font-mono text-[10.5px] transition-colors duration-150",
                  "disabled:opacity-50",
                  armed
                    ? "bg-warn/[0.12] text-warn"
                    : "text-fg-subtle enabled:hover:bg-surface-2 enabled:hover:text-fg",
                )}
              >
                <Icon name="trash" size={11} />
                {armed ? "throw it away?" : "discard"}
              </button>
              <button
                type="button"
                onClick={() => void stopTranscription()}
                disabled={settling}
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
                talking, under the demo provider too: `run()` opens that tap
                whichever provider it picked, so even a fabricated transcript
                has a real level beside it rather than a timer pretending.

                Not `mock.ts` opening the device, which is what this used to
                claim. `open()` hands the provider no `onLevel` at all, so the
                tap that both providers start inside `start()` — mock's and
                web speech's alike — reports into nothing: a second, redundant
                microphone stream, not the source of these bars. Right
                conclusion, wrong mechanism, and worth having straight before
                somebody deletes the tap in `run()` as the duplicate and finds
                the waveform goes flat.
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
              {tail || (arming ? "opening the microphone…" : "nothing heard yet")}
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
            {/*
              Which of these two is true depends on the recording this refusal
              is about, so it cannot be a fixed sentence. A resume that was
              refused leaves an hour of really-heard words sitting in the
              store; printing "Nothing was recorded" over them — directly under
              a line from the recorder saying what was heard is kept — is the
              app contradicting itself about whether somebody's meeting still
              exists.
            */}
            <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
              {kept?.segments.length
                ? "What was already heard is kept. This bar will not top it up with invented words — the appointments in them would go straight into your agenda."
                : "Nothing was recorded. This bar will not invent a transcript to fill the gap — the appointments in it would go straight into your agenda."}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {kept && kept.segments.length > 0 && (
                <button
                  type="button"
                  onClick={() => void file(kept)}
                  className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 font-mono text-[10.5px] text-on-accent transition-[filter] duration-150 hover:brightness-110"
                >
                  <Icon name="arrow-right" size={11} />
                  make the document from what was heard
                </button>
              )}
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

/* ── What is left of a recording that never became anything ──────────────── */

/**
 * Every way a recording can end with real words in it and no document made
 * from them — with the half-sentence that says which one happened.
 *
 * `interruptedRecordings()` answers a narrower question: did the tab die. But
 * the two reasons the recorder gives up on its own leave exactly the same
 * thing behind — an hour that was heard, closed, and reachable from nowhere —
 * and so does a stop whose document never got written, because the sink threw
 * and the bar was closed. All four are somebody's meeting sitting in the store
 * with no surface offering it back, which is the same as losing it.
 *
 * `discarded` is the one ending deliberately absent: that one was asked for.
 */
const STRANDED: Partial<Record<Ended, string>> = {
  interrupted: "was cut off",
  "no-recogniser": "stopped when the browser gave up transcribing",
  "microphone-denied": "stopped when the microphone went",
  stopped: "was never turned into a document",
};

/**
 * A meeting that ended without becoming anything is still on disk, and without
 * an offer like this nobody would ever find out. It is the one thing worth
 * interrupting somebody's screen for on arrival, so it is quiet, it is
 * dismissible, and it only ever appears when there is something real to lose.
 */
function Rescue() {
  const recordings = useTranscript((s) => s.recordings);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const cut = useMemo(
    () =>
      [...recordings]
        .sort(byNewest)
        .find(
          (r) =>
            r.ended !== undefined &&
            STRANDED[r.ended] !== undefined &&
            r.segments.length > 0 &&
            !r.projectId &&
            !dismissed.includes(r.id),
        ) ?? null,
    [recordings, dismissed],
  );
  const why = cut?.ended ? STRANDED[cut.ended] : undefined;
  if (!cut || !why) return null;

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
          A recording {why} — {clockOf(cut.ms)}, {wordCount(cut)} words. It is
          still here.
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


