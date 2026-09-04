"use client";

/**
 * Whatever the browser recorded, turned into the one format a server can read.
 *
 * `MediaRecorder` does not produce the same thing twice across platforms. Chrome
 * and the WebKitGTK webview give `audio/webm;codecs=opus`; Safari gives
 * `audio/mp4`; the container and the codec inside it are whatever that engine
 * happened to compile in. Posting that straight up means the server has to
 * accept a moving target, and the day somebody's Safari sends AAC to a model
 * that reads Opus, the failure is a transcript that quietly does not arrive.
 *
 * So the shape is decided here, on the client, where the audio already is:
 * 16 kHz mono 16-bit PCM in a WAV container. Uncompressed, ancient, and
 * understood by everything. 16 kHz because speech recognition is trained at it
 * — the band above 8 kHz carries almost no phonetic information, and sending
 * 48 kHz is three times the bytes for nothing.
 *
 * The cost is size: WAV at this rate is 32 KB per second, so a thirty-second
 * slice is about a megabyte. That is why `lib/speech/server.ts` sends slices
 * rather than a whole meeting, and why the route's size limit is what it is.
 *
 * `AudioContext` is present in the desktop webview — measured, see
 * docs/desktop.md — which is what makes this usable there. `SpeechRecognition`
 * is not, which is why it has to be.
 */

/** 16 kHz mono: what a recogniser wants, and a third of the bytes of 48. */
export const WAV_HZ = 16_000;

export interface Encoded {
  /** 16 kHz mono 16-bit PCM, WAV container. */
  wav: Blob;
  /** How long it actually is, from the sample count rather than a clock. */
  seconds: number;
  /**
   * The loudest sample in it, 0..1.
   *
   * Carried alongside the audio because the server needs it. A model handed
   * silence will not say "I heard nothing" — it will write a plausible meeting,
   * which is the failure this whole feature has to be built against. A peak
   * measured here, from the samples themselves, is the one fact about the audio
   * that the model cannot talk its way around. See `/api/listen`.
   */
  peak: number;
}

/**
 * Decode a recording and re-encode it.
 *
 * Throws rather than returning something empty: a caller that cannot encode
 * has nothing to send, and a zero-length WAV posted to a model is the silent
 * slice the route is written to distrust.
 */
export async function toWav(recorded: Blob, hz: number = WAV_HZ): Promise<Encoded> {
  const bytes = await recorded.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("Nothing was recorded.");

  // Constructed per call and closed at the end. An AudioContext is a hardware
  // handle on most platforms, and one left open per slice is a recorder that
  // runs out of them halfway through a long meeting.
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } finally {
    void context.close();
  }

  const mono = toMono(decoded);
  const samples = resample(mono, decoded.sampleRate, hz);

  let peak = 0;
  for (const sample of samples) {
    const size = Math.abs(sample);
    if (size > peak) peak = size;
  }

  return {
    wav: wrap(samples, hz),
    seconds: samples.length / hz,
    // Clamped because a decoder may hand back samples slightly outside ±1 and
    // a peak of 1.03 would read as a broken measurement rather than a loud one.
    peak: Math.min(1, peak),
  };
}

/**
 * Every channel averaged into one.
 *
 * Not "take the left channel", which is the shorter version of this and is
 * wrong on any recording where the speaker is on the other side — a laptop with
 * two microphones and somebody sitting to the right of it.
 */
function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const out = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) out[i] += data[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= buffer.numberOfChannels;
  return out;
}

/**
 * Linear interpolation, deliberately.
 *
 * A proper windowed-sinc resampler is better and it is not better *here*: the
 * aliasing it avoids lives above 8 kHz, which is exactly the band being thrown
 * away, and a recogniser is not a listener. What matters is that this is
 * twenty lines with no dependency, runs in a webview with no `OfflineAudio`
 * quirks to work around, and cannot fail on a rate it has not seen.
 */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;

  const ratio = from / to;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const at = i * ratio;
    const low = Math.floor(at);
    const high = Math.min(low + 1, input.length - 1);
    const part = at - low;
    out[i] = input[low] * (1 - part) + input[high] * part;
  }
  return out;
}

/** 44 bytes of header, then the samples. The format has not changed since 1991. */
function wrap(samples: Float32Array, hz: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };

  const dataBytes = samples.length * bytesPerSample;
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // PCM, uncompressed
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, hz, true);
  view.setUint32(28, hz * bytesPerSample, true); // bytes per second
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  text(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling, because a sample of 1.2 scaled and truncated
    // wraps to a large negative — one decoded overshoot becoming an audible
    // click, which a recogniser hears as a consonant.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Base64, in chunks, because `apply` on a megabyte-long array overflows the stack. */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
