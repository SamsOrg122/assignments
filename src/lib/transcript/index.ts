"use client";

/**
 * The recorder: one logical recording, many browser sessions, nothing lost.
 *
 * The same shape as `lib/assignments` and `lib/study` — `versioned()`,
 * `skipHydration`, a `hydrate…` function — so a third store reads as the same
 * thing. What it does *not* have is a push/pull pair, and that is deliberate:
 * a recording is scratch. The thing that lasts is the document made from it,
 * which already syncs through the projects store, and pushing a row per
 * utterance for an hour would be a few thousand writes to keep a copy of
 * something nobody will open again.
 *
 * Three problems this file exists to solve.
 *
 * 1. THE WEB SPEECH API WILL NOT STAY OPEN. It ends its own session on a
 *    pause, on silence, on a network hiccup — ninety seconds is a good run.
 *    So a recording here is a *supervisor* over a rolling series of browser
 *    sessions, and the transcript is accumulated by us, not by any one of
 *    them. See `cycle()` for how the end of a session is detected, which is
 *    the awkward part.
 *
 * 2. AN HOUR MUST NOT BE LOSABLE. Segments go into the persisted store as
 *    they are heard, so the write queue in `persistence/versioned` has them on
 *    disk within 250ms and flushes on `pagehide`. A tab that dies at minute 58
 *    costs the last sentence, not the meeting. On the next load
 *    `hydrateTranscript()` closes that recording as `interrupted` and keeps
 *    it, and `resumeRecording()` carries on into the *same* recording rather
 *    than starting a second one.
 *
 * 3. THE SIMULATED PROVIDER MUST NEVER BE REACHED BY ACCIDENT. See below.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { versioned } from "../persistence/versioned";
import { uid } from "../factories";
import { webSpeechProvider } from "../speech/webspeech";
import { meterMicrophone, type LevelStop } from "../speech/level";
import type { SpeechProvider, SpeechSession, TranscriptChunk } from "../speech/types";
import {
  elapsedMs,
  isLive,
  newRecording,
  type Ended,
  type Provenance,
  type Recording,
  type Segment,
} from "./model";

export * from "./model";

/* ── The store ───────────────────────────────────────────────────────── */

export type RecorderStatus =
  /** Nothing running. */
  | "idle"
  /** A start has been asked for; the microphone is being opened. */
  | "starting"
  /** Words are being heard. */
  | "recording"
  /** Between browser sessions after a failure — still recording, still kept. */
  | "reconnecting"
  /** Stop pressed, waiting for the last words. */
  | "stopping";

interface TranscriptState {
  /** Every recording this browser knows about, live one included. */
  recordings: Recording[];
  /** The one being recorded now, or null. */
  activeId: string | null;
  status: RecorderStatus;
  /** The words currently being revised — the bar's live line. Not persisted. */
  heard: string;
  /** One line about what went wrong, for the bar to show. Not persisted. */
  problem: string | null;

  upsert: (recording: Recording) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  setStatus: (status: RecorderStatus) => void;
  setHeard: (heard: string) => void;
  setProblem: (problem: string | null) => void;
  keep: (recordings: Recording[]) => void;
}

export const useTranscript = create<TranscriptState>()(
  persist(
    (set) => ({
      recordings: [],
      activeId: null,
      status: "idle",
      heard: "",
      problem: null,

      upsert: (recording) =>
        set((s) => ({
          recordings: [...s.recordings.filter((r) => r.id !== recording.id), recording],
        })),
      remove: (id) =>
        set((s) => ({
          recordings: s.recordings.filter((r) => r.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),
      setActive: (activeId) => set({ activeId }),
      setStatus: (status) => set({ status }),
      setHeard: (heard) => set({ heard }),
      setProblem: (problem) => set({ problem }),
      keep: (recordings) => set({ recordings }),
    }),
    {
      ...versioned<TranscriptState>("assignments:transcript:v1", []),
      // `status`, `heard` and `problem` describe this tab's recorder, not the
      // recordings, and a stored "recording" that nothing is driving is a lie
      // on the next load.
      partialize: (s) => ({ recordings: s.recordings, activeId: s.activeId }),
      skipHydration: true,
    },
  ),
);

const state = () => useTranscript.getState();
const find = (id: string): Recording | undefined =>
  state().recordings.find((r) => r.id === id);

/** Change one recording without the caller rebuilding the whole record. */
function patch(id: string, change: (recording: Recording) => Recording): Recording | null {
  const current = find(id);
  if (!current) return null;
  const next = { ...change(current), updatedAt: Date.now() };
  state().upsert(next);
  return next;
}

/**
 * Rehydrate, then close anything that was still running when the tab died.
 *
 * Only when this tab has no recorder of its own: two tabs share one storage
 * key, and a second tab opening mid-meeting must not declare the first one's
 * recording finished. (Two tabs recording at once is still last-write-wins on
 * the same key — that is a real limitation, and the honest fix is one bar,
 * which is what the UI gives.)
 */
export function hydrateTranscript(): void {
  void Promise.resolve(useTranscript.persist.rehydrate()).then(() => {
    if (engine) return;
    const id = state().activeId;
    if (!id) return;
    const live = find(id);
    if (!live || !isLive(live)) return state().setActive(null);
    close(id, "interrupted", live.heardUntil);
  });
}

/* ── The honesty rule ────────────────────────────────────────────────── */

/**
 * Whether this browser can actually transcribe.
 *
 * Deliberately NOT `speechProviderName()` from `lib/speech`, which answers
 * "simulated" and means it. The recorder asks a narrower question: is real
 * capture possible. When the answer is no, `startRecording()` refuses and
 * says so, rather than recording fiction.
 */
export const recorderAvailable = (): boolean => webSpeechProvider.isAvailable();

/**
 * The simulated provider, loaded only when a caller asked for it by name.
 *
 * A dynamic import rather than a top-level one so the fabricating module is
 * not even in the recorder's dependency graph on the default path. There is
 * no code path from `startRecording()` with no options to this function: the
 * fallback that `lib/speech`'s `listen()` performs — swap to the mock when
 * the recogniser is missing or errors — is the exact behaviour this file
 * refuses to have.
 */
async function simulatedProvider(): Promise<SpeechProvider> {
  const { mockSpeechProvider } = await import("../speech/mock");
  return mockSpeechProvider;
}

/* ── The level meter ─────────────────────────────────────────────────── */

/**
 * One microphone tap for the whole recording, not one per browser session.
 *
 * `webspeech.ts` opens its own meter inside every `start()`, so a session
 * cycle blinks it off and on. The bar needs a waveform that does not stutter
 * every time the recogniser is restarted underneath it, and it must not open
 * a third stream of its own — so the recorder holds one for the length of the
 * logical recording and publishes the level here.
 *
 * A plain subscription rather than a field on the store: this updates at
 * animation-frame rate, and putting it in zustand would re-render everything
 * that selects `segments` sixty times a second.
 */
let level = 0;
const levelWatchers = new Set<(level: number) => void>();

function setLevel(next: number) {
  level = next;
  for (const watcher of levelWatchers) watcher(next);
}

/** Latest 0..1 amplitude. Safe to call during render — it is a plain number. */
export const currentLevel = (): number => level;

export function subscribeLevel(watcher: (level: number) => void): () => void {
  levelWatchers.add(watcher);
  return () => {
    levelWatchers.delete(watcher);
  };
}

/* ── The supervisor ──────────────────────────────────────────────────── */

/**
 * How long without a word before the session is assumed dead.
 *
 * The provider's `SpeechSession` has no "it ended by itself" callback — its
 * `onend` only resolves a pending `stop()` — so there is nothing to listen
 * to. What there is instead: a session that has ended emits nothing, ever
 * again. So silence is the signal, and the cure for both cases is the same
 * one, which is why guessing wrong is harmless: recycling a session during a
 * genuine pause costs nothing, because a recogniser that has heard nothing
 * for eight seconds has no interim words to lose. During actual speech chunks
 * arrive several times a second, so this never fires mid-sentence.
 */
const IDLE_CYCLE_MS = 8_000;
const WATCHDOG_MS = 1_000;

/** Backoff between restarts after an error. The last value repeats. */
const RETRY_MS = [400, 900, 2_000, 4_000, 8_000];

/** Consecutive failures with nothing heard before the recorder gives up. */
const GIVE_UP_AFTER = 6;

interface Engine {
  id: string;
  provider: SpeechProvider;
  provenance: Provenance;
  lang?: string;
  session: SpeechSession | null;
  stopMeter: LevelStop;
  watchdog: ReturnType<typeof setInterval> | null;
  retry: ReturnType<typeof setTimeout> | null;
  /** Stop was pressed: no more cycling, but the last words still count. */
  stopping: boolean;
  /** Finished for good: ignore anything that arrives late. */
  done: boolean;
  cycling: boolean;
  failures: number;
  /** Epoch ms of the last chunk of any kind. */
  lastChunkAt: number;
  /** Where this browser session's segments start in `recording.segments`. */
  sessionStart: number;
  /** The accumulated final text this browser session has emitted so far. */
  sessionFinal: string;
}

let engine: Engine | null = null;

/**
 * Take the words this session has committed and turn the new part into a
 * segment.
 *
 * `webspeech.ts` emits the running total for the session on every final chunk
 * (`TranscriptChunk.text` is "the transcript so far", per `speech/types.ts`),
 * so the new words are the part past what we saw last time. When the total is
 * *not* an extension of what we saw — the recogniser revised itself — this
 * session's segments are replaced wholesale rather than appended to, which is
 * the only way to avoid repeating a sentence back at the user.
 */
function commit(e: Engine, total: string) {
  const clean = total.trim();
  if (!clean) return;

  const recording = find(e.id);
  if (!recording) return;

  const now = Date.now();
  const at = elapsedMs(recording, now);
  const stamp: Partial<Segment> = e.provenance === "simulated" ? { simulated: true } : {};

  const continues = e.sessionFinal !== "" && clean.startsWith(e.sessionFinal);
  const text = continues ? clean.slice(e.sessionFinal.length).trim() : clean;
  if (!text) return;

  const kept = continues ? recording.segments : recording.segments.slice(0, e.sessionStart);
  // A revision replaces this session's segments, so it keeps their original
  // place on the timeline rather than jumping to now.
  const startedAt = continues ? at : (recording.segments[e.sessionStart]?.at ?? at);

  patch(e.id, (r) => ({
    ...r,
    segments: [...kept, { at: startedAt, text, ...stamp }],
    heardUntil: now,
  }));

  e.sessionFinal = clean;
  state().setHeard(text);
}

function onChunk(e: Engine, chunk: TranscriptChunk) {
  if (e.done) return;
  e.lastChunkAt = Date.now();
  e.failures = 0;

  if (chunk.isFinal) return commit(e, chunk.text);

  // Interim text: the providers disagree about whether it is the whole
  // running total or only the fragment being revised, so normalise to the
  // tail. The bar shows the words being heard, not the last hour of them.
  const text = chunk.text.startsWith(e.sessionFinal)
    ? chunk.text.slice(e.sessionFinal.length)
    : chunk.text;
  state().setHeard(text.trim());
}

function onError(e: Engine, message: string) {
  if (e.done || e.stopping) return;
  e.failures += 1;

  const denied = message === "not-allowed" || message === "audio-capture";
  const recording = find(e.id);
  const heardSomething = (recording?.segments.length ?? 0) > 0;

  if (e.failures >= GIVE_UP_AFTER) {
    state().setProblem(
      denied
        ? "No microphone — the recording stopped. What was heard is kept."
        : "The browser stopped transcribing and would not restart. What was heard is kept.",
    );
    void finish(denied ? "microphone-denied" : "no-recogniser");
    return;
  }

  state().setStatus("reconnecting");
  state().setProblem(
    heardSomething
      ? "Lost the recogniser for a moment — still recording, reconnecting."
      : `Could not start listening (${message}). Trying again.`,
  );

  if (e.retry) clearTimeout(e.retry);
  const wait = RETRY_MS[Math.min(e.failures - 1, RETRY_MS.length - 1)];
  e.retry = setTimeout(() => {
    e.retry = null;
    if (engine === e && !e.stopping && !e.done) void cycle(e);
  }, wait);
}

/** Open one browser session and point it at this engine. */
async function open(e: Engine): Promise<void> {
  if (e.done || e.stopping) return;
  try {
    e.sessionFinal = "";
    e.sessionStart = find(e.id)?.segments.length ?? 0;
    e.lastChunkAt = Date.now();
    e.session = await e.provider.start(
      {
        onChunk: (chunk) => onChunk(e, chunk),
        onError: (message) => onError(e, message),
        // No `onLevel`: the meter above runs for the whole recording. Handing
        // one to the provider would tie the waveform to a session that is
        // torn down and rebuilt every minute or so.
      },
      e.lang,
    );
    if (e.done || e.stopping) {
      e.session.cancel();
      return;
    }
    state().setStatus("recording");
    if (e.failures === 0) state().setProblem(null);
  } catch (error) {
    onError(e, error instanceof Error ? error.message : "start-failed");
  }
}

/**
 * End the current browser session and open the next one. The logical
 * recording does not notice: the transcript lives in the store, not in the
 * session, and `sessionFinal` resets so the next session's totals are
 * measured from zero again.
 *
 * `cancel()` rather than `stop()` — every final chunk has already been
 * committed through `onChunk`, so there is nothing left to wait for, and
 * waiting would leave a gap where speech is not being listened to.
 */
async function cycle(e: Engine): Promise<void> {
  if (e.cycling || e.done || e.stopping) return;
  e.cycling = true;
  e.lastChunkAt = Date.now();
  try {
    e.session?.cancel();
  } catch {
    // Already dead, which is usually why we are here.
  }
  e.session = null;
  await open(e);
  e.cycling = false;
}

function watch(e: Engine) {
  e.watchdog = setInterval(() => {
    if (engine !== e || e.stopping || e.done) return;
    if (e.retry) return;
    if (Date.now() - e.lastChunkAt < IDLE_CYCLE_MS) return;
    void cycle(e);
  }, WATCHDOG_MS);
}

function teardown(e: Engine) {
  e.done = true;
  if (e.watchdog) clearInterval(e.watchdog);
  if (e.retry) clearTimeout(e.retry);
  e.watchdog = null;
  e.retry = null;
  e.stopMeter();
  setLevel(0);
  if (engine === e) engine = null;
}

/** Close a recording in the store, folding the running time into `ms`. */
function close(id: string, ended: Ended, at = Date.now()): Recording | null {
  const closed = patch(id, (r) => ({
    ...r,
    ms: elapsedMs(r, at),
    runningSince: null,
    ended,
    endedAt: at,
  }));
  if (state().activeId === id) state().setActive(null);
  return closed;
}

/* ── What the bar and the landing code call ──────────────────────────── */

export interface StartOptions {
  /** BCP-47 tag for what is about to be said. Not the interface language. */
  lang?: string;
  /**
   * Record a FAKE transcript from the demo provider.
   *
   * Only ever pass this from a control that says so in words. Everything it
   * produces is stamped `simulated` on the recording and on every segment,
   * carries `SIMULATED_BANNER` at the head of `transcriptOf()`, and throws
   * from `assertReal()` — which is what stands between a demo and an
   * appointment appearing in somebody's calendar that nobody ever made.
   */
  simulate?: boolean;
}

export type StartOutcome =
  | "recording"
  | "already-recording"
  /** No real capture here, and nothing was recorded. Say so; offer nothing. */
  | "no-recogniser";

/**
 * Begin a recording, or refuse.
 *
 * The refusal is the point. `lib/speech`'s `listen()` would hand back a
 * scripted monologue about interface density here and let it pass for a
 * meeting; this returns `"no-recogniser"` and records nothing at all.
 */
export async function startRecording(options: StartOptions = {}): Promise<StartOutcome> {
  if (engine) return "already-recording";

  const simulate = options.simulate === true;
  if (!simulate && !recorderAvailable()) {
    state().setProblem(
      "This browser can't transcribe, so nothing was recorded. Chrome and Edge can.",
    );
    return "no-recogniser";
  }

  const provenance: Provenance = simulate ? "simulated" : "microphone";
  const recording = newRecording(uid(), provenance, new Date());

  state().setProblem(null);
  state().setHeard("");
  state().setStatus("starting");
  state().upsert(recording);
  state().setActive(recording.id);

  await run(recording.id, provenance, options.lang, simulate);
  return "recording";
}

/**
 * Carry on into a recording that was interrupted, rather than starting a
 * second one.
 *
 * The alternative — a new recording per reload — leaves somebody with four
 * fragments of one supervision meeting and no way to put them back together.
 * Provenance is inherited and cannot be changed by resuming: a real recording
 * that can no longer be transcribed is refused, never topped up with fiction.
 */
export async function resumeRecording(id: string): Promise<StartOutcome> {
  if (engine) return "already-recording";
  const recording = find(id);
  if (!recording) return "no-recogniser";

  const simulate = recording.provenance === "simulated";
  if (!simulate && !recorderAvailable()) {
    state().setProblem("This browser can't transcribe, so the recording wasn't resumed.");
    return "no-recogniser";
  }

  const now = Date.now();
  state().setProblem(null);
  state().setHeard("");
  state().setStatus("starting");
  patch(id, (r) => ({
    ...r,
    runningSince: now,
    heardUntil: now,
    ended: undefined,
    endedAt: undefined,
  }));
  state().setActive(id);

  await run(id, recording.provenance, undefined, simulate);
  return "recording";
}

async function run(
  id: string,
  provenance: Provenance,
  lang: string | undefined,
  simulate: boolean,
) {
  const provider = simulate ? await simulatedProvider() : webSpeechProvider;
  const e: Engine = {
    id,
    provider,
    provenance,
    lang,
    session: null,
    stopMeter: () => {},
    watchdog: null,
    retry: null,
    stopping: false,
    done: false,
    cycling: false,
    failures: 0,
    lastChunkAt: Date.now(),
    sessionStart: find(id)?.segments.length ?? 0,
    sessionFinal: "",
  };
  engine = e;

  e.stopMeter = await meterMicrophone(setLevel);
  await open(e);
  watch(e);
}

/**
 * Stop, and hand back the finished recording.
 *
 * Returns the recording rather than void because the caller's next move is to
 * make a document out of it, and re-reading it out of the store to find the
 * one that just ended is a race nobody should have to think about.
 */
export const stopRecording = (): Promise<Recording | null> => finish("stopped");

async function finish(ended: Ended): Promise<Recording | null> {
  const e = engine;
  if (!e) return null;

  e.stopping = true;
  engine = null;
  state().setStatus("stopping");

  // The provider's `stop()` resolves once the recogniser has settled, which is
  // where a half-finished sentence turns into a final chunk. `onChunk` is
  // still live until `teardown`, so those last words land in the transcript.
  try {
    await e.session?.stop();
  } catch {
    // A session that has already ended has nothing to give back.
  }

  teardown(e);
  const recording = close(e.id, ended);
  state().setHeard("");
  state().setStatus("idle");
  return recording;
}

/**
 * Abandon what is being recorded and throw it away.
 *
 * Separate from `stopRecording` because they are opposite intentions, and a
 * "stop" that sometimes deletes an hour would be the worst button in the app.
 */
export function cancelRecording(): void {
  const e = engine;
  if (!e) return;
  e.stopping = true;
  engine = null;
  try {
    e.session?.cancel();
  } catch {
    // Already gone.
  }
  teardown(e);
  state().remove(e.id);
  state().setHeard("");
  state().setProblem(null);
  state().setStatus("idle");
}

/* ── Keeping and tidying ─────────────────────────────────────────────── */

export function discardRecording(id: string): void {
  if (engine?.id === id) return cancelRecording();
  state().remove(id);
}

export function renameRecording(id: string, title: string): void {
  patch(id, (r) => ({ ...r, title: title.trim() || undefined }));
}

/** Point a recording at the document that was written from it. */
export function linkRecording(id: string, projectId: string | undefined): void {
  patch(id, (r) => ({ ...r, projectId }));
}

/* ── Reading it back ─────────────────────────────────────────────────── */

/** The live recording, non-reactively. For event handlers, not for render. */
export function activeRecording(): Recording | null {
  const { activeId, recordings } = state();
  if (!activeId) return null;
  return recordings.find((r) => r.id === activeId) ?? null;
}

/**
 * The live recording, reactively.
 *
 * `find` returns the element itself, so the reference only changes when the
 * recording does — no new object per render, and no re-render per animation
 * frame from the level meter, which lives outside the store for that reason.
 */
export const useActiveRecording = (): Recording | null =>
  useTranscript((s) =>
    s.activeId ? (s.recordings.find((r) => r.id === s.activeId) ?? null) : null,
  );

/** Recordings that were cut off and could be carried on. Newest first. */
export const interruptedRecordings = (recordings: Recording[]): Recording[] =>
  recordings.filter((r) => r.ended === "interrupted").sort((a, b) => b.startedAt - a.startedAt);
