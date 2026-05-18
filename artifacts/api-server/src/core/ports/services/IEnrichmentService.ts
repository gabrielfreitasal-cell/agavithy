// ─────────────────────────────────────────────────────────────
// PORT: IEnrichmentService
//
// Outbound port for the semantic enrichment pipeline.
// Sends snippet content to a local LLM (Ollama) and receives
// structured metadata back: title, tags, language, summary.
//
// Falls back gracefully to heuristic analysis when the LLM
// is unavailable — the Core is never blocked by LLM absence.
// ─────────────────────────────────────────────────────────────

export type EnrichmentSource = "llm" | "heuristic" | "hybrid";

export interface EnrichmentInput {
  /** The raw snippet content to analyze. */
  content: string;

  /** Known language (if already detected) — hints to the LLM. */
  knownLanguage?: string;

  /** Source application — additional context for the LLM. */
  sourceApp?: string;

  /**
   * Max tokens for the LLM response.
   * Lower = faster; higher = more thorough. Default: 256.
   */
  maxTokens?: number;

  /** Which Ollama model to use. Falls back to default if unset. */
  model?: string;
}

export interface EnrichmentOutput {
  /** Short, descriptive title. Max 80 characters. */
  title: string;

  /** Detected programming language. Lowercase. e.g. "typescript" */
  language: string;

  /** Confidence score for the language detection. 0–1. */
  languageConfidence: number;

  /** 2–5 auto-generated tags. Lowercase, normalized. */
  tags: Array<{
    name: string;
    confidence: number;
    source: "llm" | "heuristic";
  }>;

  /** Optional one-sentence description of what the snippet does. */
  summary: string | null;

  /** Which engine produced this output. */
  source: EnrichmentSource;

  /** The model identifier used (e.g. "llama3.2", "heuristic-v1"). */
  modelUsed: string;

  /** How long the enrichment took in milliseconds. */
  processingTimeMs: number;
}

export interface EnrichmentServiceStatus {
  isAvailable: boolean;
  modelLoaded: string | null;    // currently loaded model name, or null
  defaultModel: string;
  endpoint: string;              // e.g. "http://localhost:11434"
  lastPingMs: number | null;     // round-trip time of last health check
}

export interface IEnrichmentService {
  /**
   * Run the full enrichment pipeline on a snippet.
   * Always returns a result — falls back to heuristics if LLM fails.
   */
  enrich(input: EnrichmentInput): Promise<EnrichmentOutput>;

  /**
   * Run only language detection (faster than full enrichment).
   */
  detectLanguage(content: string): Promise<{
    language: string;
    confidence: number;
    source: EnrichmentSource;
  }>;

  /**
   * Generate only tags for a snippet (skip title/summary generation).
   */
  generateTags(
    content: string,
    language?: string
  ): Promise<EnrichmentOutput["tags"]>;

  /**
   * Check whether the LLM backend (Ollama) is reachable and a model
   * is loaded. Does not throw — returns status object.
   */
  getStatus(): Promise<EnrichmentServiceStatus>;

  /**
   * Pull/load a specific model into Ollama.
   * No-op if the model is already loaded.
   * Rejects with an error if Ollama is unreachable.
   */
  ensureModel(modelName: string): Promise<void>;
}
