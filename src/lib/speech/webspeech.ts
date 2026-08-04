"use client";

/**
 * Real capture via the Web Speech API, where the browser has it (Chrome and
 * Edge do; Firefox and headless builds don't). This is genuinely live — it is
 * not a simulation — which is why it is tried first.
 *
 * `transcribe(audio)` is deliberately unimplemented here: the Web Speech API
 * has no batch mode. A server provider fills that in.
 */

import type { SpeechHandlers, SpeechProvider, SpeechSession } from "./types";

/* The API is still vendor-prefixed and missing from lib.dom in places. */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  0: RecognitionAlternative;
  isFinal: boolean;
  length: number;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const webSpeechProvider: SpeechProvider = {
  name: "web-speech",

  isAvailable: () => getCtor() !== null,

  async start(handlers: SpeechHandlers): Promise<SpeechSession> {
    const Ctor = getCtor();
    if (!Ctor) throw new Error("Speech recognition is unavailable");

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      typeof navigator !== "undefined" ? navigator.language : "en-US";

    let final = "";
    let settle: ((transcript: string) => void) | null = null;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) final += text;
        else interim += text;
      }
      handlers.onChunk({ text: interim || final, isFinal: !interim });
    };

    recognition.onerror = (e) => {
      // "no-speech" fires on a quiet pause; it isn't worth alarming anyone.
      if (e.error !== "no-speech" && e.error !== "aborted")
        handlers.onError(e.error);
    };

    recognition.onend = () => settle?.(final.trim());

    recognition.start();

    return {
      stop: () =>
        new Promise<string>((resolve) => {
          settle = resolve;
          recognition.stop();
        }),
      cancel: () => {
        settle = null;
        recognition.abort();
      },
    };
  },

  async transcribe() {
    throw new Error("Batch transcription needs a server provider");
  },
};
