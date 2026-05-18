import { Router } from "express";
import { db } from "@workspace/db";
import {
  snippetsTable,
  tagsTable,
  snippetTagsTable,
} from "@workspace/db";
import { eq, ilike, inArray, desc, and, sql } from "drizzle-orm";
import {
  ListSnippetsQueryParams,
  CreateSnippetBody,
  GetSnippetParams,
  UpdateSnippetParams,
  UpdateSnippetBody,
  DeleteSnippetParams,
  ToggleSnippetPinParams,
  EnrichSnippetParams,
  ListRecentSnippetsQueryParams,
} from "@workspace/api-zod";
import {
  captureSnippetUseCase,
  enrichSnippetUseCase,
} from "../container";

const router = Router();

// ── Shared helper: fetch a persisted snippet with its tags ────

async function getSnippetWithTags(id: number) {
  const [snippet] = await db
    .select()
    .from(snippetsTable)
    .where(eq(snippetsTable.id, id))
    .limit(1);
  if (!snippet) return null;

  const tagRows = await db
    .select({ name: tagsTable.name })
    .from(snippetTagsTable)
    .innerJoin(tagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
    .where(eq(snippetTagsTable.snippetId, id));

  return {
    ...snippet,
    tags: tagRows.map((t) => t.name),
    createdAt: snippet.createdAt.toISOString(),
    updatedAt: snippet.updatedAt.toISOString(),
  };
}

async function upsertTags(tagNames: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of tagNames) {
    const [existing] = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, name.toLowerCase().trim()))
      .limit(1);
    if (existing) {
      ids.push(existing.id);
    } else {
      const [inserted] = await db
        .insert(tagsTable)
        .values({ name: name.toLowerCase().trim() })
        .returning();
      ids.push(inserted.id);
    }
  }
  return ids;
}

async function syncSnippetTags(snippetId: number, tagNames: string[]) {
  await db.delete(snippetTagsTable).where(eq(snippetTagsTable.snippetId, snippetId));
  const tagIds = await upsertTags(tagNames);
  if (tagIds.length > 0) {
    await db
      .insert(snippetTagsTable)
      .values(tagIds.map((tagId) => ({ snippetId, tagId })));
  }
}

// ── List ──────────────────────────────────────────────────────

router.get("/snippets", async (req, res) => {
  const parsed = ListSnippetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { language, tag, search, source_app, pinned, limit = 50, offset = 0 } = parsed.data;

  let tagSnippetIds: number[] | null = null;
  if (tag) {
    const [tagRow] = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, tag.toLowerCase()))
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

  const conditions = [];
  if (language) conditions.push(eq(snippetsTable.language, language));
  if (source_app) conditions.push(eq(snippetsTable.sourceApp, source_app));
  if (pinned !== undefined) conditions.push(eq(snippetsTable.isPinned, pinned));
  if (search) conditions.push(ilike(snippetsTable.content, `%${search}%`));
  if (tagSnippetIds !== null) {
    if (tagSnippetIds.length === 0) { res.json([]); return; }
    conditions.push(inArray(snippetsTable.id, tagSnippetIds));
  }

  const rows = await db
    .select()
    .from(snippetsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(snippetsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const withTags = await Promise.all(rows.map((s) => getSnippetWithTags(s.id)));
  res.json(withTags.filter(Boolean));
});

// ── Create — routed through CaptureSnippetUseCase ─────────────

router.post("/snippets", async (req, res) => {
  const parsed = CreateSnippetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { tags = [], content, sourceApp, sourceUrl } = parsed.data;

  const result = await captureSnippetUseCase.execute({
    content,
    captureMethod: "manual",
    sourceApp: sourceApp ?? undefined,
    sourceUrl: sourceUrl ?? undefined,
    tags,
    enrichImmediately: false,
  });

  if (!result.success) {
    res.status(400).json({ error: result.message });
    return;
  }

  const snippet = await getSnippetWithTags(result.snippet.id!);
  res.status(result.wasDuplicate ? 200 : 201).json(snippet);
});

// ── Stats ─────────────────────────────────────────────────────

router.get("/snippets/stats", async (_req, res) => {
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
    .select({ label: snippetsTable.language, count: sql<number>`cast(count(*) as int)` })
    .from(snippetsTable)
    .where(sql`${snippetsTable.language} is not null`)
    .groupBy(snippetsTable.language)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const bySourceApp = await db
    .select({ label: snippetsTable.sourceApp, count: sql<number>`cast(count(*) as int)` })
    .from(snippetsTable)
    .where(sql`${snippetsTable.sourceApp} is not null`)
    .groupBy(snippetsTable.sourceApp)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const byTag = await db
    .select({ label: tagsTable.name, count: sql<number>`cast(count(*) as int)` })
    .from(snippetTagsTable)
    .innerJoin(tagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
    .groupBy(tagsTable.name)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  res.json({
    total: totalRow?.count ?? 0,
    pinned: pinnedRow?.count ?? 0,
    enriched: enrichedRow?.count ?? 0,
    byLanguage: byLanguage.map((r) => ({ label: r.label ?? "Unknown", count: r.count })),
    bySourceApp: bySourceApp.map((r) => ({ label: r.label ?? "Unknown", count: r.count })),
    byTag: byTag.map((r) => ({ label: r.label, count: r.count })),
  });
});

// ── Recent / Pinned ───────────────────────────────────────────

router.get("/snippets/recent", async (req, res) => {
  const parsed = ListRecentSnippetsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;
  const rows = await db
    .select()
    .from(snippetsTable)
    .orderBy(desc(snippetsTable.createdAt))
    .limit(limit);
  const withTags = await Promise.all(rows.map((s) => getSnippetWithTags(s.id)));
  res.json(withTags.filter(Boolean));
});

router.get("/snippets/pinned", async (_req, res) => {
  const rows = await db
    .select()
    .from(snippetsTable)
    .where(eq(snippetsTable.isPinned, true))
    .orderBy(desc(snippetsTable.updatedAt));
  const withTags = await Promise.all(rows.map((s) => getSnippetWithTags(s.id)));
  res.json(withTags.filter(Boolean));
});

// ── Get by id ─────────────────────────────────────────────────

router.get("/snippets/:id", async (req, res) => {
  const parsed = GetSnippetParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const snippet = await getSnippetWithTags(parsed.data.id);
  if (!snippet) { res.status(404).json({ error: "Snippet not found" }); return; }
  res.json(snippet);
});

// ── Update ────────────────────────────────────────────────────

router.patch("/snippets/:id", async (req, res) => {
  const paramsParsed = UpdateSnippetParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateSnippetBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { tags, isPinned, ...rest } = bodyParsed.data;
  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (isPinned !== undefined) updateData.isPinned = isPinned;

  await db
    .update(snippetsTable)
    .set(updateData)
    .where(eq(snippetsTable.id, paramsParsed.data.id));

  if (tags !== undefined) await syncSnippetTags(paramsParsed.data.id, tags);

  const result = await getSnippetWithTags(paramsParsed.data.id);
  if (!result) { res.status(404).json({ error: "Snippet not found" }); return; }
  res.json(result);
});

// ── Delete ────────────────────────────────────────────────────

router.delete("/snippets/:id", async (req, res) => {
  const parsed = DeleteSnippetParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(snippetsTable).where(eq(snippetsTable.id, parsed.data.id));
  res.status(204).send();
});

// ── Toggle pin ────────────────────────────────────────────────

router.patch("/snippets/:id/pin", async (req, res) => {
  const parsed = ToggleSnippetPinParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db
    .select()
    .from(snippetsTable)
    .where(eq(snippetsTable.id, parsed.data.id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Snippet not found" }); return; }
  await db
    .update(snippetsTable)
    .set({ isPinned: !existing.isPinned, updatedAt: new Date() })
    .where(eq(snippetsTable.id, parsed.data.id));
  res.json(await getSnippetWithTags(parsed.data.id));
});

// ── Enrich — routed through EnrichSnippetUseCase ─────────────

router.post("/snippets/:id/enrich", async (req, res) => {
  const parsed = EnrichSnippetParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const result = await enrichSnippetUseCase.execute({ snippetId: parsed.data.id });

  if (!result.success) {
    const status = result.reason === "not_found" ? 404 : 500;
    res.status(status).json({ error: result.message });
    return;
  }

  // Return the freshly persisted snippet so tags are included
  res.json(await getSnippetWithTags(result.snippet.id!));
});

export default router;
