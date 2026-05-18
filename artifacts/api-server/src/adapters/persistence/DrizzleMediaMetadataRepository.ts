import { db } from "@workspace/db";
import { mediaMetadataTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { MediaMetadataEntity } from "../../core/domain/media-metadata.entity";
import type { IMediaMetadataRepository } from "../../core/ports/repositories/IMediaMetadataRepository";
import type { MediaType, MimeType } from "../../core/domain/media-metadata.entity";
import { unlink } from "fs/promises";

// ─────────────────────────────────────────────────────────────
// ADAPTER: DrizzleMediaMetadataRepository
// Implements IMediaMetadataRepository using Drizzle ORM.
// ─────────────────────────────────────────────────────────────

export class DrizzleMediaMetadataRepository implements IMediaMetadataRepository {

  async save(media: MediaMetadataEntity): Promise<MediaMetadataEntity> {
    const [row] = await db
      .insert(mediaMetadataTable)
      .values({
        snippetId: media.snippetId,
        type: media.type,
        storagePath: media.storagePath,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        durationMs: media.durationMs,
        width: media.width,
        height: media.height,
        ocrRawText: media.ocrRawText,
        ocrConfidence: media.ocrConfidence,
        transcriptionRaw: media.transcriptionRaw,
        metadata: media.metadata,
      })
      .returning();
    return this._toEntity(row);
  }

  async update(media: MediaMetadataEntity): Promise<MediaMetadataEntity> {
    const [row] = await db
      .update(mediaMetadataTable)
      .set({
        snippetId: media.snippetId,
        ocrRawText: media.ocrRawText,
        ocrConfidence: media.ocrConfidence,
        transcriptionRaw: media.transcriptionRaw,
      })
      .where(eq(mediaMetadataTable.id, media.id!))
      .returning();
    return this._toEntity(row);
  }

  async findById(id: number): Promise<MediaMetadataEntity | null> {
    const [row] = await db
      .select()
      .from(mediaMetadataTable)
      .where(eq(mediaMetadataTable.id, id))
      .limit(1);
    return row ? this._toEntity(row) : null;
  }

  async findBySnippetId(snippetId: number): Promise<MediaMetadataEntity[]> {
    const rows = await db
      .select()
      .from(mediaMetadataTable)
      .where(eq(mediaMetadataTable.snippetId, snippetId));
    return rows.map((r) => this._toEntity(r));
  }

  async findByType(type: MediaType, snippetId?: number): Promise<MediaMetadataEntity[]> {
    const rows = await db
      .select()
      .from(mediaMetadataTable)
      .where(
        snippetId !== undefined
          ? eq(mediaMetadataTable.snippetId, snippetId)
          : eq(mediaMetadataTable.type, type),
      );
    return rows.filter((r) => r.type === type).map((r) => this._toEntity(r));
  }

  async delete(id: number, deleteFile = false): Promise<void> {
    if (deleteFile) {
      const [row] = await db
        .select({ path: mediaMetadataTable.storagePath })
        .from(mediaMetadataTable)
        .where(eq(mediaMetadataTable.id, id))
        .limit(1);
      if (row?.path) {
        await unlink(row.path).catch(() => void 0); // best-effort
      }
    }
    await db.delete(mediaMetadataTable).where(eq(mediaMetadataTable.id, id));
  }

  async deleteBySnippetId(snippetId: number, deleteFiles = false): Promise<void> {
    if (deleteFiles) {
      const rows = await db
        .select({ path: mediaMetadataTable.storagePath })
        .from(mediaMetadataTable)
        .where(eq(mediaMetadataTable.snippetId, snippetId));
      await Promise.all(rows.map((r) => unlink(r.path).catch(() => void 0)));
    }
    await db
      .delete(mediaMetadataTable)
      .where(eq(mediaMetadataTable.snippetId, snippetId));
  }

  private _toEntity(row: typeof mediaMetadataTable.$inferSelect): MediaMetadataEntity {
    return MediaMetadataEntity.reconstitute({
      id: row.id,
      snippetId: row.snippetId,
      type: row.type as MediaType,
      storagePath: row.storagePath,
      mimeType: row.mimeType as MimeType,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      width: row.width,
      height: row.height,
      ocrRawText: row.ocrRawText,
      ocrConfidence: row.ocrConfidence,
      transcriptionRaw: row.transcriptionRaw,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      capturedAt: row.capturedAt,
    });
  }
}
