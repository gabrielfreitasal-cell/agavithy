// ─────────────────────────────────────────────────────────────
// VALUE OBJECTS
// ─────────────────────────────────────────────────────────────

export type MediaType = "screenshot" | "audio" | "video";

export type MimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "audio/wav"
  | "audio/mp3"
  | "audio/ogg"
  | "video/mp4"
  | "video/webm"
  | string; // extensible

export interface OCRResult {
  rawText: string;
  confidence: number; // 0–1 from Tesseract
  cleanedText: string;
  detectedLanguage?: string;
  boundingBoxes?: Array<{
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    confidence: number;
  }>;
}

export interface TranscriptionResult {
  rawText: string;
  segments: Array<{
    start: number;   // ms
    end: number;     // ms
    text: string;
    confidence: number;
  }>;
  language?: string;
  modelUsed: string;
}

export interface MediaMetadataProps {
  id?: number;
  snippetId?: number | null;
  type: MediaType;
  storagePath: string;
  mimeType: MimeType;
  sizeBytes?: number | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  ocrRawText?: string | null;
  ocrConfidence?: number | null;
  transcriptionRaw?: string | null;
  metadata?: Record<string, unknown> | null;
  capturedAt?: Date;
}

// ─────────────────────────────────────────────────────────────
// ENTITY
// Represents media evidence attached to a snippet —
// a screenshot (OCR source), audio clip (transcription),
// or video recording.
// ─────────────────────────────────────────────────────────────

export class MediaMetadataEntity {
  readonly id?: number;
  snippetId: number | null;
  readonly type: MediaType;
  readonly storagePath: string;
  readonly mimeType: MimeType;
  readonly sizeBytes: number | null;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
  ocrRawText: string | null;
  ocrConfidence: number | null;
  transcriptionRaw: string | null;
  readonly metadata: Record<string, unknown>;
  readonly capturedAt: Date;

  private constructor(props: MediaMetadataProps) {
    this.id = props.id;
    this.snippetId = props.snippetId ?? null;
    this.type = props.type;
    this.storagePath = props.storagePath;
    this.mimeType = props.mimeType;
    this.sizeBytes = props.sizeBytes ?? null;
    this.durationMs = props.durationMs ?? null;
    this.width = props.width ?? null;
    this.height = props.height ?? null;
    this.ocrRawText = props.ocrRawText ?? null;
    this.ocrConfidence = props.ocrConfidence ?? null;
    this.transcriptionRaw = props.transcriptionRaw ?? null;
    this.metadata = props.metadata ?? {};
    this.capturedAt = props.capturedAt ?? new Date();
  }

  // ── Factory ──────────────────────────────────────────────────

  static create(props: MediaMetadataProps): MediaMetadataEntity {
    if (!props.storagePath) {
      throw new Error("MediaMetadataEntity: storagePath is required");
    }
    if (!["screenshot", "audio", "video"].includes(props.type)) {
      throw new Error(`MediaMetadataEntity: invalid type "${props.type}"`);
    }
    if (props.ocrConfidence !== undefined && props.ocrConfidence !== null) {
      if (props.ocrConfidence < 0 || props.ocrConfidence > 1) {
        throw new Error("MediaMetadataEntity: ocrConfidence must be 0–1");
      }
    }
    return new MediaMetadataEntity(props);
  }

  static reconstitute(props: Required<MediaMetadataProps>): MediaMetadataEntity {
    return new MediaMetadataEntity(props);
  }

  // ── Business rules ───────────────────────────────────────────

  applyOCRResult(result: OCRResult): void {
    this.ocrRawText = result.rawText;
    this.ocrConfidence = result.confidence;
  }

  applyTranscription(result: TranscriptionResult): void {
    this.transcriptionRaw = result.rawText;
  }

  attachToSnippet(snippetId: number): void {
    this.snippetId = snippetId;
  }

  isScreenshot(): boolean {
    return this.type === "screenshot";
  }

  isAudio(): boolean {
    return this.type === "audio";
  }

  hasOCR(): boolean {
    return this.ocrRawText !== null && this.ocrRawText.trim().length > 0;
  }

  hasTranscription(): boolean {
    return this.transcriptionRaw !== null && this.transcriptionRaw.trim().length > 0;
  }

  get ocrIsReliable(): boolean {
    return (this.ocrConfidence ?? 0) >= 0.75;
  }

  get fileSizeLabel(): string {
    if (!this.sizeBytes) return "unknown";
    if (this.sizeBytes < 1024) return `${this.sizeBytes} B`;
    if (this.sizeBytes < 1024 * 1024) return `${(this.sizeBytes / 1024).toFixed(1)} KB`;
    return `${(this.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
