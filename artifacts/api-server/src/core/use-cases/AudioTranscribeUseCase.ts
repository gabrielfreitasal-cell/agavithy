import { SnippetEntity } from "../domain/snippet.entity";
import { MediaMetadataEntity } from "../domain/media-metadata.entity";
import type { ISnippetRepository } from "../ports/repositories/ISnippetRepository";
import type { IMediaMetadataRepository } from "../ports/repositories/IMediaMetadataRepository";
import type { IAudioStreamService, AudioStreamOptions } from "../ports/services/IAudioStreamService";
import type { IEnrichmentService } from "../ports/services/IEnrichmentService";

// ─────────────────────────────────────────────────────────────
// USE CASE: AudioTranscribeUseCase
//
// Converts spoken audio into a persisted snippet:
//   1. Record from microphone (or accept a pre-recorded buffer)
//   2. Run transcription through local Whisper/Ollama
//   3. Persist the audio as MediaMetadata
//   4. Create a Snippet with captureMethod = "audio_transcription"
//   5. Optionally run semantic enrichment on the transcribed text
// ─────────────────────────────────────────────────────────────

export interface AudioTranscribeInput {
  /** If "record": start/stop microphone capture, then transcribe.
      If "buffer": transcribe pre-recorded audio passed via audioBuffer. */
  source: "record" | "buffer";

  /** Only used when source = "buffer". */
  audioBuffer?: Buffer;
  audioFormat?: "wav" | "mp3" | "ogg" | "webm";

  /** Recording options (only relevant when source = "record"). */
  recordingOptions?: AudioStreamOptions;

  /** Transcription language hint. E.g. "pt", "en". Auto-detect if omitted. */
  language?: string;

  /** Which Whisper/Ollama model to use. */
  model?: string;

  /** Run enrichment after transcription. Default: true. */
  enrichAfterTranscription?: boolean;

  /** Minimum transcription length (chars) to consider valid. Default: 10. */
  minimumLength?: number;
}

export type AudioTranscribeResult =
  | {
      success: true;
      snippet: SnippetEntity;
      media: MediaMetadataEntity;
      transcription: string;
      language: string;
    }
  | {
      success: false;
      reason:
        | "audio_engine_unavailable"
        | "recording_failed"
        | "transcription_failed"
        | "transcription_too_short"
        | "unknown";
      message: string;
    };

export class AudioTranscribeUseCase {
  constructor(
    private readonly snippetRepo: ISnippetRepository,
    private readonly mediaRepo: IMediaMetadataRepository,
    private readonly audioService: IAudioStreamService,
    private readonly enrichmentService: IEnrichmentService,
  ) {}

  async execute(input: AudioTranscribeInput): Promise<AudioTranscribeResult> {
    const minLength = input.minimumLength ?? 10;

    // ── 1. Ensure audio engine is ready ───────────────────────
    const ready = await this.audioService.isTranscriptionReady();
    if (!ready) {
      return {
        success: false,
        reason: "audio_engine_unavailable",
        message: "Audio transcription engine is not initialized.",
      };
    }

    // ── 2. Obtain audio data ──────────────────────────────────
    let audioBuffer: Buffer;
    let storagePath: string | null = null;
    let durationMs: number | null = null;
    let format: "wav" | "mp3" | "ogg" | "webm" = "wav";

    if (input.source === "record") {
      try {
        const recording = await this.audioService.stopRecording();
        audioBuffer = recording.audioBuffer;
        storagePath = recording.storagePath;
        durationMs = recording.durationMs;
        format = recording.format;
      } catch (err) {
        return {
          success: false,
          reason: "recording_failed",
          message: err instanceof Error ? err.message : "Recording failed.",
        };
      }
    } else {
      if (!input.audioBuffer) {
        return {
          success: false,
          reason: "recording_failed",
          message: "audioBuffer is required when source = 'buffer'.",
        };
      }
      audioBuffer = input.audioBuffer;
      format = input.audioFormat ?? "wav";
    }

    // ── 3. Transcribe ─────────────────────────────────────────
    let transcriptionResult;
    try {
      transcriptionResult = await this.audioService.transcribe(audioBuffer, {
        language: input.language,
        model: input.model,
      });
    } catch (err) {
      return {
        success: false,
        reason: "transcription_failed",
        message: err instanceof Error ? err.message : "Transcription failed.",
      };
    }

    const fullText = transcriptionResult.fullText.trim();
    if (fullText.length < minLength) {
      return {
        success: false,
        reason: "transcription_too_short",
        message: `Transcription is only ${fullText.length} characters — minimum is ${minLength}.`,
      };
    }

    // ── 4. Persist MediaMetadata ──────────────────────────────
    const media = MediaMetadataEntity.create({
      type: "audio",
      storagePath: storagePath ?? `audio-${Date.now()}.${format}`,
      mimeType: `audio/${format}`,
      sizeBytes: audioBuffer.byteLength,
      durationMs,
      transcriptionRaw: fullText,
    });
    media.applyTranscription({
      rawText: transcriptionResult.fullText,
      segments: transcriptionResult.segments,
      language: transcriptionResult.language,
      modelUsed: transcriptionResult.modelUsed,
    });
    const savedMedia = await this.mediaRepo.save(media);

    // ── 5. Create Snippet from transcription ──────────────────
    const snippet = SnippetEntity.create({
      content: fullText,
      captureMethod: "audio_transcription",
      isPinned: false,
      isEnriched: false,
    });
    const savedSnippet = await this.snippetRepo.save(snippet);

    savedMedia.attachToSnippet(savedSnippet.id!);
    await this.mediaRepo.update(savedMedia);

    // ── 6. Optional enrichment ────────────────────────────────
    if (input.enrichAfterTranscription !== false) {
      try {
        const enriched = await this.enrichmentService.enrich({
          content: fullText,
        });
        savedSnippet.markEnriched(
          enriched.modelUsed,
          enriched.title,
          enriched.summary ?? undefined,
        );
        await this.snippetRepo.update(savedSnippet);
      } catch {
        // Best-effort
      }
    }

    return {
      success: true,
      snippet: savedSnippet,
      media: savedMedia,
      transcription: fullText,
      language: transcriptionResult.language,
    };
  }
}
