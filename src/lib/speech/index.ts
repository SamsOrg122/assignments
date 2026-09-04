"use client";

/**
 * Speech entry point.
 *
 * Prefers real browser capture and falls back to the simulated provider, so
 * the interaction is always exercisable. Swap in a server-backed provider with
 * `setSpeechProvider()` — nothing above this file changes.
 */

import { webSpeechProvider } from "./webspeech";
import { serverSpeechProvider } from "./server";
import { mockSpeechProvider } from "./mock";
import type { SpeechHandlers, SpeechProvider, SpeechSession } from "./types";

export type { SpeechHandlers, SpeechProvider, SpeechSession, TranscriptChunk } from "./types";

let override: SpeechProvider | null = null;

export function setSpeechProvider(provider: SpeechProvider | null) {
  override = provider;
}

/** Errors that mean this browser can't actually transcribe, only pretend to. */
const FATAL = new Set([
  "network",
  "service-not-allowed",
  "language-not-supported",
  "audio-capture",
]);

/*
 * Three providers, in the only order that is defensible.
 *
 * The browser recogniser first: free, live, and revises as you speak. Then the
 * server ear, which is equally real — it posts the actual audio to
 * `/api/listen` — and costs a model call per half minute. The mock is last and
 * it is not a recogniser at all; it recites a scripted monologue, which is a
 * fine demo and a catastrophe anywhere the words are believed.
 *
 * Adding the middle entry is what makes the fall-through safe. Before it,
 * every browser without Web Speech went straight from "real" to "fiction" in
 * one step, and the surfaces that could not survive that — the recorder —
 * had to refuse to run rather than take the risk.
 */
function pick(): SpeechProvider {
  if (override) return override;
  if (webSpeechProvider.isAvailable()) return webSpeechProvider;
  if (serverSpeechProvider.isAvailable()) return serverSpeechProvider;
  return mockSpeechProvider;
}

export function speechProviderName(): string {
  return pick().name;
}

/**
 * Open a live dictation session.
 *
 * The Web Speech API being *present* doesn't mean it works — Chrome routes it
 * through a network service that is absent in headless builds, behind some
 * proxies, and offline. So a fatal error before any words arrive silently
 * hands over to the simulated provider rather than leaving the user with a
 * recorder that captures nothing.
 */
export async function listen(
  handlers: SpeechHandlers,
  lang?: string,
): Promise<SpeechSession> {
  const provider = pick();
  if (provider !== webSpeechProvider) return provider.start(handlers, lang);

  let heardAnything = false;
  let swapped: SpeechSession | null = null;
  let primary: SpeechSession | null = null;

  /*
   * What a dead browser recogniser falls back TO, which changed.
   *
   * It used to be the mock, unconditionally — one fatal error and the user was
   * being read a scripted monologue about interface density under the
   * impression that it was their own dictation. The server ear is tried first
   * now: it is real audio and real words, and a fatal Web Speech error says
   * nothing about whether `MediaRecorder` works.
   *
   * The mock survives as the last resort because a browser with no capture at
   * all still has to be able to demonstrate the interaction, and because
   * deleting it would not delete the problem — it would move it to whoever
   * next needs a demo and re-adds something worse.
   */
  const fallBack = async () => {
    if (swapped || heardAnything) return;
    primary?.cancel();
    swapped = serverSpeechProvider.isAvailable()
      ? await serverSpeechProvider.start(handlers, lang)
      : await mockSpeechProvider.start(handlers);
  };

  primary = await provider.start({
    ...handlers,
    onChunk: (chunk) => {
      if (chunk.text.trim()) heardAnything = true;
      handlers.onChunk(chunk);
    },
    onError: (message) => {
      if (FATAL.has(message)) void fallBack();
      else handlers.onError(message);
    },
  }, lang);

  // A session that produces nothing at all is the same failure, quietly.
  const grace = setTimeout(() => void fallBack(), 2200);

  return {
    stop: async () => {
      clearTimeout(grace);
      if (swapped) return swapped.stop();
      const transcript = await primary!.stop();
      if (transcript.trim()) return transcript;
      // Last chance: nothing came back, so give the user something to work
      // with rather than an empty panel.
      swapped = await mockSpeechProvider.start(handlers);
      await new Promise((r) => setTimeout(r, 2600));
      return swapped.stop();
    },
    cancel: () => {
      clearTimeout(grace);
      (swapped ?? primary)?.cancel();
    },
  };
}

/** Batch-transcribe a finished recording. */
export function transcribe(audio: Blob): Promise<string> {
  return pick().transcribe(audio);
}
