import type { MediaMetadataEntity, MediaType } from "../../domain/media-metadata.entity";

// ─────────────────────────────────────────────────────────────
// PORT: IMediaMetadataRepository
// ─────────────────────────────────────────────────────────────

export interface IMediaMetadataRepository {
  /** Persist a new MediaMetadataEntity. Returns the entity with its id. */
  save(media: MediaMetadataEntity): Promise<MediaMetadataEntity>;

  /** Update OCR/transcription fields after processing. */
  update(media: MediaMetadataEntity): Promise<MediaMetadataEntity>;

  /** Retrieve a media record by id. */
  findById(id: number): Promise<MediaMetadataEntity | null>;

  /** Retrieve all media records attached to a snippet. */
  findBySnippetId(snippetId: number): Promise<MediaMetadataEntity[]>;

  /** Retrieve all media of a given type, optionally filtered to a snippet. */
  findByType(
    type: MediaType,
    snippetId?: number
  ): Promise<MediaMetadataEntity[]>;

  /** Remove a media record and (optionally) delete the backing file. */
  delete(id: number, deleteFile?: boolean): Promise<void>;

  /** Remove all media records for a snippet. */
  deleteBySnippetId(snippetId: number, deleteFiles?: boolean): Promise<void>;
}
