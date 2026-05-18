import { Router } from "express";
import { db } from "@workspace/db";
import { tagsTable, snippetTagsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";

const router = Router();

router.get("/tags", async (_req, res) => {
  const rows = await db
    .select({
      name: tagsTable.name,
      count: sql<number>`cast(count(${snippetTagsTable.id}) as int)`,
    })
    .from(tagsTable)
    .leftJoin(snippetTagsTable, eq(snippetTagsTable.tagId, tagsTable.id))
    .groupBy(tagsTable.name)
    .orderBy(desc(sql`count(${snippetTagsTable.id})`));

  res.json(rows);
});

export default router;
