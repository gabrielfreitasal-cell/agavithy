// ─────────────────────────────────────────────────────────────
// PORT: IAudioStreamService
//
// Outbound port for microphone/system-audio capture and
// speech-to-text transcription. Designed for the use case where
// a developer dictates a snippet, command, or note verbally.
//
// In production (Electron/Tauri):
//   Uses the Web Audio API (in Electron's renderer), or the
//   native OS audio capture APIs via Tauri's plugin system.
//   Transcription runs via local Whisper (whisper.cpp) or
//   Ollama's audio model.
//
// In web/dev environments:
//   Uses MediaRecorder + Web Speech API as a fallback.
// ─────────────────────────────────────────────────────────────

export type AudioSource = "microphone" | "system" | "both";

export type AudioFormat = "wav" | "mp3" | "ogg" | "webm";

export interface AudioDevice {
  id: string;
  label: string;
  isDefault: boolean;
  type: "input" | "output";
}

export interface AudioStreamOptions {
  source?: AudioSource;
  deviceId?: string;          // specific device; uses default if omitted
  sampleRate?: number;        // e.g. 16000 for Whisper, 44100 for quality
  channels?: number;          // 1 = mono (sufficient for speech), 2 = stereo
  format?: AudioFormat;
  /** Max recording duration before auto-stop. 0 = unlimited. */
  maxDurationMs?: number;
  /** Stop recording when silence exceeds this duration (ms). 0 = disabled. */
  silenceThresholdMs?: number;
}

export interface AudioChunk {
  data: Buffer;
  sequenceNumber: number;
  timestampMs: number;
  durationMs: number;
}

export interface RecordingResult {
  /** Complete audio buffer of the recording. */
  audioBuffer: Buffer;
  format: AudioFormat;
  durationMs: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
  /** Path where the recording was persisted, if auto-saved. */
  storagePath: string | null;
  capturedAt: Date;
}

export interface TranscriptionSegment {
  start: number;   // ms
  end: number;     // ms
  text: string;
  confidence: number; // 0–1
  speakerId?: string; // future: speaker diarization
}

export interface TranscriptionResult {
  fullText: string;
  segments: TranscriptionSegment[];
  /** Detected language (ISO 639-1 code). */
  language: string;
  /** Model that produced this transcription. */
  modelUsed: string;
  processingTimeMs: number;
  isPartial: boolean; // true for streaming/live results
}

export type AudioChunkHandler = (chunk: AudioChunk) => void | Promise<void>;
export type TranscriptionHandler = (result: TranscriptionResult) => void | Promise<void>;
export type AudioErrorHandler = (error: Error) => void;

export interface IAudioStreamService {
  /**
   * Returns all available audio input/output devices.
   */
  listDevices(): Promise<AudioDevice[]>;

  /**
   * Start recording audio. Fires onChunk for each incoming audio buffer.
   * Recording continues until stop() is called or maxDurationMs is reached.
   */
  startRecording(options?: AudioStreamOptions): Promise<void>;

  /**
   * Stop the active recording and return the complete audio result.
   */
  stopRecording(): Promise<RecordingResult>;

  /**
   * Abort the active recording without saving.
   */
  cancelRecording(): void;

  /**
   * True when recording is in progress.
   */
  isRecording(): boolean;

  /**
   * Transcribe an audio buffer or file path using the local model.
   * Does not start a recording — works on pre-captured audio.
   */
  transcribe(
    source: Buffer | string,
    options?: { language?: string; model?: string }
  ): Promise<TranscriptionResult>;

  /**
   * Convenience: record until silence, then immediately transcribe.
   */
  recordAndTranscribe(
    options?: AudioStreamOptions
  ): Promise<{ recording: RecordingResult; transcription: TranscriptionResult }>;

  /**
   * Register a handler for each incoming audio chunk during recording.
   * Enables real-time waveform visualization.
   */
  onChunk(handler: AudioChunkHandler): void;

  /**
   * Register a handler for live/streaming transcription updates.
   * Not all backends support this — no-op when unavailable.
   */
  onPartialTranscription(handler: TranscriptionHandler): void;

  /**
   * Register an error handler.
   */
  onError(handler: AudioErrorHandler): void;

  /**
   * True if the transcription engine is loaded and ready.
   */
  isTranscriptionReady(): Promise<boolean>;

  /**
   * Warm up the transcription model at startup.
   */
  initialize(): Promise<void>;

  /**
   * Release all audio resources and terminate the engine.
   */
  terminate(): Promise<void>;
}
