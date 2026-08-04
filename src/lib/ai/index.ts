"use client";

/**
 * `askAI` — the only entry point the UI uses.
 *
 * To wire a real model: implement `AIProvider` (one method, `stream`), call
 * `setAIProvider(yourProvider)` at startup, and delete nothing else. The
 * streaming contract and the accept/reject change contract already match what
 * a tool-using model returns.
 */

import { useProjects } from "../store";
import type { TableBlock } from "../types";
import { createMockProvider } from "./mock";
import type { AIChunk, AIContext, AIProvider } from "./types";

export type { AIChange, AIChunk, AIContext, AIProvider, AIRequest } from "./types";

const tablesFor = (projectId: string): TableBlock[] =>
  (useProjects.getState().projects.find((p) => p.id === projectId)?.blocks ?? []).filter(
    (b): b is TableBlock => b.type === "table",
  );

let provider: AIProvider = createMockProvider(tablesFor);

export function setAIProvider(next: AIProvider) {
  provider = next;
}

export function getAIProviderName() {
  return provider.name;
}

/**
 * Ask the model. Returns an async iterable of chunks; consumers append `text`
 * chunks as they arrive and hold any `change` chunk pending user approval.
 */
export function askAI(
  prompt: string,
  context: AIContext,
  signal?: AbortSignal,
): AsyncIterable<AIChunk> {
  return provider.stream({ prompt, context, signal });
}
