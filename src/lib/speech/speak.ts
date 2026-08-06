"use client";

/**
 * The other half of voice: the assistant talking back.
 *
 * A seam, like everything else — `setVoiceProvider()` swaps the browser's
 * built-in synthesis for a real one without touching a component. The browser
 * default is genuinely usable and costs nothing, so it ships as the fallback
 * rather than as a stub.
 *
 * `onLevel` is the part that matters visually. Web Speech synthesis gives no
 * audio analysis, so loudness is derived from the *boundary* events it does
 * emit — a pulse per word, decaying between. That's an honest approximation:
 * the bars move in time with the words actually being spoken, and they stop
 * the moment the speech does.
 */

export interface SpeakHandlers {
  /** 0..1, for the waveform. */
  onLevel?(level: number): void;
  onEnd?(): void;
  onError?(message: string): void;
}

export interface SpeakHandle {
  stop(): void;
}

export interface VoiceProvider {
  readonly name: string;
  isAvailable(): boolean;
  speak(text: string, handlers: SpeakHandlers): SpeakHandle;
}

/** Markdown emphasis and code fences are for the eye, not the ear. */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const browserVoice: VoiceProvider = {
  name: "browser",

  isAvailable: () =>
    typeof window !== "undefined" && "speechSynthesis" in window,

  speak(text, handlers) {
    const utterance = new SpeechSynthesisUtterance(forSpeech(text));
    utterance.rate = 1.02;
    utterance.pitch = 1;

    let raf: number | null = null;
    let level = 0;

    // Decay continuously; each spoken word kicks it back up. The result reads
    // as speech rhythm rather than as a loop.
    const tick = () => {
      level = Math.max(0, level - 0.045);
      handlers.onLevel?.(level);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    utterance.onboundary = () => {
      level = 0.55 + Math.min(0.4, level);
    };
    const finish = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      handlers.onLevel?.(0);
      handlers.onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = (e) => {
      if (raf !== null) cancelAnimationFrame(raf);
      handlers.onLevel?.(0);
      // "interrupted" and "canceled" are what a deliberate stop looks like.
      if (e.error && e.error !== "interrupted" && e.error !== "canceled")
        handlers.onError?.(e.error);
      handlers.onEnd?.();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    return {
      stop: () => {
        if (raf !== null) cancelAnimationFrame(raf);
        handlers.onLevel?.(0);
        window.speechSynthesis.cancel();
      },
    };
  },
};

/** Available when nothing can speak — reports itself honestly. */
const silentVoice: VoiceProvider = {
  name: "unavailable",
  isAvailable: () => false,
  speak(_text, handlers) {
    handlers.onError?.("This browser has no speech synthesis.");
    handlers.onEnd?.();
    return { stop: () => {} };
  },
};

let override: VoiceProvider | null = null;

export function setVoiceProvider(provider: VoiceProvider | null) {
  override = provider;
}

function pick(): VoiceProvider {
  if (override) return override;
  return browserVoice.isAvailable() ? browserVoice : silentVoice;
}

export const canSpeak = () => pick().isAvailable();
export const voiceProviderName = () => pick().name;

export function speak(text: string, handlers: SpeakHandlers): SpeakHandle {
  return pick().speak(text, handlers);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}
