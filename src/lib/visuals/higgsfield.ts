/**
 * `generateVisual` — the image-generation seam.
 *
 * Same shape as every other seam in this codebase (`askAI`, `transcribe`,
 * `resolveSource`, `ChatProvider`): the app depends on the interface, and the
 * provider is swapped at the edge. Nothing here runs at request time — filling
 * a slot is a design-time act that produces a file in `public/visuals/`, not a
 * live API call on someone's first page view. A landing page that generated
 * its own hero image on load would be slow, non-deterministic and expensive.
 *
 * FOUNDER: wire this to Higgsfield (higgsfield.ai — multi-model image and
 * video generation) from a script or an internal tool:
 *
 *   setVisualProvider(async ({ prompt, model, aspect }) => {
 *     const job = await higgsfield.generateImage({ prompt, model, aspect_ratio: aspect });
 *     return { url: job.results[0].url, model, generatedAt: Date.now() };
 *   });
 *
 * Then save the result under `public/visuals/` and update the slot in
 * `slots.ts`. Two steps, both deliberate — a generated asset should be looked
 * at by a person before it represents the company.
 */

import { VISUAL_SLOTS, type SlotId, type VisualSlot } from "./slots";

export interface VisualRequest {
  prompt: string;
  model: string;
  aspect: string;
}

export interface GeneratedVisual {
  url: string;
  model: string;
  generatedAt: number;
}

export type VisualProvider = (req: VisualRequest) => Promise<GeneratedVisual>;

const notConfigured: VisualProvider = async () => {
  throw new Error(
    "No visual provider configured. Call setVisualProvider() with a Higgsfield " +
      "client, or leave slots on their crafted fallbacks.",
  );
};

let provider: VisualProvider = notConfigured;

export function setVisualProvider(next: VisualProvider) {
  provider = next;
}

export const hasVisualProvider = () => provider !== notConfigured;

/** Generate the asset for one declared slot. Never called during a render. */
export function generateVisual(id: SlotId): Promise<GeneratedVisual> {
  const s: VisualSlot = VISUAL_SLOTS[id];
  return provider({ prompt: s.prompt, model: s.model, aspect: s.aspect });
}
