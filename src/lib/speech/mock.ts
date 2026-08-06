"use client";

/**
 * Fallback capture for browsers without the Web Speech API.
 *
 * It still opens the microphone — the level meter is real audio, so the
 * "listening" state isn't theatre — but the words come from a scripted, messy
 * transcript. That matters: the whole point of speak-to-prose is turning
 * *disfluent* speech into clean writing, so a fake transcript that was already
 * tidy would demo nothing.
 */

import { meterMicrophone } from "./level";
import type { SpeechHandlers, SpeechProvider, SpeechSession } from "./types";

/** Deliberately full of false starts, fillers and run-ons. */
const SCRIPT = [
  "so um the thing i want to say in this section is basically that",
  "interface density has a cost right and like",
  "we measured it we didn't just assert it you know",
  "uh so twenty four people came in they did two sessions each",
  "and the sparse condition it just it held attention longer",
  "i mean the median run was like nine minutes versus five",
  "which is you know that's not a small difference",
  "um and the other thing which i think is actually the interesting bit is",
  "people looked away from the text even when they didn't click anything",
  "so it's not just about clicks it's about where your eyes go",
];

export const mockSpeechProvider: SpeechProvider = {
  name: "simulated",

  isAvailable: () => true,

  async start(handlers: SpeechHandlers): Promise<SpeechSession> {
    // Real microphone level, even though the words are simulated — the bars
    // should move because you're talking, not because a timer says so.
    const stopMeter = await meterMicrophone((l) => handlers.onLevel?.(l));

    let spoken = "";
    let line = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const emitNext = () => {
      if (line >= SCRIPT.length) return;
      const words = SCRIPT[line].split(" ");
      line++;
      let w = 0;
      const step = () => {
        if (w < words.length) {
          const partial = `${spoken} ${words.slice(0, ++w).join(" ")}`.trim();
          handlers.onChunk({ text: partial, isFinal: false });
          timers.push(setTimeout(step, 90 + Math.random() * 70));
        } else {
          spoken = `${spoken} ${words.join(" ")}`.trim();
          handlers.onChunk({ text: spoken, isFinal: true });
          timers.push(setTimeout(emitNext, 380));
        }
      };
      step();
    };
    timers.push(setTimeout(emitNext, 500));

    const teardown = () => {
      for (const t of timers) clearTimeout(t);
      stopMeter();
    };

    return {
      stop: async () => {
        teardown();
        return spoken.trim();
      },
      cancel: teardown,
    };
  },

  async transcribe() {
    return SCRIPT.join(" ");
  },
};
