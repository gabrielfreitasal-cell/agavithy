import { db } from "@workspace/db";
import { tagsTable, snippetTagsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { TagEntity } from "../../core/domain/tag.entity";
import type { ITagRepository, TagWithCount } from "../../core/ports/repositories/ITagRepository";
import type { TagSource } from "../../core/domain/tag.entity";

// ─────────────────────────────────────────────────────────────
// ADAPTER: DrizzleTagRepository
// Implements ITagRepository using Drizzle ORM + PostgreSQL.
// ─────────────────────────────────────────────────────────────

export class DrizzleTagRepository implements ITagRepository {

  async upsert(tag: TagEntity): Promise<TagEntity> {
    const existing = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, tag.name))
      .limit(1);

    if (existing[0]) {
      return this._toEntity(existing[0]);
    }

    const [row] = await db
      .insert(tagsTable)
      .values({
        name: tag.name,
        source: tag.source,
        confidence: tag.confidence,
      })
      .returning();

    return this._toEntity(row);
  }

  async syncSnippetTags(
    snippetId: number,
    tags: TagEntity[],
    addedBy: "manual" | "llm" | "heuristic" = "manual",
  ): Promise<void> {
    await db
      .delete(snippetTagsTable)
      .where(eq(snippetTagsTable.snippetId, snippetId));

    if (tags.length === 0) return;

    const persisted = await Promise.all(tags.map((t) => this.upsert(t)));

    await db.insert(snippetTagsTable).values(
      persisted
        .filter((t) => t.id !== undefined)
        .map((t) => ({
          snippetId,
          tagId: t.id!,
          addedBy,
        })),
    );
  }

  async clearSnippetTags(snippetId: number): Promise<void> {
    await db
      .delete(snippetTagsTable)
      .where(eq(snippetTagsTable.snippetId, snippetId));
  }

  async findBySnippetId(snippetId: number): Promise<TagEntity[]> {
    const rows = await db
      .select({ tag: tagsTable })
      .from(snippetTagsTable)
      .innerJoin(tagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
      .where(eq(snippetTagsTable.snippetId, snippetId));
    return rows.map((r) => this._toEntity(r.tag));
  }

  async findAllWithCounts(): Promise<TagWithCount[]> {
    const rows = await db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        source: tagsTable.source,
        confidence: tagsTable.confidence,
        createdAt: tagsTable.createdAt,
        count: sql<number>`cast(count(${snippetTagsTable.id}) as int)`,
      })
      .from(tagsTable)
      .leftJoin(snippetTagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
      .groupBy(tagsTable.id, tagsTable.name, tagsTable.source, tagsTable.confidence, tagsTable.createdAt)
      .orderBy(desc(sql`count(${snippetTagsTable.id})`));

    return rows.map((r) => {
      const entity = this._toEntity(r);
      const withCount = entity as TagWithCount;
      (withCount as { count: number }).count = r.count;
      return withCount;
    });
  }

  async findByName(name: string): Promise<TagEntity | null> {
    const [row] = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, TagEntity.normalize(name)))
      .limit(1);
    return row ? this._toEntity(row) : null;
  }

  async pruneOrphans(): Promise<number> {
    const orphans = await db
      .select({ id: tagsTable.id })
      .from(tagsTable)
      .leftJoin(snippetTagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
      .where(sql`${snippetTagsTable.id} is null`);

    if (orphans.length === 0) return 0;

    const ids = orphans.map((o) => o.id);
    await db.delete(tagsTable).where(
      sql`${tagsTable.id} = any(${sql.raw(`array[${ids.join(",")}]`)})`,
    );
    return ids.length;
  }

  private _toEntity(row: typeof tagsTable.$inferSelect): TagEntity {
    return TagEntity.reconstitute({
      id: row.id,
      name: row.name,
      source: (row.source as TagSource) ?? "manual",
      confidence: row.confidence,
      createdAt: row.createdAt,
    });
  }
}
