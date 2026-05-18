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

const router = Router();

async function getSnippetWithTags(id: number) {
  const snippet = await db
    .select()
    .from(snippetsTable)
    .where(eq(snippetsTable.id, id))
    .limit(1);
  if (!snippet[0]) return null;

  const tagRows = await db
    .select({ name: tagsTable.name })
    .from(snippetTagsTable)
    .innerJoin(tagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
    .where(eq(snippetTagsTable.snippetId, id));

  return {
    ...snippet[0],
    tags: tagRows.map((t) => t.name),
    createdAt: snippet[0].createdAt.toISOString(),
    updatedAt: snippet[0].updatedAt.toISOString(),
  };
}

async function upsertTags(tagNames: string[]): Promise<number[]> {
  if (tagNames.length === 0) return [];
  const ids: number[] = [];
  for (const name of tagNames) {
    const existing = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, name.toLowerCase().trim()))
      .limit(1);
    if (existing[0]) {
      ids.push(existing[0].id);
    } else {
      const inserted = await db
        .insert(tagsTable)
        .values({ name: name.toLowerCase().trim() })
        .returning();
      ids.push(inserted[0].id);
    }
  }
  return ids;
}

async function syncSnippetTags(snippetId: number, tagNames: string[]) {
  await db
    .delete(snippetTagsTable)
    .where(eq(snippetTagsTable.snippetId, snippetId));
  const tagIds = await upsertTags(tagNames);
  if (tagIds.length > 0) {
    await db
      .insert(snippetTagsTable)
      .values(tagIds.map((tagId) => ({ snippetId, tagId })));
  }
}

router.get("/snippets", async (req, res) => {
  const parsed = ListSnippetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { language, tag, search, source_app, pinned, limit = 50, offset = 0 } = parsed.data;

  let tagSnippetIds: number[] | null = null;
  if (tag) {
    const tagRow = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, tag.toLowerCase()))
      .limit(1);
    if (tagRow[0]) {
      const rows = await db
        .select({ snippetId: snippetTagsTable.snippetId })
        .from(snippetTagsTable)
        .where(eq(snippetTagsTable.tagId, tagRow[0].id));
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
    if (tagSnippetIds.length === 0) {
      res.json([]);
      return;
    }
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

router.post("/snippets", async (req, res) => {
  const parsed = CreateSnippetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { tags = [], ...rest } = parsed.data;
  const inserted = await db
    .insert(snippetsTable)
    .values({ ...rest })
    .returning();
  await syncSnippetTags(inserted[0].id, tags);
  const result = await getSnippetWithTags(inserted[0].id);
  res.status(201).json(result);
});

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

  res.json({
    total: totalRow?.count ?? 0,
    pinned: pinnedRow?.count ?? 0,
    enriched: enrichedRow?.count ?? 0,
    byLanguage: byLanguage.map((r) => ({ label: r.label ?? "Unknown", count: r.count })),
    bySourceApp: bySourceApp.map((r) => ({ label: r.label ?? "Unknown", count: r.count })),
    byTag: byTag.map((r) => ({ label: r.label, count: r.count })),
  });
});

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

router.get("/snippets/:id", async (req, res) => {
  const parsed = GetSnippetParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const snippet = await getSnippetWithTags(parsed.data.id);
  if (!snippet) {
    res.status(404).json({ error: "Snippet not found" });
    return;
  }
  res.json(snippet);
});

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

  if (tags !== undefined) {
    await syncSnippetTags(paramsParsed.data.id, tags);
  }

  const result = await getSnippetWithTags(paramsParsed.data.id);
  if (!result) {
    res.status(404).json({ error: "Snippet not found" });
    return;
  }
  res.json(result);
});

router.delete("/snippets/:id", async (req, res) => {
  const parsed = DeleteSnippetParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(snippetsTable).where(eq(snippetsTable.id, parsed.data.id));
  res.status(204).send();
});

router.patch("/snippets/:id/pin", async (req, res) => {
  const parsed = ToggleSnippetPinParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(snippetsTable)
    .where(eq(snippetsTable.id, parsed.data.id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Snippet not found" });
    return;
  }
  await db
    .update(snippetsTable)
    .set({ isPinned: !existing[0].isPinned, updatedAt: new Date() })
    .where(eq(snippetsTable.id, parsed.data.id));
  const result = await getSnippetWithTags(parsed.data.id);
  res.json(result);
});

router.post("/snippets/:id/enrich", async (req, res) => {
  const parsed = EnrichSnippetParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await getSnippetWithTags(parsed.data.id);
  if (!existing) {
    res.status(404).json({ error: "Snippet not found" });
    return;
  }

  const enriched = await enrichSnippetLocally(existing.content);

  await db
    .update(snippetsTable)
    .set({
      title: enriched.title,
      language: enriched.language,
      isEnriched: true,
      updatedAt: new Date(),
    })
    .where(eq(snippetsTable.id, parsed.data.id));

  if (enriched.tags.length > 0) {
    await syncSnippetTags(parsed.data.id, enriched.tags);
  }

  const result = await getSnippetWithTags(parsed.data.id);
  res.json(result);
});

async function enrichSnippetLocally(content: string): Promise<{
  title: string;
  language: string;
  tags: string[];
}> {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt: `Analyze this code snippet and return ONLY a JSON object with these exact fields:
- title: a short descriptive title (max 60 chars)
- language: the programming language (e.g. typescript, python, rust, go, sql, bash, etc.)
- tags: an array of 2-5 relevant lowercase tags

Code:
\`\`\`
${content.slice(0, 2000)}
\`\`\`

Return ONLY valid JSON, no markdown, no explanation.`,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = (await response.json()) as { response: string };
      const jsonMatch = data.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          title?: string;
          language?: string;
          tags?: string[];
        };
        return {
          title: parsed.title ?? detectTitle(content),
          language: parsed.language ?? detectLanguage(content),
          tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
        };
      }
    }
  } catch {
    // Ollama not available — fall back to heuristics
  }

  return {
    title: detectTitle(content),
    language: detectLanguage(content),
    tags: [],
  };
}

function detectTitle(content: string): string {
  const firstLine = content.split("\n")[0].trim().slice(0, 60);
  return firstLine || "Untitled Snippet";
}

function detectLanguage(content: string): string {
  if (/^\s*(import|export|const|let|var|function|class|interface|type)\s/.test(content)) {
    if (/:\s*(string|number|boolean|void|any)\b/.test(content)) return "typescript";
    return "javascript";
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

export default router;
