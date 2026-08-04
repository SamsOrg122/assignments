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
  text: string;
  /** Interim results are replaced; final ones are appended. */
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
  start(handlers: SpeechHandlers): Promise<SpeechSession>;
  /** Batch transcription of recorded audio. */
  transcribe(audio: Blob): Promise<string>;
}
