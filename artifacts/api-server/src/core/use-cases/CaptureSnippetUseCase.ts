import { SnippetEntity, type CaptureMethod } from "../domain/snippet.entity";
import { TagEntity } from "../domain/tag.entity";
import { WindowContextEntity } from "../domain/window-context.entity";
import type { ISnippetRepository } from "../ports/repositories/ISnippetRepository";
import type { ITagRepository } from "../ports/repositories/ITagRepository";
import type { IWindowContextRepository } from "../ports/repositories/IWindowContextRepository";
import type { ISystemProcessMonitor } from "../ports/services/ISystemProcessMonitor";
import type { IEnrichmentService } from "../ports/services/IEnrichmentService";

// ─────────────────────────────────────────────────────────────
// USE CASE: CaptureSnippetUseCase
//
// Orchestrates the full capture pipeline:
//   1. Validate and hash incoming content
//   2. Deduplicate against existing snippets
//   3. Resolve the active OS window context
//   4. Persist the WindowContext
//   5. Create and persist the Snippet entity
//   6. Optionally enqueue async enrichment
//
// This is a pure application service — it holds no I/O itself.
// All I/O happens through the injected port interfaces.
// ─────────────────────────────────────────────────────────────

export interface CaptureSnippetInput {
  content: string;
  captureMethod: CaptureMethod;
  sourceApp?: string;
  sourceUrl?: string;
  tags?: string[];
  /**
   * If true, run enrichment synchronously before returning.
   * Useful for manual captures; clipboard captures should enrich async.
   */
  enrichImmediately?: boolean;
  /** Pre-resolved window info (from ClipboardListener capturing context at copy time). */
  preResolvedWindowContext?: {
    processName: string;
    processId?: number;
    windowTitle?: string;
    executablePath?: string;
    workingDirectory?: string;
    activeUrl?: string;
  };
}

export type CaptureSnippetResult =
  | { success: true; snippet: SnippetEntity; wasDuplicate: false }
  | { success: true; snippet: SnippetEntity; wasDuplicate: true }
  | { success: false; reason: "empty_content" | "content_too_large" | "unknown"; message: string };

export class CaptureSnippetUseCase {
  constructor(
    private readonly snippetRepo: ISnippetRepository,
    private readonly tagRepo: ITagRepository,
    private readonly windowContextRepo: IWindowContextRepository,
    private readonly processMonitor: ISystemProcessMonitor,
    private readonly enrichmentService: IEnrichmentService,
  ) {}

  async execute(input: CaptureSnippetInput): Promise<CaptureSnippetResult> {
    // ── 1. Guard: validate content ─────────────────────────────
    const trimmed = input.content.trim();
    if (trimmed.length === 0) {
      return { success: false, reason: "empty_content", message: "Content must not be empty." };
    }
    if (trimmed.length > 1_000_000) {
      return { success: false, reason: "content_too_large", message: "Content exceeds 1 MB limit." };
    }

    // ── 2. Deduplication check ─────────────────────────────────
    const contentHash = SnippetEntity.hashContent(trimmed);
    const existing = await this.snippetRepo.findByContentHash(contentHash);
    if (existing) {
      return { success: true, snippet: existing, wasDuplicate: true };
    }

    // ── 3. Resolve window context ──────────────────────────────
    let windowContextId: number | null = null;
    let resolvedSourceApp = input.sourceApp ?? null;

    try {
      const rawCtx = input.preResolvedWindowContext
        ? input.preResolvedWindowContext
        : await this.processMonitor.getActiveWindow();

      const ctxEntity = WindowContextEntity.create({
        processName: rawCtx.processName,
        processId: rawCtx.processId,
        windowTitle: rawCtx.windowTitle,
        executablePath: rawCtx.executablePath,
        workingDirectory: rawCtx.workingDirectory,
        activeUrl: rawCtx.activeUrl,
      });

      const savedCtx = await this.windowContextRepo.save(ctxEntity);
      windowContextId = savedCtx.id ?? null;

      // Prefer explicit sourceApp, else derive from window context
      if (!resolvedSourceApp) {
        resolvedSourceApp = ctxEntity.appLabel;
      }
    } catch {
      // Context resolution failure must never block capture
    }

    // ── 4. Language detection (fast heuristic path) ───────────
    const langResult = await this.enrichmentService.detectLanguage(trimmed);

    // ── 5. Build and persist the Snippet entity ───────────────
    const snippet = SnippetEntity.create({
      content: trimmed,
      captureMethod: input.captureMethod,
      sourceApp: resolvedSourceApp,
      sourceUrl: input.sourceUrl ?? null,
      windowContextId,
      language: langResult.language,
      languageConfidence: langResult.confidence,
      isPinned: false,
      isEnriched: false,
    });

    const saved = await this.snippetRepo.save(snippet);

    // ── 6. Persist tags ───────────────────────────────────────
    if (input.tags && input.tags.length > 0 && saved.id !== undefined) {
      const tagEntities = input.tags
        .map((name) => {
          try { return TagEntity.create({ name, source: "manual" }); }
          catch { return null; }
        })
        .filter((t): t is TagEntity => t !== null);

      await this.tagRepo.syncSnippetTags(saved.id, tagEntities, "manual");
    }

    // ── 7. Optional immediate enrichment ─────────────────────
    if (input.enrichImmediately && saved.id !== undefined) {
      try {
        const enriched = await this.enrichmentService.enrich({
          content: trimmed,
          knownLanguage: langResult.language,
          sourceApp: resolvedSourceApp ?? undefined,
        });

        saved.markEnriched(enriched.modelUsed, enriched.title, enriched.summary ?? undefined);

        if (enriched.tags.length > 0) {
          const enrichedTagEntities = enriched.tags
            .map((t) => {
              try { return TagEntity.create({ name: t.name, source: t.source, confidence: t.confidence }); }
              catch { return null; }
            })
            .filter((t): t is TagEntity => t !== null);
          await this.tagRepo.syncSnippetTags(saved.id, enrichedTagEntities, "llm");
        }

        await this.snippetRepo.update(saved);
      } catch {
        // Enrichment failure must never block a successful capture
      }
    }

    return { success: true, snippet: saved, wasDuplicate: false };
  }
}
