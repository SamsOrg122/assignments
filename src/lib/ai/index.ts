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
import type { Block } from "../types";
import { createMockProvider } from "./mock";
import type { AIChunk, AIContext, AIProvider } from "./types";

export type { AIChange, AIChunk, AIContext, AIProvider, AIRequest } from "./types";

/**
 * Live block access for the stub. The flattened context is what a real model
 * would read; this is what the stub *computes* from, so a proposed change acts
 * on the document as it is right now rather than a text rendering of it.
 */
const blocksFor = (projectId: string): Block[] =>
  useProjects.getState().projects.find((p) => p.id === projectId)?.blocks ?? [];

let provider: AIProvider = createMockProvider(blocksFor);

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
