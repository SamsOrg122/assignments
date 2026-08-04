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
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let raf: number | null = null;

    // Open the real microphone for the level meter. If permission is refused
    // we carry on without it rather than failing the whole session.
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128) / 128);
        handlers.onLevel?.(peak);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      handlers.onLevel?.(0);
    }

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
      if (raf !== null) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void audioContext?.close();
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
