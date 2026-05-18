import type { WindowContextEntity } from "../../domain/window-context.entity";

// ─────────────────────────────────────────────────────────────
// PORT: IWindowContextRepository
// ─────────────────────────────────────────────────────────────

export interface IWindowContextRepository {
  /** Persist a new WindowContextEntity. Returns the entity with its id. */
  save(context: WindowContextEntity): Promise<WindowContextEntity>;

  /** Retrieve a context by id. Returns null if not found. */
  findById(id: number): Promise<WindowContextEntity | null>;

  /**
   * Find the most recently saved context for a given process name.
   * Used to enrich snippets captured without explicit context.
   */
  findLatestByProcessName(processName: string): Promise<WindowContextEntity | null>;

  /** Return the top N process names with the most snippet captures. */
  findTopSources(limit: number): Promise<Array<{ processName: string; count: number }>>;
}
