import { Router } from "express";
import { db } from "@workspace/db";
import {
  snippetsTable,
  tagsTable,
  snippetTagsTable,
  clipboardStateTable,
} from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { CaptureClipboardBody } from "@workspace/api-zod";

const router = Router();

async function getOrCreateClipboardState() {
  const rows = await db.select().from(clipboardStateTable).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(clipboardStateTable)
    .values({ isMonitoring: false, capturedCount: 0 })
    .returning();
  return inserted[0];
}

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

router.get("/clipboard/status", async (_req, res) => {
  const state = await getOrCreateClipboardState();
  res.json({
    isMonitoring: state.isMonitoring,
    capturedCount: state.capturedCount,
    lastCapturedAt: state.lastCapturedAt ? state.lastCapturedAt.toISOString() : null,
  });
});

router.post("/clipboard/capture", async (req, res) => {
  const parsed = CaptureClipboardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { content, sourceApp, sourceUrl } = parsed.data;

  const language = detectLanguage(content);

  const inserted = await db
    .insert(snippetsTable)
    .values({
      content,
      sourceApp: sourceApp ?? null,
      sourceUrl: sourceUrl ?? null,
      language,
      isPinned: false,
      isEnriched: false,
    })
    .returning();

  await db
    .update(clipboardStateTable)
    .set({
      capturedCount: sql`${clipboardStateTable.capturedCount} + 1`,
      lastCapturedAt: new Date(),
      isMonitoring: true,
    })
    .where(eq(clipboardStateTable.id, (await getOrCreateClipboardState()).id));

  const result = await getSnippetWithTags(inserted[0].id);
  res.status(201).json(result);
});

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
