import type { TagEntity } from "../../domain/tag.entity";

// ─────────────────────────────────────────────────────────────
// PORT: ITagRepository
// ─────────────────────────────────────────────────────────────

export interface TagWithCount extends TagEntity {
  count: number; // number of snippets using this tag
}

export interface ITagRepository {
  /** Return or create a tag by normalized name. */
  upsert(tag: TagEntity): Promise<TagEntity>;

  /** Attach a list of tags to a snippet. Creates tags if needed. */
  syncSnippetTags(
    snippetId: number,
    tags: TagEntity[],
    addedBy?: "manual" | "llm" | "heuristic"
  ): Promise<void>;

  /** Remove all tag associations for a snippet. */
  clearSnippetTags(snippetId: number): Promise<void>;

  /** Get all tags for a given snippet. */
  findBySnippetId(snippetId: number): Promise<TagEntity[]>;

  /** Get all tags, with their usage counts, sorted by count desc. */
  findAllWithCounts(): Promise<TagWithCount[]>;

  /** Find a tag by exact normalized name. Returns null if not found. */
  findByName(name: string): Promise<TagEntity | null>;

  /** Remove all tags that have zero associated snippets. */
  pruneOrphans(): Promise<number>; // returns count of removed tags
}
