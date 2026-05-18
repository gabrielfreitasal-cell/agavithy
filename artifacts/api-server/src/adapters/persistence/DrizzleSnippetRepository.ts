import { db } from "@workspace/db";
import {
  snippetsTable,
  tagsTable,
  snippetTagsTable,
} from "@workspace/db";
import { eq, ilike, inArray, desc, and, sql } from "drizzle-orm";
import { SnippetEntity } from "../../core/domain/snippet.entity";
import type {
  ISnippetRepository,
  SnippetFilter,
  SnippetPage,
  SnippetStats,
} from "../../core/ports/repositories/ISnippetRepository";
import type { CaptureMethod } from "../../core/domain/snippet.entity";

// ─────────────────────────────────────────────────────────────
// ADAPTER: DrizzleSnippetRepository
// Implements ISnippetRepository using Drizzle ORM + PostgreSQL.
// Maps between SnippetEntity (domain) ↔ Drizzle rows (infra).
// ─────────────────────────────────────────────────────────────

export class DrizzleSnippetRepository implements ISnippetRepository {

  // ── Persistence ───────────────────────────────────────────────

  async save(snippet: SnippetEntity): Promise<SnippetEntity> {
    const [row] = await db
      .insert(snippetsTable)
      .values({
        title: snippet.title,
        content: snippet.content,
        language: snippet.language,
        languageConfidence: snippet.languageConfidence,
        sourceApp: snippet.sourceApp,
        sourceUrl: snippet.sourceUrl,
        windowContextId: snippet.windowContextId,
        captureMethod: snippet.captureMethod,
        isPinned: snippet.isPinned,
        isEnriched: snippet.isEnriched,
        enrichmentModel: snippet.enrichmentModel,
        llmSummary: snippet.llmSummary,
        contentHash: snippet.contentHash,
      })
      .returning();
    return this._toEntity(row, []);
  }

  async update(snippet: SnippetEntity): Promise<SnippetEntity> {
    const [row] = await db
      .update(snippetsTable)
      .set({
        title: snippet.title,
        content: snippet.content,
        language: snippet.language,
        languageConfidence: snippet.languageConfidence,
        sourceApp: snippet.sourceApp,
        sourceUrl: snippet.sourceUrl,
        windowContextId: snippet.windowContextId,
        captureMethod: snippet.captureMethod,
        isPinned: snippet.isPinned,
        isEnriched: snippet.isEnriched,
        enrichmentModel: snippet.enrichmentModel,
        llmSummary: snippet.llmSummary,
        contentHash: snippet.contentHash,
        updatedAt: new Date(),
      })
      .where(eq(snippetsTable.id, snippet.id!))
      .returning();
    const tags = await this._fetchTags(row.id);
    return this._toEntity(row, tags);
  }

  async delete(id: number): Promise<void> {
    await db.delete(snippetsTable).where(eq(snippetsTable.id, id));
  }

  // ── Queries ───────────────────────────────────────────────────

  async findById(id: number): Promise<SnippetEntity | null> {
    const [row] = await db
      .select()
      .from(snippetsTable)
      .where(eq(snippetsTable.id, id))
      .limit(1);
    if (!row) return null;
    const tags = await this._fetchTags(id);
    return this._toEntity(row, tags);
  }

  async findMany(
    filter: SnippetFilter,
    limit: number,
    offset: number,
  ): Promise<SnippetPage> {
    let tagSnippetIds: number[] | null = null;

    if (filter.tag) {
      const [tagRow] = await db
        .select()
        .from(tagsTable)
        .where(eq(tagsTable.name, filter.tag.toLowerCase()))
        .limit(1);
      if (tagRow) {
        const rows = await db
          .select({ snippetId: snippetTagsTable.snippetId })
          .from(snippetTagsTable)
          .where(eq(snippetTagsTable.tagId, tagRow.id));
        tagSnippetIds = rows.map((r) => r.snippetId);
      } else {
        tagSnippetIds = [];
      }
    }

    if (tagSnippetIds?.length === 0) {
      return { items: [], total: 0, limit, offset };
    }

    const conditions = [];
    if (filter.language) conditions.push(eq(snippetsTable.language, filter.language));
    if (filter.sourceApp) conditions.push(eq(snippetsTable.sourceApp, filter.sourceApp));
    if (filter.isPinned !== undefined) conditions.push(eq(snippetsTable.isPinned, filter.isPinned));
    if (filter.isEnriched !== undefined) conditions.push(eq(snippetsTable.isEnriched, filter.isEnriched));
    if (filter.captureMethod) conditions.push(eq(snippetsTable.captureMethod, filter.captureMethod));
    if (filter.search) conditions.push(ilike(snippetsTable.content, `%${filter.search}%`));
    if (tagSnippetIds) conditions.push(inArray(snippetsTable.id, tagSnippetIds));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(snippetsTable)
      .where(where);

    const rows = await db
      .select()
      .from(snippetsTable)
      .where(where)
      .orderBy(desc(snippetsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const items = await Promise.all(
      rows.map(async (r) => {
        const tags = await this._fetchTags(r.id);
        return this._toEntity(r, tags);
      }),
    );

    return { items, total: countRow?.count ?? 0, limit, offset };
  }

  async findRecent(limit: number): Promise<SnippetEntity[]> {
    const rows = await db
      .select()
      .from(snippetsTable)
      .orderBy(desc(snippetsTable.createdAt))
      .limit(limit);
    return Promise.all(
      rows.map(async (r) => this._toEntity(r, await this._fetchTags(r.id))),
    );
  }

  async findPinned(): Promise<SnippetEntity[]> {
    const rows = await db
      .select()
      .from(snippetsTable)
      .where(eq(snippetsTable.isPinned, true))
      .orderBy(desc(snippetsTable.updatedAt));
    return Promise.all(
      rows.map(async (r) => this._toEntity(r, await this._fetchTags(r.id))),
    );
  }

  async findByContentHash(hash: string): Promise<SnippetEntity | null> {
    const [row] = await db
      .select()
      .from(snippetsTable)
      .where(eq(snippetsTable.contentHash, hash))
      .limit(1);
    if (!row) return null;
    const tags = await this._fetchTags(row.id);
    return this._toEntity(row, tags);
  }

  async getStats(): Promise<SnippetStats> {
    const [totalRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(snippetsTable);
    const [pinnedRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(snippetsTable)
      .where(eq(snippetsTable.isPinned, true));
    const [enrichedRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(snippetsTable)
      .where(eq(snippetsTable.isEnriched, true));

    const byLanguage = await db
      .select({
        label: snippetsTable.language,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(snippetsTable)
      .where(sql`${snippetsTable.language} is not null`)
      .groupBy(snippetsTable.language)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const bySourceApp = await db
      .select({
        label: snippetsTable.sourceApp,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(snippetsTable)
      .where(sql`${snippetsTable.sourceApp} is not null`)
      .groupBy(snippetsTable.sourceApp)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const byTag = await db
      .select({
        label: tagsTable.name,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(snippetTagsTable)
      .innerJoin(tagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
      .groupBy(tagsTable.name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      total: totalRow?.count ?? 0,
      pinned: pinnedRow?.count ?? 0,
      enriched: enrichedRow?.count ?? 0,
      byLanguage: byLanguage.map((r) => ({ label: r.label ?? "Unknown", count: r.count })),
      bySourceApp: bySourceApp.map((r) => ({ label: r.label ?? "Unknown", count: r.count })),
      byTag: byTag.map((r) => ({ label: r.label, count: r.count })),
    };
  }

  // ── Mapping ───────────────────────────────────────────────────

  private _toEntity(
    row: typeof snippetsTable.$inferSelect,
    tags: string[],
  ): SnippetEntity {
    return SnippetEntity.reconstitute({
      id: row.id,
      title: row.title,
      content: row.content,
      language: row.language,
      languageConfidence: row.languageConfidence,
      sourceApp: row.sourceApp,
      sourceUrl: row.sourceUrl,
      windowContextId: row.windowContextId,
      captureMethod: (row.captureMethod as CaptureMethod) ?? "manual",
      isPinned: row.isPinned,
      isEnriched: row.isEnriched,
      enrichmentModel: row.enrichmentModel,
      llmSummary: row.llmSummary,
      contentHash: row.contentHash ?? SnippetEntity.hashContent(row.content),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tags,
    });
  }

  private async _fetchTags(snippetId: number): Promise<string[]> {
    const rows = await db
      .select({ name: tagsTable.name })
      .from(snippetTagsTable)
      .innerJoin(tagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
      .where(eq(snippetTagsTable.snippetId, snippetId));
    return rows.map((r) => r.name);
  }
}
