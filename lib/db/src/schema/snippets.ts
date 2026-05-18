import {
  pgTable,
  text,
  serial,
  boolean,
  timestamp,
  integer,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─────────────────────────────────────────────
// WINDOW CONTEXTS
// Stores OS-level process/window information
// captured at the exact moment a snippet is copied.
// ─────────────────────────────────────────────
export const windowContextsTable = pgTable("window_contexts", {
  id: serial("id").primaryKey(),
  processName: text("process_name").notNull(),       // e.g. "Code.exe"
  processId: integer("process_id"),                  // OS PID
  windowTitle: text("window_title"),                 // e.g. "main.ts — MyProject"
  executablePath: text("executable_path"),           // full binary path
  workingDirectory: text("working_directory"),       // cwd of the process
  activeUrl: text("active_url"),                     // browser URL if applicable
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// MEDIA METADATA
// Attached media evidence for a snippet:
// screenshots (OCR source), audio recordings, etc.
// ─────────────────────────────────────────────
export const mediaMetadataTable = pgTable("media_metadata", {
  id: serial("id").primaryKey(),
  snippetId: integer("snippet_id").references(() => snippetsTable.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(),                      // "screenshot" | "audio" | "video"
  storagePath: text("storage_path").notNull(),       // local FS path or object-store key
  mimeType: text("mime_type").notNull(),             // "image/png", "audio/wav", etc.
  sizeBytes: integer("size_bytes"),
  durationMs: integer("duration_ms"),                // for audio/video
  width: integer("width"),                           // for images/screenshots
  height: integer("height"),
  ocrRawText: text("ocr_raw_text"),                  // raw Tesseract output before cleanup
  ocrConfidence: real("ocr_confidence"),             // 0–1 Tesseract confidence score
  transcriptionRaw: text("transcription_raw"),       // raw audio-to-text output
  metadata: jsonb("metadata"),                       // arbitrary extra fields (codec, fps, etc.)
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// TAGS
// Auto-generated and manual labels.
// ─────────────────────────────────────────────
export const tagsTable = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  source: text("source").notNull().default("manual"), // "manual" | "llm" | "heuristic"
  confidence: real("confidence"),                      // LLM confidence score when source="llm"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// SNIPPETS — Core entity
// ─────────────────────────────────────────────
export const snippetsTable = pgTable("snippets", {
  id: serial("id").primaryKey(),
  title: text("title"),
  content: text("content").notNull(),
  language: text("language"),                         // detected/enriched language
  languageConfidence: real("language_confidence"),    // heuristic or LLM confidence
  sourceApp: text("source_app"),                      // denormalized for fast queries
  sourceUrl: text("source_url"),
  windowContextId: integer("window_context_id").references(
    () => windowContextsTable.id,
    { onDelete: "set null" }
  ),
  captureMethod: text("capture_method").notNull().default("manual"),
  // "clipboard" | "manual" | "ocr" | "audio_transcription"
  isPinned: boolean("is_pinned").notNull().default(false),
  isEnriched: boolean("is_enriched").notNull().default(false),
  enrichmentModel: text("enrichment_model"),          // e.g. "llama3.2", "heuristic"
  llmSummary: text("llm_summary"),                    // optional LLM-generated description
  contentHash: text("content_hash"),                  // SHA-256 for dedup detection
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// SNIPPET ↔ TAG  (many-to-many)
// ─────────────────────────────────────────────
export const snippetTagsTable = pgTable("snippet_tags", {
  id: serial("id").primaryKey(),
  snippetId: integer("snippet_id")
    .notNull()
    .references(() => snippetsTable.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tagsTable.id, { onDelete: "cascade" }),
  addedBy: text("added_by").notNull().default("manual"), // "manual" | "llm" | "heuristic"
});

// ─────────────────────────────────────────────
// CLIPBOARD STATE  (single-row monitor state)
// ─────────────────────────────────────────────
export const clipboardStateTable = pgTable("clipboard_state", {
  id: serial("id").primaryKey(),
  isMonitoring: boolean("is_monitoring").notNull().default(false),
  capturedCount: integer("captured_count").notNull().default(0),
  dedupCount: integer("dedup_count").notNull().default(0),  // skipped duplicates
  lastCapturedAt: timestamp("last_captured_at"),
  lastContentHash: text("last_content_hash"),               // prevents duplicate captures
});

// ─────────────────────────────────────────────
// ENRICHMENT JOBS  (async enrichment queue)
// ─────────────────────────────────────────────
export const enrichmentJobsTable = pgTable("enrichment_jobs", {
  id: serial("id").primaryKey(),
  snippetId: integer("snippet_id")
    .notNull()
    .references(() => snippetsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  // "pending" | "running" | "done" | "failed"
  model: text("model"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Zod Insert Schemas (for input validation)
// ─────────────────────────────────────────────
export const insertSnippetSchema = createInsertSchema(snippetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTagSchema = createInsertSchema(tagsTable).omit({
  id: true,
  createdAt: true,
});

export const insertWindowContextSchema = createInsertSchema(windowContextsTable).omit({
  id: true,
  capturedAt: true,
});

export const insertMediaMetadataSchema = createInsertSchema(mediaMetadataTable).omit({
  id: true,
  capturedAt: true,
});

// ─────────────────────────────────────────────
// Inferred Types
// ─────────────────────────────────────────────
export type Snippet = typeof snippetsTable.$inferSelect;
export type InsertSnippet = z.infer<typeof insertSnippetSchema>;

export type Tag = typeof tagsTable.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export type WindowContext = typeof windowContextsTable.$inferSelect;
export type InsertWindowContext = z.infer<typeof insertWindowContextSchema>;

export type MediaMetadata = typeof mediaMetadataTable.$inferSelect;
export type InsertMediaMetadata = z.infer<typeof insertMediaMetadataSchema>;

export type SnippetTag = typeof snippetTagsTable.$inferSelect;
export type ClipboardState = typeof clipboardStateTable.$inferSelect;
export type EnrichmentJob = typeof enrichmentJobsTable.$inferSelect;
