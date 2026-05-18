import type {
  IEnrichmentService,
  EnrichmentInput,
  EnrichmentOutput,
  EnrichmentServiceStatus,
} from "../../core/ports/services/IEnrichmentService";
import { logger } from "../../lib/logger";

// ─────────────────────────────────────────────────────────────
// ADAPTER: OllamaEnrichmentAdapter
//
// Implements IEnrichmentService by calling the local Ollama API.
// Falls back to heuristic analysis transparently when Ollama
// is unreachable or returns a malformed response.
//
// Ollama API: http://localhost:11434  (no auth, fully local)
// Default model: llama3.2
// ─────────────────────────────────────────────────────────────

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const REQUEST_TIMEOUT_MS = 15_000;

export class OllamaEnrichmentAdapter implements IEnrichmentService {

  async enrich(input: EnrichmentInput): Promise<EnrichmentOutput> {
    const start = Date.now();
    const model = input.model ?? DEFAULT_MODEL;

    const prompt = this._buildPrompt(input);

    try {
      const response = await fetch(`${OLLAMA_ENDPOINT}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Ollama responded ${response.status}`);
      }

      const data = (await response.json()) as { response: string };
      const parsed = this._parseOllamaResponse(data.response);

      return {
        title: parsed.title ?? this._heuristicTitle(input.content),
        language: parsed.language ?? this._heuristicLanguage(input.content),
        languageConfidence: parsed.language ? 0.92 : 0.55,
        tags: (parsed.tags ?? []).slice(0, 5).map((name: string) => ({
          name: name.toLowerCase().trim(),
          confidence: 0.88,
          source: "llm" as const,
        })),
        summary: parsed.summary ?? null,
        source: "llm",
        modelUsed: model,
        processingTimeMs: Date.now() - start,
      };
    } catch (err) {
      logger.warn(
        { err, model },
        "OllamaEnrichmentAdapter: LLM unavailable — falling back to heuristics",
      );
      return this._heuristicFallback(input, Date.now() - start);
    }
  }

  async detectLanguage(content: string): Promise<{
    language: string;
    confidence: number;
    source: "llm" | "heuristic";
  }> {
    // Fast path: always use heuristic for language detection (no LLM round-trip)
    return {
      language: this._heuristicLanguage(content),
      confidence: 0.75,
      source: "heuristic",
    };
  }

  async generateTags(
    content: string,
    language?: string,
  ): Promise<EnrichmentOutput["tags"]> {
    const result = await this.enrich({ content, knownLanguage: language, maxTokens: 128 });
    return result.tags;
  }

  async getStatus(): Promise<EnrichmentServiceStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${OLLAMA_ENDPOINT}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = data.models ?? [];
      const loaded = models.find((m) => m.name.startsWith(DEFAULT_MODEL));
      return {
        isAvailable: true,
        modelLoaded: loaded?.name ?? null,
        defaultModel: DEFAULT_MODEL,
        endpoint: OLLAMA_ENDPOINT,
        lastPingMs: Date.now() - start,
      };
    } catch {
      return {
        isAvailable: false,
        modelLoaded: null,
        defaultModel: DEFAULT_MODEL,
        endpoint: OLLAMA_ENDPOINT,
        lastPingMs: null,
      };
    }
  }

  async ensureModel(modelName: string): Promise<void> {
    const res = await fetch(`${OLLAMA_ENDPOINT}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`ensureModel: Ollama pull failed with status ${res.status}`);
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  private _buildPrompt(input: EnrichmentInput): string {
    const ctx = input.sourceApp ? `\nSource application: ${input.sourceApp}` : "";
    const hint = input.knownLanguage ? `\nDetected language (hint): ${input.knownLanguage}` : "";
    return `Analyze the following code snippet and return ONLY a valid JSON object with these fields:
- "title": a short descriptive title (max 60 characters)
- "language": the programming language in lowercase (e.g. "typescript", "python", "sql")
- "tags": an array of 2 to 5 relevant lowercase tags (e.g. ["async", "http", "retry"])
- "summary": one sentence describing what this snippet does${ctx}${hint}

Code snippet:
\`\`\`
${input.content.slice(0, 2000)}
\`\`\`

Return ONLY the JSON object. No markdown fences, no explanation.`;
  }

  private _parseOllamaResponse(raw: string): {
    title?: string;
    language?: string;
    tags?: string[];
    summary?: string;
  } {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return {};
      return JSON.parse(match[0]) as {
        title?: string;
        language?: string;
        tags?: string[];
        summary?: string;
      };
    } catch {
      return {};
    }
  }

  private _heuristicFallback(input: EnrichmentInput, elapsedMs: number): EnrichmentOutput {
    const language = input.knownLanguage ?? this._heuristicLanguage(input.content);
    return {
      title: this._heuristicTitle(input.content),
      language,
      languageConfidence: 0.6,
      tags: this._heuristicTags(input.content, language),
      summary: null,
      source: "heuristic",
      modelUsed: "heuristic-v1",
      processingTimeMs: elapsedMs,
    };
  }

  private _heuristicTitle(content: string): string {
    const firstLine = content.split("\n")[0].trim().slice(0, 60);
    return firstLine || "Untitled Snippet";
  }

  private _heuristicLanguage(content: string): string {
    if (/^\s*(import|export|const|let|var|function|class|interface|type)\s/.test(content)) {
      return /:\s*(string|number|boolean|void|any)\b/.test(content)
        ? "typescript"
        : "javascript";
    }
    if (/^\s*(def |class |import |from .+ import)/.test(content)) return "python";
    if (/^\s*(fn |use |let mut |impl |struct |enum )/.test(content)) return "rust";
    if (/^\s*(func |package |import )/.test(content)) return "go";
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(content)) return "sql";
    if (/^\s*(#!\/bin\/bash|echo |grep |awk |sed )/.test(content)) return "bash";
    if (/^\s*(<\?php|namespace |echo |use )/.test(content)) return "php";
    if (/<[a-z][^>]*>/.test(content) && /<\/[a-z]/.test(content)) return "html";
    if (/^\s*(\{|\[)/.test(content)) return "json";
    return "plaintext";
  }

  private _heuristicTags(content: string, language: string): EnrichmentOutput["tags"] {
    const tags: string[] = [language];
    if (/async|await|Promise/.test(content)) tags.push("async");
    if (/class |extends |implements/.test(content)) tags.push("oop");
    if (/SELECT|JOIN|WHERE/i.test(content)) tags.push("sql");
    if (/test|describe|it\(|expect\(/.test(content)) tags.push("testing");
    if (/fetch|axios|http|request/i.test(content)) tags.push("http");
    return tags.slice(0, 5).map((name) => ({
      name,
      confidence: 0.65,
      source: "heuristic" as const,
    }));
  }
}
