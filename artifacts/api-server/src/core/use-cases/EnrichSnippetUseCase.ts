import { TagEntity } from "../domain/tag.entity";
import type { SnippetEntity } from "../domain/snippet.entity";
import type { ISnippetRepository } from "../ports/repositories/ISnippetRepository";
import type { ITagRepository } from "../ports/repositories/ITagRepository";
import type { IEnrichmentService } from "../ports/services/IEnrichmentService";

// ─────────────────────────────────────────────────────────────
// USE CASE: EnrichSnippetUseCase
//
// Triggers the semantic enrichment pipeline for a single snippet:
//   1. Load the snippet from the repository
//   2. Send content to the LLM (via IEnrichmentService)
//   3. Apply the returned title, language, tags, and summary
//   4. Persist the enriched entity
//
// Idempotent: re-enriching an already-enriched snippet is allowed
// and will overwrite previous enrichment data.
// ─────────────────────────────────────────────────────────────

export interface EnrichSnippetInput {
  snippetId: number;
  /** Override the default model. Optional. */
  model?: string;
  /** If true, skip LLM and run heuristics only. */
  heuristicOnly?: boolean;
}

export type EnrichSnippetResult =
  | { success: true; snippet: SnippetEntity; source: "llm" | "heuristic" }
  | { success: false; reason: "not_found" | "llm_unavailable" | "unknown"; message: string };

export class EnrichSnippetUseCase {
  constructor(
    private readonly snippetRepo: ISnippetRepository,
    private readonly tagRepo: ITagRepository,
    private readonly enrichmentService: IEnrichmentService,
  ) {}

  async execute(input: EnrichSnippetInput): Promise<EnrichSnippetResult> {
    // ── 1. Load snippet ───────────────────────────────────────
    const snippet = await this.snippetRepo.findById(input.snippetId);
    if (!snippet) {
      return {
        success: false,
        reason: "not_found",
        message: `Snippet #${input.snippetId} does not exist.`,
      };
    }

    // ── 2. Run enrichment pipeline ────────────────────────────
    let enrichmentOutput;
    try {
      enrichmentOutput = await this.enrichmentService.enrich({
        content: snippet.content,
        knownLanguage: snippet.language ?? undefined,
        sourceApp: snippet.sourceApp ?? undefined,
        model: input.model,
        maxTokens: 512,
      });
    } catch (err) {
      return {
        success: false,
        reason: "llm_unavailable",
        message: err instanceof Error ? err.message : "Enrichment service failed.",
      };
    }

    // ── 3. Apply results to entity ────────────────────────────
    snippet.markEnriched(
      enrichmentOutput.modelUsed,
      enrichmentOutput.title,
      enrichmentOutput.summary ?? undefined,
    );
    snippet.applyLanguageDetection({
      language: enrichmentOutput.language,
      confidence: enrichmentOutput.languageConfidence,
      source: enrichmentOutput.source === "llm" ? "llm" : "heuristic",
    });

    // ── 4. Persist updated snippet ────────────────────────────
    const updated = await this.snippetRepo.update(snippet);

    // ── 5. Sync enriched tags ─────────────────────────────────
    if (enrichmentOutput.tags.length > 0 && updated.id !== undefined) {
      const tagEntities = enrichmentOutput.tags
        .map((t) => {
          try {
            return TagEntity.create({
              name: t.name,
              source: t.source,
              confidence: t.confidence,
            });
          } catch {
            return null;
          }
        })
        .filter((t): t is TagEntity => t !== null);

      await this.tagRepo.syncSnippetTags(
        updated.id,
        tagEntities,
        enrichmentOutput.source === "llm" ? "llm" : "heuristic",
      );
    }

    return {
      success: true,
      snippet: updated,
      source: enrichmentOutput.source === "llm" ? "llm" : "heuristic",
    };
  }
}
