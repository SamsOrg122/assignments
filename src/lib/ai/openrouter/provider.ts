"use client";

/**
 * The browser half: an `AIProvider` that talks to `/api/ai`.
 *
 * It knows nothing about OpenRouter beyond the route's name. Everything about
 * models, keys and rotation lives on the server, which is what lets the key
 * stay there.
 *
 * The HTML a model returns is sanitised *here* rather than in the route. The
 * allowlist is built on `DOMParser`, and running it in a detached document is
 * the only version of this that is actually safe — a regex over markup on the
 * server would be a sanitiser in name only.
 */

import { sanitizeHtml } from "../../sanitize";
import type { AIChange, AIChunk, AIProvider, AIRequest } from "../types";
import { supabaseDatabase } from "@/lib/db/supabase";
import { frameReader } from "./wire";

/** Pass any HTML a change carries through the document allowlist. */
function clean(change: AIChange): AIChange {
  switch (change.kind) {
    case "replace-text":
    case "append-text":
      return { ...change, html: sanitizeHtml(change.html) };

    case "insert-block":
      return change.block.type === "text"
        ? { ...change, block: { ...change.block, html: sanitizeHtml(change.block.html) } }
        : change;

    case "create-project":
      return {
        ...change,
        blocks: change.blocks.map((b) =>
          b.type === "text" ? { ...b, html: sanitizeHtml(b.html) } : b,
        ),
      };

    default:
      return change;
  }
}

/**
 * The caller's own session, for the endpoint to charge the request to.
 *
 * `/api/ai` spends money, so it stopped answering strangers — every request
 * has to say whose day to count it against. `session()` signs this browser in
 * anonymously if it has not been already, which is what the free plan runs
 * on, so this is not a sign-in prompt in disguise.
 *
 * A deployment with no database configured has nobody to be. The header is
 * left off and the endpoint answers with its own explanation, which is a
 * better message than anything invented here.
 */
async function bearer(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("@/lib/db/client");
    const client = supabase();
    if (!client) return {};
    await supabaseDatabase.session();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

class OpenRouterProvider implements AIProvider {
  /** Which model last answered — worth showing, since it can change per request. */
  private model = "";
  private onModel: () => void;

  constructor(onModel: () => void) {
    this.onModel = onModel;
  }

  get name() {
    return this.model ? `openrouter · ${this.model}` : "openrouter";
  }

  async *stream({ prompt, context, signal }: AIRequest): AsyncIterable<AIChunk> {
    let response: Response;
    try {
      response = await fetch("/api/ai", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(await bearer()),
        },
        body: JSON.stringify({ prompt, context }),
      });
    } catch {
      yield { type: "text", value: "Couldn't reach the assistant — check your connection." };
      yield { type: "done" };
      return;
    }

    if (!response.ok || !response.body) {
      const message = await response
        .json()
        .then((b: { error?: string }) => b.error)
        .catch(() => undefined);
      yield { type: "text", value: message ?? `The assistant answered ${response.status}.` };
      yield { type: "done" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const frames = frameReader();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of frames.push(decoder.decode(value, { stream: true }))) {
          if (frame.type === "model") {
            if (frame.value !== this.model) {
              this.model = frame.value;
              this.onModel();
            }
            continue;
          }
          if (frame.type === "error") {
            yield { type: "text", value: `\n\n${frame.value}` };
            continue;
          }
          if (frame.type === "change") {
            yield { type: "change", value: clean(frame.value) };
            continue;
          }
          if (frame.type === "text") yield frame;
        }
      }
      for (const frame of frames.flush())
        if (frame.type === "text" || frame.type === "change")
          yield frame.type === "change"
            ? { type: "change", value: clean(frame.value) }
            : frame;
    } finally {
      // An aborted read leaves the body open, and the route only stops billing
      // when the connection actually closes.
      void reader.cancel().catch(() => {});
    }

    yield { type: "done" };
  }
}

export const createOpenRouterProvider = (onModel: () => void): AIProvider =>
  new OpenRouterProvider(onModel);

/** Is a model configured on the server? Only the server can answer this. */
export async function openRouterConfigured(): Promise<boolean> {
  try {
    const response = await fetch("/api/ai", { method: "GET" });
    if (!response.ok) return false;
    const body = (await response.json()) as { configured?: boolean };
    return body.configured === true;
  } catch {
    return false;
  }
}
