/**
 * The ear: audio in, the words that were actually said out.
 *
 * `docs/desktop.md` names the absence of this file as the thing that blocks
 * the whole desktop recorder — *"there is no server provider anywhere in this
 * codebase, so a recorded file lands in Kit as bytes nobody can turn into
 * text"* — and it blocks more than that. Speech recognition in the browser is
 * Chrome and Safari only: this repository's own `node_modules/caniuse-lite`
 * records Edge as `n` for `speech-recognition`, Firefox has never shipped it,
 * and the system webview a downloaded app runs in has none of it on any
 * platform. Until now, "record a conversation" meant "if you happen to be in
 * the right browser".
 *
 * So the recogniser moves to where every client can reach it. One slice of
 * audio per request, WAV in and words out, sitting on the same rotation,
 * cooldown, rate limit and per-account allowance as the two model endpoints
 * that were already here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS FILE IS BUILT AGAINST, because it is not the obvious one.
 *
 * The obvious risk is a model that cannot hear and says so. That is harmless:
 * it is an error, the surface shows it, nobody is misled.
 *
 * The real risk is a model that cannot hear and answers anyway. A language
 * model handed an audio part it cannot decode does not reliably refuse — it
 * writes a fluent, plausible meeting, because that is what the surrounding
 * prompt asked for and fluency is what it is for. Downstream, `/api/transcript`
 * reads that text for appointments and `lib/transcript/land.ts` writes them
 * into somebody's real agenda. An invented conversation with a calendar
 * attached is the worst thing this product could ship, and it would arrive
 * looking like a feature that works.
 *
 * Three gates, none of which trusts the model's own account of itself:
 *
 *   1. SILENCE NEVER REACHES A MODEL. The client measures the loudest sample
 *      in the slice — see `lib/audio/wav.ts`, which has the samples in hand —
 *      and sends it. Under the floor, this route answers "nothing was said"
 *      without spending a request. A model cannot invent words it was never
 *      asked about.
 *   2. THE PEAK IS CHECKED AGAINST THE ANSWER. Words returned for a slice
 *      whose measured peak is near silence are dropped, whatever the model
 *      claims, and the model is cooled down. The peak is arithmetic over
 *      samples; the answer is prose. When they disagree the arithmetic wins.
 *   3. NOBODY SPEAKS THAT FAST. A slice of N seconds cannot contain more than
 *      about 8 words per second — roughly twice the fastest recorded human
 *      speech — so an answer above that ceiling is not a transcription, it is
 *      composition, and it is dropped.
 *
 * None of the three can be defeated by a better prompt, which is the point.
 * They are the same instinct as `/api/transcript` checking that every quoted
 * fact really appears in the transcript, applied one layer earlier.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  coolDown,
  describeFailure,
  listenRotation,
  shouldRotate,
  type Attempt,
} from "@/lib/ai/openrouter/models";
import { overLimit, readBody } from "@/lib/api/guard";
import { chargeOne, overAllowance, whoIsAsking } from "@/lib/api/who";

export const dynamic = "force-dynamic";

const endpoint = () =>
  (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "") +
  "/chat/completions";

/**
 * One slice, not one meeting.
 *
 * 16 kHz mono WAV is 32 KB per second and base64 adds a third, so this is
 * about ninety seconds of audio. Slices are what make a live transcript
 * possible at all — words appear while you are still talking rather than after
 * you stop — and they are also what keeps one bad minute from costing the
 * whole recording. `lib/speech/server.ts` sends thirty-second slices, so this
 * is three times what the client should ever send and a refusal here means
 * something is wrong rather than something is long.
 */
const MAX_REQUEST_BYTES = 4_000_000;

/** A slice this quiet had nobody talking into it. */
const SILENCE = 0.02;

/**
 * The fastest anybody talks, doubled.
 *
 * Auctioneers and sports commentators reach about 5 words per second in short
 * bursts; ordinary conversation is 2 to 3. Eight is a ceiling nobody can reach
 * by speaking, so crossing it means the answer was not produced by listening.
 */
const WORDS_PER_SECOND = 8;

/** A slice under this is too short to have contained anything. */
const SHORTEST_SECONDS = 0.4;

const LISTEN_LIMIT = { limit: 60, windowMs: 60_000, name: "listen" };

const TIMEOUT_MS = 60_000;

interface Body {
  /** Base64 WAV, from `lib/audio/wav.ts`. */
  audio?: unknown;
  /** Sample count over sample rate, not a wall clock. */
  seconds?: unknown;
  /** Loudest sample, 0..1. See gate 1. */
  peak?: unknown;
  /** BCP-47, what the speaker is speaking. A hint, never a filter. */
  lang?: unknown;
  /** The tail of what has been heard so far, for continuity across a boundary. */
  before?: unknown;
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "heard",
    description:
      "Report exactly the words spoken in the audio. Never add, summarise, translate or complete them.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "The words spoken, verbatim. Empty string if the audio contains no speech.",
        },
        language: {
          type: "string",
          description: "BCP-47 tag of the language actually spoken, e.g. nl-NL.",
        },
        speech: {
          type: "boolean",
          description: "Whether there was any human speech in the audio at all.",
        },
      },
      required: ["text", "speech"],
      additionalProperties: false,
    },
  },
};

/**
 * The instruction, written to make the failure mode expensive rather than
 * comfortable.
 *
 * "If you cannot hear it, say so" is the sentence that matters, and it is
 * placed before the task rather than after it. The three gates exist because
 * this sentence is not sufficient — but it is free, and it moves the odds.
 */
function systemPrompt(lang: string | null, before: string): string {
  return [
    "You are a transcriber. You write down what was said and nothing else.",
    "",
    "If the audio is unreadable, empty, or you cannot process audio at all, call the tool with speech=false and text=\"\". Do not guess at what a recording like this might contain. An invented sentence here is written into somebody's calendar, so a blank answer is always better than a plausible one.",
    "",
    "Rules for the text you return:",
    "- Verbatim. Do not tidy grammar, do not remove repetitions, do not summarise.",
    "- No speaker labels, no timestamps, no commentary, no square brackets.",
    "- Do not translate. Write it in the language it was spoken in.",
    "- If only part of it is audible, return that part and nothing for the rest.",
    lang ? `The speaker is expected to be speaking ${lang}, but trust the audio over this.` : "",
    before
      ? `For continuity only, the previous slice ended: "…${before}". Do not repeat it; continue from after it.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  const refused = overLimit(request, LISTEN_LIMIT);
  if (refused) return refused;

  const read = await readBody(request, MAX_REQUEST_BYTES);
  if ("tooLarge" in read) return read.tooLarge;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "This deployment has no model configured, so it can't turn speech into words. Set OPENROUTER_API_KEY. Chrome and Safari can still transcribe on their own; nothing else can.",
      },
      { status: 501 },
    );

  const who = await whoIsAsking(request);
  if (!who.ok) return who.response;

  let body: Body;
  try {
    body = JSON.parse(read.text) as Body;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const audio = asString(body.audio, MAX_REQUEST_BYTES);
  const seconds = asNumber(body.seconds);
  const peak = asNumber(body.peak);
  if (!audio || seconds === null || peak === null)
    return Response.json(
      { error: "A slice needs its audio, its length and its measured peak." },
      { status: 400 },
    );

  if (seconds < SHORTEST_SECONDS)
    return Response.json({ text: "", speech: false, why: "too short" });

  /*
   * Gate 1, and note where it sits: before `chargeOne`, not after.
   *
   * A recorder running in a quiet room sends a slice every thirty seconds all
   * afternoon. Charging for each one would eat somebody's daily allowance to
   * establish that nobody was talking, and then refuse the slice where they
   * finally did. Silence is free because it costs us nothing.
   */
  if (peak < SILENCE)
    return Response.json({ text: "", speech: false, why: "silence" });

  const charge = await chargeOne(who.caller);
  if (!charge.allowed) return overAllowance();

  const lang = asString(body.lang, 20) || null;
  const before = asString(body.before, 240);

  const messages = [
    { role: "system" as const, content: systemPrompt(lang, before) },
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: "Write down what is said in this audio.",
        },
        {
          type: "input_audio" as const,
          input_audio: { data: audio, format: "wav" },
        },
      ],
    },
  ];

  const attempts: Attempt[] = [];
  const ceiling = Math.ceil(seconds * WORDS_PER_SECOND) + 4;

  for (const model of listenRotation()) {
    const upstream = new AbortController();
    const stop = () => upstream.abort();
    request.signal.addEventListener("abort", stop);
    const timeout = setTimeout(stop, TIMEOUT_MS);

    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        signal: upstream.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "Tougather listen",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "heard" } },
          // Zero. Transcription has a right answer, and a model asked twice
          // about the same thirty seconds should not have two opinions about
          // what somebody said.
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        attempts.push({ model, problem: describeFailure(response.status, text) });
        if (!shouldRotate(response.status, text)) break;
        coolDown(model);
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
        }>;
      };
      const args = payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        // The common shape of "this model cannot read an audio part": it
        // answers in prose about not being able to, rather than calling the
        // tool. Cooled down so the next slice does not pay for it again.
        attempts.push({ model, problem: "did not answer as a transcriber" });
        coolDown(model);
        continue;
      }

      let parsed: { text?: unknown; language?: unknown; speech?: unknown };
      try {
        parsed = JSON.parse(args) as typeof parsed;
      } catch {
        attempts.push({ model, problem: "answered with something unreadable" });
        coolDown(model);
        continue;
      }

      const heard = asString(parsed.text, 20_000);
      const spoke = parsed.speech !== false;

      if (!heard || !spoke)
        return Response.json({ text: "", speech: false, model, why: "nothing said" });

      const words = heard.split(/\s+/).filter(Boolean).length;

      /*
       * Gate 3. Note that this drops the slice rather than truncating it: half
       * of a fabricated paragraph is still fabricated, and a transcript that
       * silently loses its end is a transcript somebody will quote from.
       */
      if (words > ceiling) {
        attempts.push({
          model,
          problem: `returned ${words} words for ${seconds.toFixed(1)}s of audio, which nobody can say that fast`,
        });
        coolDown(model);
        continue;
      }

      return Response.json({
        text: heard,
        speech: true,
        language: asString(parsed.language, 20) || lang || null,
        model,
        words,
      });
    } catch (error) {
      attempts.push({
        model,
        problem:
          upstream.signal.aborted && !request.signal.aborted
            ? `no answer within ${Math.round(TIMEOUT_MS / 1000)}s`
            : error instanceof Error
              ? error.message
              : "failed",
      });
      coolDown(model);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", stop);
    }
  }

  /*
   * Every model refused, and the reply says which and why rather than "failed".
   *
   * This is the one error somebody configuring a deployment will actually have
   * to debug, because the default model list in `models.ts` is a guess made
   * without access to OpenRouter's catalogue. The attempts are the instructions
   * for fixing it: if every line says the model did not answer as a
   * transcriber, the slugs cannot hear and OPENROUTER_LISTEN_MODELS wants a
   * different list.
   */
  return Response.json(
    {
      error:
        attempts.length === 0
          ? "No model is configured to listen. Set OPENROUTER_LISTEN_MODELS."
          : `No model could hear that. ${attempts
              .map((a) => `${a.model}: ${a.problem}`)
              .join("; ")}`,
      attempts,
    },
    { status: 502 },
  );
}
