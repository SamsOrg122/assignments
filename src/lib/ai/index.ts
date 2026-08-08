"use client";

/**
 * `askAI` — the only entry point the UI uses.
 *
 * One provider at a time, swapped at runtime. The local stub is what runs
 * until `connectAI` finds a model behind `/api/ai`, and it stays the fallback
 * rather than being deleted: an app whose assistant disappears when a key is
 * missing is worse than one whose assistant is honest about being local.
 */

import { useProjects } from "../store";
import type { Block } from "../types";
import { createMockProvider } from "./mock";
import { createOpenRouterProvider, openRouterConfigured } from "./openrouter/provider";
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

/**
 * Settings shows which provider is wired in, and the answer changes twice
 * after first paint — once when the probe comes back, and again when a model
 * actually answers and names itself. Both need to reach the screen.
 */
const listeners = new Set<() => void>();
const announce = () => listeners.forEach((fn) => fn());

export function subscribeAIProvider(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setAIProvider(next: AIProvider) {
  provider = next;
  announce();
}

export function getAIProviderName() {
  return provider.name;
}

/**
 * Ask the server whether it has a model, once per load.
 *
 * The key is server-only by design, so the browser genuinely cannot know
 * without asking. Failing the probe is not an error state — it means the local
 * assistant, which is a working product, not a degraded one.
 */
let probed = false;
export function connectAI() {
  if (probed) return;
  probed = true;
  void openRouterConfigured().then((ready) => {
    if (ready) setAIProvider(createOpenRouterProvider(announce));
  });
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
