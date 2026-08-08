/**
 * The AI endpoint.
 *
 * It exists for one reason: `OPENROUTER_API_KEY` must never reach a browser.
 * Everything else here follows from that — the context is posted up, the
 * answer is streamed back, and the key stays on this side.
 *
 * GET reports whether it is switched on. The browser cannot see a server-only
 * variable, so asking is the only honest way for the app to know whether it
 * has a model or a stub; guessing from a `NEXT_PUBLIC_` flag would mean the
 * setting could say "OpenRouter" while every request 501s.
 */

import { buildMessages } from "@/lib/ai/openrouter/prompt";
import {
  coolDown,
  describeFailure,
  rotation,
  shouldRotate,
  type Attempt,
} from "@/lib/ai/openrouter/models";
import { TOOLS, buildChange } from "@/lib/ai/openrouter/tools";
import { encodeFrame, type AIFrame } from "@/lib/ai/openrouter/wire";
import type { AIContext } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Overridable so the rotation can be tested against a stub, and so a
 * self-hosted OpenAI-compatible gateway works without a fork.
 */
const endpoint = () =>
  (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    "",
  ) + "/chat/completions";

/** Long enough for a considered answer, short enough to not hold a lambda open. */
const TIMEOUT_MS = 120_000;

export function GET() {
  const configured = Boolean(process.env.OPENROUTER_API_KEY);
  return Response.json({
    configured,
    models: configured ? rotation() : [],
  });
}

interface Body {
  prompt?: unknown;
  context?: unknown;
}

/** A tool call, reassembled from the fragments it arrives in. */
interface PartialCall {
  name: string;
  args: string;
}

export async function POST(request: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "OPENROUTER_API_KEY is not set, so there is no model to ask. The local assistant is still available.",
      },
      { status: 501 },
    );

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const context = body.context as AIContext | undefined;
  if (!prompt) return Response.json({ error: "No question." }, { status: 400 });
  if (!context || !Array.isArray(context.blocks))
    return Response.json({ error: "No project context." }, { status: 400 });

  const messages = buildMessages(prompt, context);
  const referer =
    process.env.OPENROUTER_APP_URL ?? request.headers.get("origin") ?? undefined;

  const encoder = new TextEncoder();
  const upstream = new AbortController();
  // A reader that walks away should stop the meter — an abandoned stream still
  // bills for every token it generates.
  request.signal.addEventListener("abort", () => upstream.abort());
  const timeout = setTimeout(() => upstream.abort(), TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: AIFrame) =>
        controller.enqueue(encoder.encode(encodeFrame(frame)));

      const attempts: Attempt[] = [];
      let answered = false;

      for (const model of rotation()) {
        // Anything already sent belongs to a model that started answering, so
        // there is nothing left to fall back to.
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
              ...(referer ? { "HTTP-Referer": referer } : {}),
              "X-Title": "Assignments",
            },
            body: JSON.stringify({
              model,
              messages,
              tools: TOOLS,
              tool_choice: "auto",
              stream: true,
              temperature: 0.4,
            }),
          });

          if (!response.ok || !response.body) {
            const text = await response.text().catch(() => "");
            const problem = describeFailure(response.status, text);
            attempts.push({ model, problem });
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
              // OpenRouter sends `: OPENROUTER PROCESSING` keep-alives.
              if (!line || line.startsWith(":")) continue;
              if (!line.startsWith("data:")) continue;
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
          // A clean stream that said nothing is a broken model as far as this
          // request is concerned, and worth falling past.
          attempts.push({ model, problem: "Returned nothing." });
          coolDown(model);
          continue;
        }

        if (!answered) {
          // Tool calls without a word of prose still count as an answer.
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
            dropped++;
            continue;
          }
          const change = buildChange(call.name, args, context);
          if (change) send({ type: "change", value: change });
          else dropped++;
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
              : `No model answered. ${attempts
                  .map((a) => `${a.model}: ${a.problem}`)
                  .join(" · ")}`,
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
      // Proxies that buffer would defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
