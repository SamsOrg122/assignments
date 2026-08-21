"use client";

/**
 * Talking to `/api/assist` from a browser tab.
 *
 * The desktop reads this same stream in Rust. Both ends need the frames and
 * neither can import the other's reader, so the shape is declared here and in
 * `desktop/src-tauri/src/assistant/commands.rs`, and the endpoint is the one
 * place that decides what a frame means. Two readers of one wire format is
 * the cost of the note living in two runtimes; three would be too many, which
 * is why the web notepad calls the endpoint the desktop calls rather than
 * growing a second one shaped for browsers.
 *
 * The token is the caller's own Supabase session — including an anonymous
 * one, which is what the free plan runs on. The endpoint verifies it against
 * the project before spending anything, so a tab with no session gets a
 * refusal rather than somebody else's answer.
 */

import { supabase } from "@/lib/db/client";

export interface AssistNote {
  kind: "append" | "replace" | "new";
  body: string;
  label: string;
}

export interface AssistArtefact {
  name: string;
  blocks: unknown[];
  label: string;
}

export type AssistFrame =
  | { type: "model"; value: string }
  | { type: "text"; value: string }
  | { type: "note"; value: AssistNote }
  | { type: "artefact"; value: AssistArtefact }
  | { type: "error"; value: string }
  | { type: "done" };

export interface AssistFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  /** Only for files whose bytes could be read as text. */
  text?: string;
}

export interface Ask {
  prompt: string;
  note: { body: string };
  files: AssistFile[];
  signal?: AbortSignal;
}

/** Anything that arrived on the wire but isn't a frame we know. */
const isFrame = (value: unknown): value is AssistFrame =>
  Boolean(value) && typeof (value as { type?: unknown }).type === "string";

/**
 * Ask, and yield each frame as it lands.
 *
 * A generator rather than a callback because the caller has to be able to
 * stop reading: closing the panel mid-answer should abandon the request, and
 * `for await` with a `break` does exactly that through the signal the caller
 * already owns.
 */
export async function* askAssistant(ask: Ask): AsyncGenerator<AssistFrame> {
  const client = supabase();
  if (!client) {
    yield {
      type: "error",
      value: "This deployment has no account database, so there is nobody to ask as.",
    };
    return;
  }

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    yield { type: "error", value: "Sign in before asking." };
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/assist", {
      method: "POST",
      signal: ask.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt: ask.prompt,
        note: ask.note,
        files: ask.files,
        where: "web",
      }),
    });
  } catch (error) {
    if (ask.signal?.aborted) return;
    yield { type: "error", value: String((error as Error).message ?? error) };
    return;
  }

  // A refusal arrives as JSON, not as frames — no key configured, no session,
  // too many questions in a minute. Say the reason rather than "failed".
  if (!response.ok || !response.body) {
    let why = `The assistant answered ${response.status}.`;
    try {
      const problem = (await response.json()) as { error?: unknown };
      if (typeof problem.error === "string") why = problem.error;
    } catch {
      /* the status is all there is */
    }
    yield { type: "error", value: why };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let tail = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      tail += decoder.decode(value, { stream: true });

      const lines = tail.split("\n");
      // The last piece is whatever arrived without its newline yet. Parsing it
      // would mean parsing half a frame.
      tail = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (isFrame(parsed)) yield parsed;
      }
    }
  } catch (error) {
    if (!ask.signal?.aborted)
      yield { type: "error", value: String((error as Error).message ?? error) };
  } finally {
    // Cancelling the reader is what actually severs the request when the
    // caller breaks out of the loop; the abort signal only covers the fetch.
    await reader.cancel().catch(() => {});
  }
}
