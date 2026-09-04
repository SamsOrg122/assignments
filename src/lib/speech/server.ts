"use client";

/**
 * Speech, recognised on the server, for every client that cannot do it itself.
 *
 * `types.ts` anticipated this file in its own header — *"`transcribe(audio)`
 * handles a finished recording in one go, which is what a server-side model
 * (Whisper et al.) will want"* — and until now nothing implemented it. So the
 * three quarters of the world without a browser recogniser got
 * `mockSpeechProvider`, which does not transcribe but *recites*, and the
 * surfaces that write into a real calendar had to refuse to run at all rather
 * than risk it. This is what they refuse in favour of.
 *
 * Who this is for, concretely: Firefox and Edge on any platform, and the
 * system webview a downloaded desktop app runs in — none of which has ever
 * had `SpeechRecognition`. It is not a downgrade from `webspeech.ts`; on a
 * long meeting it is usually better, because a server model reads a whole
 * slice with context rather than a stream word by word. It costs a model call
 * per slice, which is why it is not the first choice where the browser can do
 * it for nothing.
 *
 * ── HOW A LIVE TRANSCRIPT IS MADE OUT OF A BATCH RECOGNISER ──────────────
 * The server sees finished audio; a person watching wants words while they
 * are still talking. So the recording is cut into slices and each one is sent
 * as it completes: text appears about half a minute behind the speaker, and
 * every slice that lands is permanent. Nothing is revised, which is the one
 * visible difference from the browser recogniser — there are no interim
 * results here that get rewritten, only finished ones that accumulate.
 *
 * `isFinal` is therefore true on every chunk this provider emits, and the
 * running total is the whole transcript so far, exactly as the interface says.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { toBase64, toWav } from "../audio/wav";
import { supabase } from "../db/client";
import type { SpeechHandlers, SpeechProvider, SpeechSession } from "./types";

/**
 * How much speech goes in one request.
 *
 * Thirty seconds is the trade the whole design turns on. Shorter means the
 * transcript keeps up with the speaker but each request carries less context,
 * and a recogniser given three words has nothing to disambiguate them with.
 * Longer is cheaper and more accurate and further behind. Half a minute is
 * about a paragraph of speech — long enough to be a unit of meaning, short
 * enough that somebody watching does not think it has stopped working.
 */
const SLICE_MS = 30_000;

/** Enough of the last slice for the next one to continue rather than repeat. */
const CONTINUITY = 240;

interface Heard {
  text?: string;
  speech?: boolean;
  error?: string;
}

/**
 * Whether this browser can capture at all.
 *
 * Note what is *not* checked: whether the deployment has a model configured.
 * That is not knowable from here without asking, and asking would mean a
 * network round trip before a button can be drawn. `/api/listen` answers 501
 * with a sentence when it has no key, and a surface that shows that sentence
 * is more honest than a button that quietly never appeared.
 */
function canCapture(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** The one MIME type this browser will actually give us. */
function container(): string {
  const wanted = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of wanted)
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  return "";
}

/** One slice, encoded and sent. Returns what was heard, or "" for silence. */
async function send(recorded: Blob, lang: string | undefined, before: string): Promise<string> {
  const { wav, seconds, peak } = await toWav(recorded);

  /*
   * The session token, read fresh per slice rather than captured when the
   * recording started.
   *
   * `/api/listen` spends money, so it asks who is calling and charges them —
   * and an hour-long meeting outlives an access token. Reading it once at
   * `start()` would mean every slice after the first refresh comes back 401
   * and the second half of the conversation is lost. `getSession()` returns
   * the refreshed one.
   */
  const client = supabase();
  const token = client
    ? (await client.auth.getSession()).data.session?.access_token
    : undefined;

  const response = await fetch("/api/listen", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      audio: await toBase64(wav),
      seconds,
      // Measured from the samples, and the server treats it as the fact that
      // outranks anything the model says. See the note at the top of the route.
      peak,
      lang,
      before,
    }),
  });

  const answer = (await response.json().catch(() => ({}))) as Heard;
  if (!response.ok) throw new Error(answer.error || `Transcription failed (${response.status}).`);
  return answer.speech === false ? "" : (answer.text ?? "");
}

export const serverSpeechProvider: SpeechProvider = {
  name: "server",

  isAvailable: canCapture,

  async transcribe(audio: Blob): Promise<string> {
    return send(audio, undefined, "");
  },

  async start(handlers: SpeechHandlers, lang?: string): Promise<SpeechSession> {
    const type = container();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let transcript = "";
    let live = true;
    /* Slices are sent as they complete and answered out of order under load,
       so the text is assembled by position rather than by arrival. */
    const slices: string[] = [];
    const inFlight: Array<Promise<void>> = [];

    /* The level meter taps this same stream rather than opening a second
       microphone. `meterMicrophone()` in `level.ts` calls getUserMedia itself,
       which on some platforms is a second permission prompt and on all of them
       is a second device handle for a number we already have the audio for. */
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const window8 = new Uint8Array(analyser.frequencyBinCount);
    const meter = setInterval(() => {
      analyser.getByteTimeDomainData(window8);
      let peak = 0;
      for (const v of window8) peak = Math.max(peak, Math.abs(v - 128) / 128);
      handlers.onLevel?.(peak);
    }, 100);

    const settle = (at: number, text: string) => {
      slices[at] = text;
      const whole = slices.filter(Boolean).join(" ").trim();
      if (whole === transcript) return;
      transcript = whole;
      // Always final: this provider does not revise. See the header.
      handlers.onChunk({ text: transcript, isFinal: true });
    };

    let recorder: MediaRecorder | null = null;
    let index = 0;

    /*
     * One recorder per slice, stopped and replaced rather than one recorder
     * emitting timeslices.
     *
     * This looks like the long way round and it is the only way that works.
     * A `MediaRecorder` given a timeslice emits the container header with the
     * *first* blob only; every later blob is a bare continuation that no
     * decoder will open on its own. Slice two would arrive as bytes nothing
     * can read. Stopping the recorder closes a complete file.
     *
     * The cost is the gap between `stop()` and the next `start()` — a few
     * milliseconds, well inside one phoneme. Running two overlapping recorders
     * would close even that, at the price of duplicated audio at every
     * boundary, and a repeated syllable in a transcript is worse than a
     * missing millisecond of silence between two words.
     */
    const cycle = () => {
      if (!live) return;
      const at = index++;
      const parts: Blob[] = [];
      const active = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recorder = active;

      active.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data);
      };
      active.onstop = () => {
        // Chained before the next slice starts so the recorder is replaced
        // immediately; the request itself is awaited only at `stop()`.
        cycle();
        if (!parts.length) return;
        const before = transcript.slice(-CONTINUITY);
        inFlight.push(
          send(new Blob(parts, { type }), lang, before)
            .then((text) => settle(at, text))
            .catch((error) => {
              // One slice failing is not the recording failing. It is said out
              // loud and the next slice still goes; a meeting that loses thirty
              // seconds is worth more than one that stops at minute four.
              handlers.onError(error instanceof Error ? error.message : "A slice was lost.");
            }),
        );
      };

      active.start();
      setTimeout(() => {
        if (active.state === "recording") active.stop();
      }, SLICE_MS);
    };

    cycle();

    const shutDown = () => {
      live = false;
      clearInterval(meter);
      if (recorder?.state === "recording") recorder.stop();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    };

    return {
      async stop(): Promise<string> {
        live = false;
        clearInterval(meter);
        // Stop the running recorder first and let its `onstop` queue the last
        // slice, then wait for everything outstanding. Reversing these two
        // loses whatever was said in the final partial slice, which is
        // routinely the sentence somebody actually cared about.
        if (recorder?.state === "recording") recorder.stop();
        await new Promise((resume) => setTimeout(resume, 60));
        await Promise.allSettled(inFlight);
        for (const track of stream.getTracks()) track.stop();
        void context.close();
        return transcript;
      },
      cancel() {
        shutDown();
      },
    };
  },
};

/**
 * Whether asking the server is worth offering on this deployment.
 *
 * Deliberately not a network probe. The recorder needs this answer while it is
 * drawing a button, and a surface that waits for a round trip before it can
 * say what it does is a surface that looks broken on a slow connection.
 */
export function serverEarPossible(): boolean {
  return canCapture();
}
