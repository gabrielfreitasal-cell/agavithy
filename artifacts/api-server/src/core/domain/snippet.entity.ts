import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// VALUE OBJECTS
// Primitive wrappers with business-rule enforcement.
// ─────────────────────────────────────────────────────────────

export type CaptureMethod =
  | "clipboard"
  | "manual"
  | "ocr"
  | "audio_transcription";

export type SnippetLanguage = string; // e.g. "typescript", "python", "plaintext"

export interface LanguageDetectionResult {
  language: SnippetLanguage;
  confidence: number; // 0–1
  source: "heuristic" | "llm";
}

// ─────────────────────────────────────────────────────────────
// ENTITY
// Represents a captured code/text snippet.
// All business rules live here, not in the DB layer.
// ─────────────────────────────────────────────────────────────

export interface SnippetProps {
  id?: number;
  title?: string | null;
  content: string;
  language?: string | null;
  languageConfidence?: number | null;
  sourceApp?: string | null;
  sourceUrl?: string | null;
  windowContextId?: number | null;
  captureMethod: CaptureMethod;
  isPinned: boolean;
  isEnriched: boolean;
  enrichmentModel?: string | null;
  llmSummary?: string | null;
  contentHash?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  tags?: string[];
}

export class SnippetEntity {
  readonly id?: number;
  title: string | null;
  content: string;
  language: string | null;
  languageConfidence: number | null;
  sourceApp: string | null;
  sourceUrl: string | null;
  windowContextId: number | null;
  captureMethod: CaptureMethod;
  isPinned: boolean;
  isEnriched: boolean;
  enrichmentModel: string | null;
  llmSummary: string | null;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];

  private constructor(props: SnippetProps) {
    this.id = props.id;
    this.title = props.title ?? null;
    this.content = props.content;
    this.language = props.language ?? null;
    this.languageConfidence = props.languageConfidence ?? null;
    this.sourceApp = props.sourceApp ?? null;
    this.sourceUrl = props.sourceUrl ?? null;
    this.windowContextId = props.windowContextId ?? null;
    this.captureMethod = props.captureMethod;
    this.isPinned = props.isPinned;
    this.isEnriched = props.isEnriched;
    this.enrichmentModel = props.enrichmentModel ?? null;
    this.llmSummary = props.llmSummary ?? null;
    this.contentHash = props.contentHash ?? SnippetEntity.hashContent(props.content);
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.tags = props.tags ?? [];
  }

  // ── Factory ──────────────────────────────────────────────────

  static create(props: Omit<SnippetProps, "contentHash">): SnippetEntity {
    if (!props.content || props.content.trim().length === 0) {
      throw new Error("SnippetEntity: content must not be empty");
    }
    if (props.content.length > 1_000_000) {
      throw new Error("SnippetEntity: content exceeds 1 MB limit");
    }
    return new SnippetEntity(props);
  }

  static reconstitute(props: Required<SnippetProps>): SnippetEntity {
    return new SnippetEntity(props);
  }

  // ── Business rules ───────────────────────────────────────────

  static hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  isDuplicate(other: SnippetEntity): boolean {
    return this.contentHash === other.contentHash;
  }

  pin(): void {
    this.isPinned = true;
    this.updatedAt = new Date();
  }

  unpin(): void {
    this.isPinned = false;
    this.updatedAt = new Date();
  }

  togglePin(): void {
    this.isPinned ? this.unpin() : this.pin();
  }

  markEnriched(model: string, title?: string, summary?: string): void {
    this.isEnriched = true;
    this.enrichmentModel = model;
    if (title) this.title = title;
    if (summary) this.llmSummary = summary;
    this.updatedAt = new Date();
  }

  applyLanguageDetection(result: LanguageDetectionResult): void {
    this.language = result.language;
    this.languageConfidence = result.confidence;
    this.updatedAt = new Date();
  }

  isCode(): boolean {
    const codeLanguages = [
      "typescript", "javascript", "python", "rust", "go",
      "java", "csharp", "cpp", "c", "php", "ruby", "swift",
      "kotlin", "sql", "bash", "shell", "html", "css",
    ];
    return codeLanguages.includes(this.language ?? "");
  }

  get wordCount(): number {
    return this.content.split(/\s+/).filter(Boolean).length;
  }

  get lineCount(): number {
    return this.content.split("\n").length;
  }
}
