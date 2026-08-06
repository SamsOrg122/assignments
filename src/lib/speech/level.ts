"use client";

/**
 * The microphone level, as an actual measurement.
 *
 * This is separate from transcription on purpose. Whether the words are being
 * recognised by the browser or simulated, the bars on screen should move
 * because *you* are making noise — a waveform driven by a timer is a lie, and
 * it's the kind of lie a user spots in about two seconds when they stop talking
 * and it keeps dancing.
 *
 * Returns a stop function. If the microphone is refused it resolves to a no-op
 * and reports nothing, so a caller never has to special-case permission.
 */

export type LevelStop = () => void;

export async function meterMicrophone(
  onLevel: (level: number) => void,
): Promise<LevelStop> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices)
    return () => {};

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let raf: number | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    context = new AudioContext();
    // An AudioContext created after an await has lost its user-gesture
    // affiliation and starts suspended, which reads as permanent silence.
    // Resuming is a no-op when it was already running.
    if (context.state === "suspended") await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128) / 128);
      onLevel(peak);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch {
    onLevel(0);
    return () => {};
  }

  return () => {
    if (raf !== null) cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    void context?.close();
    onLevel(0);
  };
}
