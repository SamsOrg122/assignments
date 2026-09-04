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
import { serverSpeechProvider } from "../speech/server";
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
  /** A start has been asked for; the microphone is opening. Nothing heard. */
  | "starting"
  /** Words are being heard: a chunk has arrived, not merely a session. */
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

/* ── Two tabs, one storage key ───────────────────────────────────────── */

/**
 * Proof that some tab is still driving the live recording.
 *
 * `hydrateTranscript()` closes a recording that was left running, which is
 * right after a crash and wrong when the answer is "the other tab has the
 * meeting open" — and a tab cannot see another tab's `engine`, which is what
 * the guard here used to check. So a running engine writes a timestamp
 * somewhere both tabs can read, and refreshes it every second.
 *
 * Its own key rather than the store: it changes every second and nothing
 * renders from it, so putting it in the persisted payload would rewrite the
 * whole recordings array sixty times a minute.
 */
const BEAT_KEY = "assignments:transcript:live";
const BEAT_MS = 1_000;
/** How long a beat is believed after it was written. */
const BEAT_STALE_MS = 3_000;

interface Beat {
  id: string;
  at: number;
}

function readBeat(): Beat | null {
  try {
    const raw = localStorage.getItem(BEAT_KEY);
    if (!raw) return null;
    const beat = JSON.parse(raw) as Partial<Beat>;
    if (typeof beat?.id !== "string" || typeof beat.at !== "number") return null;
    return { id: beat.id, at: beat.at };
  } catch {
    // Unreadable or unavailable storage. Nobody is provably holding it.
    return null;
  }
}

function beat(id: string): void {
  try {
    localStorage.setItem(BEAT_KEY, JSON.stringify({ id, at: Date.now() } satisfies Beat));
  } catch {
    // Storage full or blocked. The cost is a second tab deciding this
    // recording was interrupted, which is recoverable; throwing here would
    // end the recording instead, which is not.
  }
}

function forgetBeat(id: string): void {
  try {
    if (readBeat()?.id === id) localStorage.removeItem(BEAT_KEY);
  } catch {
    // See `beat`.
  }
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Whether another live tab is recording `id` right now.
 *
 * A beat written a second ago is either a tab holding the meeting or the last
 * beat *this* tab wrote before it was reloaded, and for the length of the
 * staleness window those look identical. So the beat is watched rather than
 * read: one that advances has a tab behind it, one that stands still is what
 * a crash leaves. The wait only ever happens when a recording was live.
 */
async function heldElsewhere(id: string): Promise<boolean> {
  const first = readBeat();
  if (!first || first.id !== id || Date.now() - first.at > BEAT_STALE_MS) return false;
  await pause(BEAT_STALE_MS);
  const second = readBeat();
  return second?.id === id && second.at > first.at;
}

/**
 * Rehydrate, then close anything that was still running when the tab died.
 *
 * Only when nothing is driving that recording — not when *this* tab has no
 * recorder, which is what this checked before and is a different question. A
 * second tab opened mid-meeting has no engine of its own and would close the
 * first tab's recording as `interrupted`, then offer a Resume that takes the
 * meeting over and loses everything the first tab hears afterwards. So the
 * heartbeat above is consulted, and a recording somebody else is holding is
 * left exactly as it is.
 *
 * (Two tabs recording at once is still last-write-wins on the same key — that
 * is a real limitation, and the honest fix is one bar, which is what the UI
 * gives.)
 */
export function hydrateTranscript(): void {
  void Promise.resolve(useTranscript.persist.rehydrate()).then(async () => {
    if (engine) return;
    const id = state().activeId;
    if (!id) return;
    const live = find(id);
    if (!live || !isLive(live)) return state().setActive(null);
    if (await heldElsewhere(id)) return;
    // Watching the beat takes a few seconds, and somebody can press record in
    // them. Closing a recording this tab is now driving would be the same bug
    // pointed inwards.
    if (engine) return;
    // The beat stood still while we watched it, so the tab that wrote it is
    // gone. Clearing it keeps the next question cheap to answer.
    forgetBeat(id);
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
 *
 * Two ways to be real now, and the second one is why this stopped being a
 * Chrome-only feature. `webSpeechProvider` recognises in the browser and costs
 * nothing; `serverSpeechProvider` records the audio and posts it to
 * `/api/listen`, which needs only `MediaRecorder` and a connection — so
 * Firefox, Edge and the webview inside the desktop app can all record a real
 * meeting now. Neither is the simulated provider, and that is the whole
 * question this function is asked.
 */
export const recorderAvailable = (): boolean =>
  webSpeechProvider.isAvailable() || serverSpeechProvider.isAvailable();

/**
 * Which of the two is doing the work, for a surface that wants to say so.
 *
 * Worth showing, because the two behave visibly differently: the browser
 * recogniser revises what it has heard as you speak, and the server one lands
 * a paragraph at a time about half a minute behind. Somebody who is not told
 * that reads the delay as a hang.
 */
export const recogniserName = (): "browser" | "server" | null =>
  webSpeechProvider.isAvailable()
    ? "browser"
    : serverSpeechProvider.isAvailable()
      ? "server"
      : null;

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
  /** Tells other tabs this recording is being driven. See `beat`. */
  heartbeat: ReturnType<typeof setInterval> | null;
  retry: ReturnType<typeof setTimeout> | null;
  /** Stop was pressed: no more cycling, but the last words still count. */
  stopping: boolean;
  /** Finished for good: ignore anything that arrives late. */
  done: boolean;
  cycling: boolean;
  failures: number;
  /**
   * The browser recogniser gave up mid-meeting and the server ear took over.
   *
   * Once, and it is recorded so it cannot happen twice: a hand-over that could
   * repeat would flip between two providers every few seconds on a connection
   * that is failing for both, and produce a transcript interleaved from two
   * recognisers with a gap at every switch.
   */
  handedOver: boolean;
  /** A chunk has arrived on this run. Until then, nothing is being heard. */
  everHeard: boolean;
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
  // Cleared, not set to what was just committed: `heard` is the line being
  // revised, the bar draws the segments *and* it, and leaving the new sentence
  // in both made the bar read it back twice for the whole of a pause.
  state().setHeard("");
}

function onChunk(e: Engine, chunk: TranscriptChunk) {
  if (e.done) return;
  e.lastChunkAt = Date.now();
  e.failures = 0;

  // A word is what makes "recording" true, and the only thing that does.
  if (chunk.text.trim()) {
    e.everHeard = true;
    if (!e.stopping && state().status !== "recording") state().setStatus("recording");
  }

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

  /*
   * These two are not transient and are not waited out. Chrome does not
   * re-prompt for a microphone it has been refused, and there is no device to
   * find that was not there a moment ago — `lib/speech` classifies both as
   * fatal for the same reason. Backing off through five steps buys fifteen
   * seconds of "trying again" about something that cannot be retried, and says
   * "reconnecting" throughout. The other errors really do come and go, so they
   * keep their retries.
   */
  const denied = message === "not-allowed" || message === "audio-capture";
  const recording = find(e.id);
  const heardSomething = (recording?.segments.length ?? 0) > 0;

  /*
   * Before giving up: hand the meeting to the server ear.
   *
   * These two failures are not the same thing and were treated as one. "No
   * microphone" is unrecoverable — there is nothing to record with, and
   * `/api/listen` cannot help because it is handed audio, not a device. But
   * "the recogniser stopped and would not restart" is a statement about
   * Chrome's speech service, not about the microphone, and the microphone is
   * still open. That is precisely the case the server ear exists for: it needs
   * `MediaRecorder` and a connection, neither of which the browser recogniser
   * dying says anything about.
   *
   * Handing over rather than stopping is the difference between a meeting that
   * ends at minute four with "the browser stopped transcribing" and one that
   * carries on with a visible note about how. What is already heard is kept
   * either way; this keeps the rest of it too.
   */
  if (
    !denied &&
    e.failures >= GIVE_UP_AFTER &&
    !e.handedOver &&
    e.provider !== serverSpeechProvider &&
    serverSpeechProvider.isAvailable()
  ) {
    e.handedOver = true;
    e.failures = 0;
    e.provider = serverSpeechProvider;
    state().setStatus("reconnecting");
    state().setProblem(
      "This browser's recogniser stopped. Still recording — the words are being read on the server now, so they arrive a paragraph at a time.",
    );
    if (e.retry) clearTimeout(e.retry);
    e.retry = setTimeout(() => {
      e.retry = null;
      if (engine === e && !e.stopping && !e.done) void cycle(e);
    }, RETRY_MS[0]);
    return;
  }

  if (denied || e.failures >= GIVE_UP_AFTER) {
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
    // A session object is not a word. With the microphone refused this used to
    // flip to "recording" once per retry with nothing said; `onChunk` is what
    // promotes it, and until a chunk arrives this is still the opening state.
    state().setStatus(e.everHeard ? "recording" : "starting");
    // On every open, not only the first: `failures` is never 0 on a retry, so
    // one recovered blip left "lost the recogniser for a moment" on the bar
    // for the rest of an hour that recorded perfectly.
    state().setProblem(null);
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
  if (e.heartbeat) clearInterval(e.heartbeat);
  if (e.retry) clearTimeout(e.retry);
  e.watchdog = null;
  e.heartbeat = null;
  e.retry = null;
  forgetBeat(e.id);
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
      "This browser can't record at all — it has no microphone capture, so there was nothing to send anywhere.",
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

  // Offered by a list drawn before another tab picked the meeting up. Resuming
  // would write this tab's segments over what that one is still hearing.
  if (await heldElsewhere(id)) {
    state().setProblem("That recording is open in another tab, and still going there.");
    return "already-recording";
  }

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
  /* Browser first where it exists — it is free, immediate, and revises as it
     goes. The server ear is the fallback rather than the default for exactly
     one reason: it costs a model call per half minute, and asking somebody to
     pay for a recogniser their browser already has would be rude. */
  const provider = simulate
    ? await simulatedProvider()
    : webSpeechProvider.isAvailable()
      ? webSpeechProvider
      : serverSpeechProvider;
  const e: Engine = {
    id,
    provider,
    provenance,
    lang,
    session: null,
    stopMeter: () => {},
    watchdog: null,
    heartbeat: null,
    retry: null,
    stopping: false,
    done: false,
    cycling: false,
    failures: 0,
    handedOver: false,
    everHeard: false,
    lastChunkAt: Date.now(),
    sessionStart: find(id)?.segments.length ?? 0,
    sessionFinal: "",
  };
  engine = e;

  // Before the first await, so a tab that opens while the permission prompt is
  // still sitting there does not read the silence as a crash.
  beat(id);
  e.heartbeat = setInterval(() => beat(id), BEAT_MS);

  /*
   * The microphone tap is handed over in one step, and only to an engine that
   * is still wanted.
   *
   * `meterMicrophone` sits on the permission prompt for as long as the person
   * takes to answer it. Stop or discard during that wait ran `teardown`
   * against the `() => {}` placeholder above, so the tap was never closed: the
   * meter went on reporting live audio with nothing recording, and the
   * microphone stayed open after somebody had backed out. Whichever order the
   * two land in now closes it — `teardown` first and this closes it here,
   * `teardown` second and it has the real function to call.
   */
  const stopMeter = await meterMicrophone(setLevel);
  if (e.done) {
    stopMeter();
    setLevel(0);
    return;
  }
  e.stopMeter = stopMeter;

  await open(e);
  // Stop or discard during `open()`'s await: `teardown` has already cleared a
  // watchdog that did not exist yet, and installing one now leaves an interval
  // ticking for the life of the tab with nothing left to clear it.
  if (e.done || e.stopping) return;
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

/** How long the last words are worth waiting for after stop. See `finish`. */
const STOP_GRACE_MS = 1_500;

/** Settle when `promise` does or when the grace runs out, whichever is first. */
function within(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const settle = () => {
      clearTimeout(timer);
      resolve();
    };
    void promise.then(settle, settle);
  });
}

async function finish(ended: Ended): Promise<Recording | null> {
  const e = engine;
  if (!e) return null;

  e.stopping = true;
  engine = null;
  state().setStatus("stopping");

  /*
   * The provider's `stop()` resolves once the recogniser has settled, which is
   * where a half-finished sentence turns into a final chunk. `onChunk` is
   * still live until `teardown`, so those last words land in the transcript.
   *
   * Bounded, because that promise is not guaranteed to settle at all.
   * `webspeech.ts` resolves it from the recogniser's `onend` — and a session
   * the browser ended by itself, which is the thing this whole file is a
   * supervisor for, fired `onend` before anyone was waiting. Awaiting it flat
   * hung the stop press forever: no document, no error, the recording never
   * closed and the microphone tap still open. What the grace can cost is a
   * trailing half-sentence the recogniser never finalised.
   */
  try {
    if (ended === "stopped") {
      const settling = e.session?.stop();
      if (settling) await within(settling, STOP_GRACE_MS);
    } else {
      // Not a stop press. The recogniser is already gone — that is why we are
      // here — so there are no last words to wait for, and waiting would hold
      // the bar on "finishing" instead of saying what went wrong.
      e.session?.cancel();
    }
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
