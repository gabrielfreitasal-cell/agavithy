import type {
  IAudioStreamService,
  AudioDevice,
  AudioStreamOptions,
  RecordingResult,
  TranscriptionResult,
  AudioChunkHandler,
  TranscriptionHandler,
  AudioErrorHandler,
} from "../../core/ports/services/IAudioStreamService";
import { logger } from "../../lib/logger";

// ─────────────────────────────────────────────────────────────
// ADAPTER: AudioStreamAdapter
//
// Implements IAudioStreamService.
//
// Transcription Engine: whisper.cpp (via node-whisper or
//   whisper-node) running fully local — no API key required.
//   Alternative: Ollama audio model when available.
//
// In production (Electron):
//   Recording → Web Audio API in the renderer process, buffers
//   sent to main via ipcRenderer → collected and concatenated
//   into a WAV file → passed to whisper.cpp.
//
// In production (Tauri):
//   Use tauri-plugin-microphone for recording + a Rust Whisper
//   binding (candle-transformers) for transcription.
//
// Current (web/server simulation):
//   All methods are functional stubs — they return well-typed
//   results without actually accessing hardware. Safe to wire up
//   in unit tests or as a placeholder before native binding.
// ─────────────────────────────────────────────────────────────

export class AudioStreamAdapter implements IAudioStreamService {
  private _chunkHandlers: AudioChunkHandler[] = [];
  private _partialHandlers: TranscriptionHandler[] = [];
  private _errorHandlers: AudioErrorHandler[] = [];
  private _recording = false;
  private _ready = false;

  async initialize(): Promise<void> {
    // In Electron:
    //   const whisper = await import("whisper-node");
    //   await whisper.init({ modelPath: "./models/ggml-base.en.bin" });
    //   this._ready = true;
    //
    logger.info("AudioStreamAdapter: running in simulation mode (no whisper.cpp)");
    this._ready = true;
  }

  async isTranscriptionReady(): Promise<boolean> {
    return this._ready;
  }

  async listDevices(): Promise<AudioDevice[]> {
    // In Electron's renderer: navigator.mediaDevices.enumerateDevices()
    return [
      { id: "default", label: "Default Microphone", isDefault: true, type: "input" },
    ];
  }

  async startRecording(options: AudioStreamOptions = {}): Promise<void> {
    if (this._recording) {
      throw new Error("AudioStreamAdapter: already recording");
    }
    const maxMs = options.maxDurationMs ?? 0;
    this._recording = true;
    logger.info({ options }, "AudioStreamAdapter: recording started (simulated)");

    if (maxMs > 0) {
      setTimeout(() => {
        if (this._recording) {
          this._recording = false;
          logger.info("AudioStreamAdapter: auto-stopped at maxDurationMs");
        }
      }, maxMs);
    }
  }

  async stopRecording(): Promise<RecordingResult> {
    if (!this._recording) {
      throw new Error("AudioStreamAdapter: no active recording to stop");
    }
    this._recording = false;
    logger.info("AudioStreamAdapter: recording stopped (simulated)");

    // Simulation: return an empty WAV-shaped result
    const simulatedBuffer = Buffer.from("RIFF....WAVEfmt ...data....", "ascii");
    return {
      audioBuffer: simulatedBuffer,
      format: "wav",
      durationMs: 3000,
      sampleRate: 16000,
      channels: 1,
      sizeBytes: simulatedBuffer.byteLength,
      storagePath: null,
      capturedAt: new Date(),
    };
  }

  cancelRecording(): void {
    this._recording = false;
    logger.info("AudioStreamAdapter: recording cancelled");
  }

  isRecording(): boolean {
    return this._recording;
  }

  async transcribe(
    _source: Buffer | string,
    options: { language?: string; model?: string } = {},
  ): Promise<TranscriptionResult> {
    if (!this._ready) {
      throw new Error("AudioStreamAdapter: not initialized");
    }

    // In Electron with whisper-node:
    //   const whisper = await import("whisper-node");
    //   const result = await whisper.transcribe(_source, { language: options.language ?? "auto" });
    //   return { fullText: result.text, segments: result.segments, language: result.language, modelUsed: result.model, processingTimeMs: result.elapsed, isPartial: false };

    logger.info({ options }, "AudioStreamAdapter: transcription (simulated)");
    return {
      fullText: "// Simulated transcription output — wire whisper.cpp for real results",
      segments: [
        {
          start: 0,
          end: 3000,
          text: "// Simulated transcription output — wire whisper.cpp for real results",
          confidence: 0.91,
        },
      ],
      language: options.language ?? "en",
      modelUsed: "simulation",
      processingTimeMs: 0,
      isPartial: false,
    };
  }

  async recordAndTranscribe(
    options: AudioStreamOptions = {},
  ): Promise<{ recording: RecordingResult; transcription: TranscriptionResult }> {
    await this.startRecording(options);
    const recording = await this.stopRecording();
    const transcription = await this.transcribe(recording.audioBuffer);
    return { recording, transcription };
  }

  onChunk(handler: AudioChunkHandler): void {
    this._chunkHandlers.push(handler);
  }

  onPartialTranscription(handler: TranscriptionHandler): void {
    this._partialHandlers.push(handler);
  }

  onError(handler: AudioErrorHandler): void {
    this._errorHandlers.push(handler);
  }

  async terminate(): Promise<void> {
    this._recording = false;
    this._ready = false;
    this._chunkHandlers = [];
    this._partialHandlers = [];
    this._errorHandlers = [];
  }
}
