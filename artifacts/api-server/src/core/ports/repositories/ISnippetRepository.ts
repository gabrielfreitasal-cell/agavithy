import type { SnippetEntity } from "../../domain/snippet.entity";

// ─────────────────────────────────────────────────────────────
// PORT: ISnippetRepository
//
// Persistence boundary for the Snippet aggregate root.
// The Core depends only on this interface; the concrete
// DrizzleSnippetRepository (adapter) wires the real DB.
// ─────────────────────────────────────────────────────────────

export interface SnippetFilter {
  language?: string;
  sourceApp?: string;
  tag?: string;
  search?: string;          // full-text search on content
  isPinned?: boolean;
  isEnriched?: boolean;
  captureMethod?: string;
}

export interface SnippetPage {
  items: SnippetEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface SnippetStats {
  total: number;
  pinned: number;
  enriched: number;
  byLanguage: Array<{ label: string; count: number }>;
  bySourceApp: Array<{ label: string; count: number }>;
  byTag: Array<{ label: string; count: number }>;
}

export interface ISnippetRepository {
  /** Persist a new SnippetEntity. Returns the entity with its assigned id. */
  save(snippet: SnippetEntity): Promise<SnippetEntity>;

  /** Persist changes to an existing snippet. */
  update(snippet: SnippetEntity): Promise<SnippetEntity>;

  /** Remove a snippet by id. No-op if not found. */
  delete(id: number): Promise<void>;

  /** Retrieve a single snippet by id. Returns null if not found. */
  findById(id: number): Promise<SnippetEntity | null>;

  /** Retrieve a paginated, filtered list. */
  findMany(filter: SnippetFilter, limit: number, offset: number): Promise<SnippetPage>;

  /** Retrieve the N most recently created snippets. */
  findRecent(limit: number): Promise<SnippetEntity[]>;

  /** Retrieve all pinned snippets ordered by updatedAt desc. */
  findPinned(): Promise<SnippetEntity[]>;

  /**
   * Lookup by content hash — used to detect duplicates before saving.
   * Returns null if no match.
   */
  findByContentHash(hash: string): Promise<SnippetEntity | null>;

  /** Aggregate counts and breakdowns for the dashboard. */
  getStats(): Promise<SnippetStats>;
}
