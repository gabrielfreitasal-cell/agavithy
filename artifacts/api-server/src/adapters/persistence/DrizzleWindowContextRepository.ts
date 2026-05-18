import { db } from "@workspace/db";
import { windowContextsTable, snippetsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { WindowContextEntity } from "../../core/domain/window-context.entity";
import type { IWindowContextRepository } from "../../core/ports/repositories/IWindowContextRepository";

// ─────────────────────────────────────────────────────────────
// ADAPTER: DrizzleWindowContextRepository
// Implements IWindowContextRepository using Drizzle ORM.
// ─────────────────────────────────────────────────────────────

export class DrizzleWindowContextRepository implements IWindowContextRepository {

  async save(context: WindowContextEntity): Promise<WindowContextEntity> {
    const [row] = await db
      .insert(windowContextsTable)
      .values({
        processName: context.processName,
        processId: context.processId,
        windowTitle: context.windowTitle,
        executablePath: context.executablePath,
        workingDirectory: context.workingDirectory,
        activeUrl: context.activeUrl,
      })
      .returning();
    return this._toEntity(row);
  }

  async findById(id: number): Promise<WindowContextEntity | null> {
    const [row] = await db
      .select()
      .from(windowContextsTable)
      .where(eq(windowContextsTable.id, id))
      .limit(1);
    return row ? this._toEntity(row) : null;
  }

  async findLatestByProcessName(processName: string): Promise<WindowContextEntity | null> {
    const [row] = await db
      .select()
      .from(windowContextsTable)
      .where(eq(windowContextsTable.processName, processName))
      .orderBy(desc(windowContextsTable.capturedAt))
      .limit(1);
    return row ? this._toEntity(row) : null;
  }

  async findTopSources(limit: number): Promise<Array<{ processName: string; count: number }>> {
    const rows = await db
      .select({
        processName: windowContextsTable.processName,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(windowContextsTable)
      .innerJoin(snippetsTable, eq(snippetsTable.windowContextId, windowContextsTable.id))
      .groupBy(windowContextsTable.processName)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    return rows.map((r) => ({ processName: r.processName, count: r.count }));
  }

  private _toEntity(row: typeof windowContextsTable.$inferSelect): WindowContextEntity {
    return WindowContextEntity.reconstitute({
      id: row.id,
      processName: row.processName,
      processId: row.processId,
      windowTitle: row.windowTitle,
      executablePath: row.executablePath,
      workingDirectory: row.workingDirectory,
      activeUrl: row.activeUrl,
      capturedAt: row.capturedAt,
    });
  }
}
