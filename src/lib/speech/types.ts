/**
 * The speech seam.
 *
 * Two entry points, because dictation needs both shapes:
 *  - `start()` opens a live session that emits partial then final transcript
 *    chunks — that's what drives the "listening" state.
 *  - `transcribe(audio)` handles a finished recording in one go, which is what
 *    a server-side model (Whisper et al.) will want.
 *
 * A provider may implement one and derive the other. Nothing above this file
 * knows which one is doing the work.
 */

export interface TranscriptChunk {
  /**
   * The transcript *so far*, not the newest piece — every chunk replaces the
   * last, final ones included. Both providers accumulate internally and emit
   * the running total, which is what a caller has to render.
   *
   * This said "interim results are replaced; final ones are appended" until a
   * second caller believed it and concatenated every final chunk onto the one
   * before, repeating the whole sentence each time somebody paused.
   */
  text: string;
  /** Whether the recogniser has stopped revising what it has heard so far. */
  isFinal: boolean;
}

export interface SpeechSession {
  /** Resolves with the complete raw transcript once stopped. */
  stop(): Promise<string>;
  /** Abandon without producing a transcript. */
  cancel(): void;
}

export interface SpeechHandlers {
  onChunk(chunk: TranscriptChunk): void;
  onError(message: string): void;
  /** Rough 0..1 input level, for the level meter. */
  onLevel?(level: number): void;
}

export interface SpeechProvider {
  readonly name: string;
  /**
   * Whether this provider can actually run here. The UI uses it to explain
   * itself rather than to hide the feature.
   */
  isAvailable(): boolean;
  /**
   * `lang` is a BCP-47 tag for what the speaker is about to say — the
   * document's proofing language, not the browser's setting and not the
   * interface's. Somebody with a Dutch browser writing an English chapter is
   * speaking English, and a recogniser told otherwise returns confident
   * nonsense rather than an error.
   */
  start(handlers: SpeechHandlers, lang?: string): Promise<SpeechSession>;
  /** Batch transcription of recorded audio. */
  transcribe(audio: Blob): Promise<string>;
}
