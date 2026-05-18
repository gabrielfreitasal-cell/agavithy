import { Router } from "express";
import { db } from "@workspace/db";
import {
  snippetsTable,
  tagsTable,
  snippetTagsTable,
  clipboardStateTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CaptureClipboardBody } from "@workspace/api-zod";
import { captureSnippetUseCase } from "../container";

const router = Router();

// ── Shared helpers ────────────────────────────────────────────

async function getOrCreateClipboardState() {
  const [existing] = await db.select().from(clipboardStateTable).limit(1);
  if (existing) return existing;
  const [inserted] = await db
    .insert(clipboardStateTable)
    .values({ isMonitoring: false, capturedCount: 0 })
    .returning();
  return inserted;
}

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

// ── Status ────────────────────────────────────────────────────

router.get("/clipboard/status", async (_req, res) => {
  const state = await getOrCreateClipboardState();
  res.json({
    isMonitoring: state.isMonitoring,
    capturedCount: state.capturedCount,
    lastCapturedAt: state.lastCapturedAt ? state.lastCapturedAt.toISOString() : null,
  });
});

// ── Capture — routed through CaptureSnippetUseCase ───────────
// Deduplication, window context resolution, and language
// detection are all handled by the use case.

router.post("/clipboard/capture", async (req, res) => {
  const parsed = CaptureClipboardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { content, sourceApp, sourceUrl, autoEnrich = true } = parsed.data;

  const result = await captureSnippetUseCase.execute({
    content,
    captureMethod: "clipboard",
    sourceApp: sourceApp ?? undefined,
    sourceUrl: sourceUrl ?? undefined,
    enrichImmediately: autoEnrich,
  });

  if (!result.success) {
    res.status(400).json({ error: result.message });
    return;
  }

  // Update clipboard monitor state (increment counter only for new captures)
  const state = await getOrCreateClipboardState();
  await db
    .update(clipboardStateTable)
    .set({
      isMonitoring: true,
      lastCapturedAt: new Date(),
      capturedCount: result.wasDuplicate
        ? state.capturedCount
        : sql`${clipboardStateTable.capturedCount} + 1`,
      dedupCount: result.wasDuplicate
        ? sql`${clipboardStateTable.dedupCount} + 1`
        : state.dedupCount,
    })
    .where(eq(clipboardStateTable.id, state.id));

  const snippet = await getSnippetWithTags(result.snippet.id!);
  res.status(result.wasDuplicate ? 200 : 201).json(snippet);
});

export default router;
