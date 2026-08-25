/**
 * Turning something you have read into cards you can be asked about.
 *
 * A third endpoint rather than a tool on `/api/assist`, for one reason: this
 * is not a conversation. Nothing here streams, nothing here decides between
 * four tools, and nothing here writes to the note. It is one question with
 * one shape of answer, so it gets one request and returns JSON — and the
 * desktop's frame reader, which knows exactly six frame types, does not have
 * to learn a seventh it will never see.
 *
 * The key stays here, like everywhere else, and the caller is charged against
 * the same daily allowance the other two endpoints use. A set of forty cards
 * is one model call, so it costs what one question costs.
 */

import {
  coolDown,
  describeFailure,
  rotation,
  shouldRotate,
  type Attempt,
} from "@/lib/ai/openrouter/models";
import { overLimit, readBody } from "@/lib/api/guard";
import { chargeOne, overAllowance, whoIsAsking } from "@/lib/api/who";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const endpoint = () =>
  (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "") +
  "/chat/completions";

const TIMEOUT_MS = 120_000;

/**
 * Lower than the notepad's eight. Making a set is a deliberate act somebody
 * does once per chapter, not something they hold down.
 */
const STUDY_LIMIT = { name: "study", limit: 4, windowMs: 60_000 };

/** The source text is a chapter or a lecture, so this is sized like one. */
const MAX_REQUEST_BYTES = 512 * 1024;

/** What a set can hold. More than this and nobody finishes it in one sitting. */
const MOST_CARDS = 60;

/** How much of the source the model is shown. */
const SOURCE_CEILING = 60_000;

interface Body {
  text?: unknown;
  count?: unknown;
  kind?: unknown;
}

export interface StudyCard {
  front: string;
  back: string;
}

const asString = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.slice(0, cap) : "";

const TOOL = {
  type: "function" as const,
  function: {
    name: "make_cards",
    description: "Return the study cards for this material.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              front: {
                type: "string",
                description: "The question, term or prompt. One thing only.",
              },
              back: {
                type: "string",
                description: "The answer. A sentence or two, never a paragraph.",
              },
            },
            required: ["front", "back"],
          },
        },
      },
      required: ["cards"],
    },
  },
};

/**
 * What separates a useful card from a useless one, said explicitly.
 *
 * Left to itself a model writes cards whose fronts are "Photosynthesis" and
 * whose backs are three paragraphs — which is a summary cut into pieces, not
 * something anybody can be tested on. The instructions here are the ones that
 * matter: one idea per card, an answerable front, a short back, and nothing
 * that was not in the source.
 */
function systemPrompt(count: number, kind: "cards" | "questions"): string {
  const shape =
    kind === "questions"
      ? [
          "Write practice questions. The front is a question somebody could be asked in an exam — 'why', 'how', 'what happens when' — not a term to define.",
          "The back is the answer, in one or two sentences, plus the reason it is the answer.",
        ]
      : [
          "Write recall cards. The front is a term, a name, a date or a short question. The back is what it means.",
          "The back is one or two sentences. If it needs three, the card is really two cards.",
        ];

  return [
    "You make study material out of things people have read.",
    "",
    ...shape,
    "",
    `Make about ${count} cards, fewer if the material does not carry that many.`,
    "One idea per card. A card that tests two things tests neither.",
    "Cover the whole of the material rather than the first part of it.",
    "",
    "Use only what is in the source. Do not add facts from your own knowledge, do not fill gaps, and if a section is too thin to make a card from, skip it. A card that is subtly wrong is worse than a card that does not exist, because somebody is about to memorise it.",
    "",
    "Write in the language the source is written in.",
  ].join("\n");
}

export async function POST(request: Request) {
  const refused = overLimit(request, STUDY_LIMIT);
  if (refused) return refused;

  const read = await readBody(request, MAX_REQUEST_BYTES);
  if ("tooLarge" in read) return read.tooLarge;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "No model is configured on this deployment, so cards can't be made. Set OPENROUTER_API_KEY.",
      },
      { status: 501 },
    );

  const who = await whoIsAsking(request);
  if (!who.ok) return who.response;

  const charge = await chargeOne(who.caller);
  if (!charge.allowed) return overAllowance();

  let body: Body;
  try {
    body = JSON.parse(read.text) as Body;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const source = asString(body.text, SOURCE_CEILING).trim();
  if (source.length < 40)
    return Response.json(
      { error: "There isn't enough there to make cards from." },
      { status: 400 },
    );

  const wanted = Math.min(
    MOST_CARDS,
    Math.max(4, typeof body.count === "number" ? Math.round(body.count) : 20),
  );
  const kind = body.kind === "questions" ? "questions" : "cards";

  const messages = [
    { role: "system" as const, content: systemPrompt(wanted, kind) },
    { role: "user" as const, content: source },
  ];

  const attempts: Attempt[] = [];

  for (const model of rotation()) {
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
          "X-Title": "Tougather study",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: [TOOL],
          // Forced rather than "auto": there is exactly one thing to do here,
          // and a model that answers in prose has produced nothing usable.
          tool_choice: { type: "function", function: { name: "make_cards" } },
          temperature: 0.2,
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
        attempts.push({ model, problem: "answered without making any cards" });
        coolDown(model);
        continue;
      }

      let parsed: { cards?: unknown };
      try {
        parsed = JSON.parse(args) as { cards?: unknown };
      } catch {
        attempts.push({ model, problem: "made cards that were not readable" });
        coolDown(model);
        continue;
      }

      // Drop, never repair — the rule the artefact builder follows, for the
      // same reason. A card with no answer on the back is not a card that
      // needs mending, it is one that should not be memorised.
      const raw = Array.isArray(parsed.cards) ? parsed.cards : [];
      const cards: StudyCard[] = [];
      let dropped = 0;
      for (const item of raw) {
        const front = asString((item as Record<string, unknown>)?.front, 400).trim();
        const back = asString((item as Record<string, unknown>)?.back, 1_200).trim();
        if (!front || !back) {
          dropped += 1;
          continue;
        }
        if (cards.length >= MOST_CARDS) {
          dropped += 1;
          continue;
        }
        cards.push({ front, back });
      }

      if (cards.length === 0) {
        attempts.push({ model, problem: "made nothing that held up" });
        coolDown(model);
        continue;
      }

      return Response.json({ cards, dropped, model });
    } catch (error) {
      attempts.push({
        model,
        problem: upstream.signal.aborted
          ? "took too long"
          : String((error as Error).message ?? error),
      });
      coolDown(model);
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", stop);
    }
  }

  // Every model named, and what each one said. A bare "it failed" is the
  // thing nobody can act on.
  return Response.json(
    {
      error:
        attempts.length === 0
          ? "No model is configured."
          : `No model could make cards from that. ${attempts
              .map((a) => `${a.model}: ${a.problem}`)
              .join("; ")}`,
    },
    { status: 502 },
  );
}
