import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const snippetsTable = pgTable("snippets", {
  id: serial("id").primaryKey(),
  title: text("title"),
  content: text("content").notNull(),
  language: text("language"),
  sourceApp: text("source_app"),
  sourceUrl: text("source_url"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isEnriched: boolean("is_enriched").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const tagsTable = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const snippetTagsTable = pgTable("snippet_tags", {
  id: serial("id").primaryKey(),
  snippetId: integer("snippet_id")
    .notNull()
    .references(() => snippetsTable.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tagsTable.id, { onDelete: "cascade" }),
});

export const clipboardStateTable = pgTable("clipboard_state", {
  id: serial("id").primaryKey(),
  isMonitoring: boolean("is_monitoring").notNull().default(false),
  capturedCount: integer("captured_count").notNull().default(0),
  lastCapturedAt: timestamp("last_captured_at"),
});

export const insertSnippetSchema = createInsertSchema(snippetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTagSchema = createInsertSchema(tagsTable).omit({ id: true });

export type InsertSnippet = z.infer<typeof insertSnippetSchema>;
export type Snippet = typeof snippetsTable.$inferSelect;
export type Tag = typeof tagsTable.$inferSelect;
export type SnippetTag = typeof snippetTagsTable.$inferSelect;
export type ClipboardState = typeof clipboardStateTable.$inferSelect;
