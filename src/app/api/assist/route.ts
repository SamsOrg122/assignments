/**
 * The notepad's assistant.
 *
 * A separate endpoint from `/api/ai` on purpose. That one answers questions
 * *about a project* — it requires a context of blocks, its tools address
 * block ids, and its limits are sized for a browser tab. The desktop note
 * has none of those things: one textarea, a handful of dropped files, and no
 * project at all until it makes one.
 *
 * Why the desktop calls this rather than OpenRouter directly: the key. A
 * key compiled into a downloadable binary is a key everybody has, and a key
 * fetched by the app is a key the app can be asked to hand over. It stays
 * here, where it already lives, and the desktop authenticates as the person
 * using it — the same Supabase access token it already holds for sync, which
 * is checked against the project before a single token is spent.
 *
 * The reply is the same NDJSON frame stream `/api/ai` uses, with two frames
 * of its own: `note` for a change to the open note, and `artefact` for a
 * document to be made. Rust reads it, applies what it can, and never learns
 * what a slide is.
 */

import {
  coolDown,
  describeFailure,
  rotation,
  shouldRotate,
  type Attempt,
} from "@/lib/ai/openrouter/models";
import { buildBlocks } from "@/lib/ai/assist/build";
import { overLimit, readBody } from "@/lib/api/guard";
import { chargeOne, overAllowance, whoIsAsking } from "@/lib/api/who";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const endpoint = () =>
  (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "") +
  "/chat/completions";

const TIMEOUT_MS = 120_000;

/**
 * The ceiling, for the same reason `/api/ai` has one: every request here
 * bills somebody. Lower than the browser's twelve, because a note window is
 * one person typing one question at a time and anything faster is a loop.
 */
const ASSIST_LIMIT = { name: "assist", limit: 8, windowMs: 60_000 };

/**
 * Larger than the browser endpoint's, because this one carries the *contents*
 * of a dropped file — a spreadsheet's text is the whole point of "analyse
 * this". Still bounded: the desktop refuses files over 8 MiB at the drop and
 * sends at most the first stretch of each one's text.
 */
const MAX_REQUEST_BYTES = 1024 * 1024;

interface Body {
  prompt?: unknown;
  note?: unknown;
  files?: unknown;
  where?: unknown;
}

/**
 * Which notepad is asking.
 *
 * Same tools, same frames, same account check — the only difference is how
 * much room the answer has to land in and what "open it" means afterwards.
 * A reply sized for a 340-pixel window reads as curt in a browser tab, and a
 * reply sized for a tab does not fit in the window at all, so the one thing
 * that varies is told to the model rather than left to it.
 */
type Surface = "desktop" | "web";

interface AskFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  /** Present only for files whose text could be read. */
  text?: string;
}

/** A tool call, reassembled from the fragments it arrives in. */
interface PartialCall {
  name: string;
  args: string;
}

const asString = (value: unknown, cap = 100_000): string =>
  typeof value === "string" ? value.slice(0, cap) : "";

function readFiles(raw: unknown): AskFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .slice(0, 12)
    .map((f) => ({
      id: asString(f.id, 64),
      name: asString(f.name, 200),
      mime: asString(f.mime, 120),
      bytes: typeof f.bytes === "number" ? f.bytes : 0,
      ...(typeof f.text === "string" ? { text: f.text.slice(0, 120_000) } : {}),
    }))
    .filter((f) => f.id && f.name);
}

/* ── What the model may do ──────────────────────────────── */

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: "function" as const,
  function: {
    name,
    description,
    parameters: {
      type: "object",
      additionalProperties: false,
      // `label` on every tool, and required, so the note can always say what
      // it is about to do in the person's own terms rather than "1 change".
      properties: { ...properties, label: { type: "string" } },
      required: [...required, "label"],
    },
  },
});

const BLOCK_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["text", "table", "chart", "slides"] },
      title: { type: "string" },
      text: { type: "string", description: "For kind=text. Plain prose; blank lines separate paragraphs." },
      columns: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            type: {
              type: "string",
              enum: ["text", "number", "date", "select", "checkbox"],
            },
          },
          required: ["name", "type"],
        },
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { cells: { type: "array" } },
          required: ["cells"],
        },
      },
      of: {
        type: "string",
        description:
          "For kind=chart: the exact title of a table block in this same list.",
      },
      kind_of_chart: {
        type: "string",
        enum: ["bar", "line", "area", "pie", "scatter"],
      },
      slides: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
            note: { type: "string" },
            layout: {
              type: "string",
              enum: ["auto", "title", "statement", "bullets", "split"],
            },
          },
          required: ["title"],
        },
      },
    },
    required: ["kind"],
  },
} as const;

const TOOLS = [
  tool(
    "append_note",
    "Add text to the end of the note that is open. Use for adding to what is already written.",
    { text: { type: "string" } },
    ["text"],
  ),
  tool(
    "replace_note",
    "Replace everything in the open note. Use when asked to rewrite, tidy or translate what is there.",
    { text: { type: "string" } },
    ["text"],
  ),
  tool(
    "new_note",
    "Start a new note with this text, leaving the open one alone.",
    { text: { type: "string" } },
    ["text"],
  ),
  tool(
    "make_document",
    "Make a document in the person's account: prose, tables, charts and slides. Use for 'analyse this file', 'write me a report', 'turn this into a presentation'. A chart must name, in `of`, the exact title of a table in the same list.",
    {
      name: { type: "string" },
      blocks: BLOCK_SCHEMA,
    },
    ["name", "blocks"],
  ),
];

function systemPrompt(note: string, files: AskFile[], where: Surface): string {
  const shelf = files.length
    ? files
        .map((f) => {
          const head = `- ${f.name} (${f.mime || "unknown type"}, ${f.bytes} bytes)`;
          return f.text ? `${head}\n<<<\n${f.text}\n>>>` : `${head} — contents not readable as text`;
        })
        .join("\n")
    : where === "web"
      ? "(no file attached to this question)"
      : "(nothing dropped on the note)";

  const here =
    where === "web"
      ? [
          "You are the assistant inside Tougather's notepad, open in a browser tab beside the note somebody is writing.",
          "",
          "Answer in the reply itself, briefly — a short paragraph, or a handful of sentences at most. The panel is a column beside the note, not a document.",
        ]
      : [
          "You are the assistant inside Tougather's floating desktop note — a small always-on-top window somebody writes in while doing something else.",
          "",
          "Answer briefly in the reply itself. The window is 340 pixels wide, so two or three sentences is a long answer.",
        ];

  const opens =
    where === "web"
      ? "which opens straight away in the tab they are already in"
      : "which they open in the full app";

  return [
    ...here,
    "",
    "When the person asks you to change what is written, use append_note, replace_note or new_note rather than printing the new text in the reply — the note is the thing they are looking at.",
    "",
    `When they ask for something bigger than a note — an analysis, a report, a summary of a file, a presentation — use make_document. That makes a real document in their account with prose, tables, charts and slides, ${opens}. Say in your reply that you have made it and what is in it.`,
    "",
    "For an analysis of data: give the numbers a table, and give the table a chart. A chart's `of` must be the exact title of a table you put in the same list, or it is dropped.",
    "",
    "Never invent figures. If a file's contents were not readable, say so rather than analysing what you imagine is in it.",
    "",
    "The note currently says:",
    note.trim() ? `<<<\n${note.slice(0, 40_000)}\n>>>` : "(empty)",
    "",
    where === "web" ? "Files attached to this question:" : "Files dropped on this note:",
    shelf,
  ].join("\n");
}

/* ── The stream ─────────────────────────────────────────── */

type Frame =
  | { type: "model"; value: string }
  | { type: "text"; value: string }
  | { type: "note"; value: { kind: "append" | "replace" | "new"; body: string; label: string } }
  | { type: "artefact"; value: { name: string; blocks: unknown[]; label: string } }
  | { type: "error"; value: string }
  | { type: "done" };

const encodeFrame = (frame: Frame): string => `${JSON.stringify(frame)}\n`;

export async function POST(request: Request) {
  const refused = overLimit(request, ASSIST_LIMIT);
  if (refused) return refused;

  const read = await readBody(request, MAX_REQUEST_BYTES);
  if ("tooLarge" in read) return read.tooLarge;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "No model is configured on this deployment, so the note's assistant has nothing to ask. Set OPENROUTER_API_KEY.",
      },
      { status: 501 },
    );

  const who = await whoIsAsking(request);
  if (!who.ok) return who.response;

  // Charged before a token is spent, not after — a request that is refused
  // upstream still cost this endpoint a model call to find that out.
  const charge = await chargeOne(who.caller);
  if (!charge.allowed) return overAllowance();

  let body: Body;
  try {
    body = JSON.parse(read.text) as Body;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const prompt = asString(body.prompt, 8_000).trim();
  if (!prompt) return Response.json({ error: "No question." }, { status: 400 });

  const noteBody = asString(
    (body.note as Record<string, unknown> | undefined)?.body,
    40_000,
  );
  const files = readFiles(body.files);
  const where: Surface = body.where === "web" ? "web" : "desktop";

  const messages = [
    { role: "system" as const, content: systemPrompt(noteBody, files, where) },
    { role: "user" as const, content: prompt },
  ];

  const encoder = new TextEncoder();
  const upstream = new AbortController();
  request.signal.addEventListener("abort", () => upstream.abort());
  const timeout = setTimeout(() => upstream.abort(), TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: Frame) =>
        controller.enqueue(encoder.encode(encodeFrame(frame)));

      const attempts: Attempt[] = [];
      let answered = false;

      for (const model of rotation()) {
        if (answered) break;

        let produced = false;
        const calls = new Map<number, PartialCall>();

        try {
          const response = await fetch(endpoint(), {
            method: "POST",
            signal: upstream.signal,
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "X-Title": "Tougather note",
            },
            body: JSON.stringify({
              model,
              messages,
              tools: TOOLS,
              tool_choice: "auto",
              stream: true,
              temperature: 0.3,
            }),
          });

          if (!response.ok || !response.body) {
            const text = await response.text().catch(() => "");
            attempts.push({ model, problem: describeFailure(response.status, text) });
            if (!shouldRotate(response.status, text)) break;
            coolDown(model);
            continue;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let tail = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            tail += decoder.decode(value, { stream: true });

            const lines = tail.split("\n");
            tail = lines.pop() ?? "";

            for (const raw of lines) {
              const line = raw.trim();
              if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;

              let event: {
                choices?: Array<{
                  delta?: {
                    content?: string | null;
                    tool_calls?: Array<{
                      index?: number;
                      function?: { name?: string; arguments?: string };
                    }>;
                  };
                }>;
                error?: { message?: string };
              };
              try {
                event = JSON.parse(payload);
              } catch {
                continue;
              }

              if (event.error?.message) throw new Error(event.error.message);
              const delta = event.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                if (!produced) {
                  produced = true;
                  answered = true;
                  send({ type: "model", value: model });
                }
                send({ type: "text", value: delta.content });
              }

              for (const call of delta.tool_calls ?? []) {
                const index = call.index ?? 0;
                const held = calls.get(index) ?? { name: "", args: "" };
                if (call.function?.name) held.name = call.function.name;
                if (call.function?.arguments) held.args += call.function.arguments;
                calls.set(index, held);
                produced = true;
              }
            }
          }
        } catch (error) {
          if (upstream.signal.aborted) break;
          const problem = error instanceof Error ? error.message : "Request failed";
          attempts.push({ model, problem });
          coolDown(model);
          if (answered) {
            send({ type: "error", value: `${model} stopped mid-answer: ${problem}` });
            break;
          }
          continue;
        }

        if (!produced) {
          attempts.push({ model, problem: "Returned nothing." });
          coolDown(model);
          continue;
        }

        if (!answered) {
          answered = true;
          send({ type: "model", value: model });
        }

        let dropped = 0;
        for (const call of calls.values()) {
          if (!call.name) continue;
          let args: Record<string, unknown>;
          try {
            args = call.args.trim() ? JSON.parse(call.args) : {};
          } catch {
            dropped += 1;
            continue;
          }
          const label = asString(args.label, 200) || "Change the note";

          if (call.name === "make_document") {
            const built = buildBlocks(args.blocks);
            dropped += built.dropped;
            if (!built.blocks.length) {
              dropped += 1;
              continue;
            }
            send({
              type: "artefact",
              value: {
                name: asString(args.name, 200) || "Untitled",
                blocks: built.blocks,
                label,
              },
            });
            continue;
          }

          const kind =
            call.name === "append_note"
              ? "append"
              : call.name === "replace_note"
                ? "replace"
                : call.name === "new_note"
                  ? "new"
                  : null;
          const text = asString(args.text, 200_000);
          if (!kind || !text) {
            dropped += 1;
            continue;
          }
          send({ type: "note", value: { kind, body: text, label } });
        }

        if (dropped)
          send({
            type: "text",
            value: `\n\n_${dropped} proposed change${dropped === 1 ? "" : "s"} didn't hold up and ${dropped === 1 ? "was" : "were"} dropped._`,
          });

        break;
      }

      if (!answered && !upstream.signal.aborted)
        send({
          type: "error",
          value:
            attempts.length === 0
              ? "No models are configured. Set OPENROUTER_MODELS."
              : `No model answered. ${attempts.map((a) => `${a.model}: ${a.problem}`).join(" · ")}`,
        });

      send({ type: "done" });
      clearTimeout(timeout);
      controller.close();
    },
    cancel() {
      clearTimeout(timeout);
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
