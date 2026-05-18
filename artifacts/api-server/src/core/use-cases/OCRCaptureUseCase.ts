import { SnippetEntity } from "../domain/snippet.entity";
import { MediaMetadataEntity } from "../domain/media-metadata.entity";
import type { ISnippetRepository } from "../ports/repositories/ISnippetRepository";
import type { IMediaMetadataRepository } from "../ports/repositories/IMediaMetadataRepository";
import type { IScreenCaptureOCRService } from "../ports/services/IScreenCaptureOCRService";
import type { IEnrichmentService } from "../ports/services/IEnrichmentService";
import type { CaptureRegion } from "../ports/services/IScreenCaptureOCRService";

// ─────────────────────────────────────────────────────────────
// USE CASE: OCRCaptureUseCase
//
// End-to-end pipeline for converting a screenshot into a snippet:
//   1. Capture a screenshot of the screen or a defined region
//   2. Run Tesseract OCR to extract text
//   3. Validate OCR confidence — reject low-quality results
//   4. Persist the screenshot as MediaMetadata
//   5. Create a Snippet with captureMethod = "ocr"
//   6. Optionally run semantic enrichment
// ─────────────────────────────────────────────────────────────

export interface OCRCaptureInput {
  /** Source: capture from screen, or process an uploaded image buffer. */
  source: "screen" | "uploaded_image";

  /** If source = "screen": region to capture. Undefined = full screen. */
  captureRegion?: CaptureRegion;

  /** If source = "uploaded_image": the raw image data. */
  imageBuffer?: Buffer;

  /** Run enrichment after capture. Default: true. */
  enrichAfterCapture?: boolean;

  /** Minimum acceptable OCR confidence (0–1). Default: 0.6. */
  minimumConfidence?: number;
}

export type OCRCaptureResult =
  | {
      success: true;
      snippet: SnippetEntity;
      media: MediaMetadataEntity;
      ocrConfidence: number;
    }
  | {
      success: false;
      reason:
        | "capture_failed"
        | "low_confidence"
        | "no_text_detected"
        | "ocr_engine_unavailable"
        | "unknown";
      message: string;
    };

export class OCRCaptureUseCase {
  constructor(
    private readonly snippetRepo: ISnippetRepository,
    private readonly mediaRepo: IMediaMetadataRepository,
    private readonly ocrService: IScreenCaptureOCRService,
    private readonly enrichmentService: IEnrichmentService,
  ) {}

  async execute(input: OCRCaptureInput): Promise<OCRCaptureResult> {
    const minConfidence = input.minimumConfidence ?? 0.6;

    // ── 1. Ensure OCR engine is ready ─────────────────────────
    const isReady = await this.ocrService.isReady();
    if (!isReady) {
      return {
        success: false,
        reason: "ocr_engine_unavailable",
        message: "OCR engine is not initialized. Call initialize() at startup.",
      };
    }

    // ── 2. Obtain image data ──────────────────────────────────
    let imageBuffer: Buffer;
    let screenshotStoragePath: string | null = null;
    let width: number | null = null;
    let height: number | null = null;

    if (input.source === "screen") {
      const captured = input.captureRegion
        ? await this.ocrService.captureRegion(input.captureRegion)
        : await this.ocrService.captureScreen();

      if (!captured) {
        return {
          success: false,
          reason: "capture_failed",
          message: "Screen capture returned null. Check screen-capture permissions.",
        };
      }
      imageBuffer = captured.imageBuffer;
      screenshotStoragePath = captured.storagePath;
      width = captured.width;
      height = captured.height;
    } else {
      if (!input.imageBuffer) {
        return {
          success: false,
          reason: "capture_failed",
          message: "imageBuffer is required when source = 'uploaded_image'.",
        };
      }
      imageBuffer = input.imageBuffer;
    }

    // ── 3. Run OCR ────────────────────────────────────────────
    const ocr = await this.ocrService.extractTextFromImage(imageBuffer);

    if (!ocr.fullText || ocr.fullText.trim().length === 0) {
      return {
        success: false,
        reason: "no_text_detected",
        message: "OCR could not detect any text in the provided image.",
      };
    }

    if (ocr.overallConfidence < minConfidence) {
      return {
        success: false,
        reason: "low_confidence",
        message: `OCR confidence ${(ocr.overallConfidence * 100).toFixed(1)}% is below the minimum threshold of ${(minConfidence * 100).toFixed(1)}%.`,
      };
    }

    // ── 4. Persist MediaMetadata ──────────────────────────────
    const media = MediaMetadataEntity.create({
      type: "screenshot",
      storagePath: screenshotStoragePath ?? `ocr-${Date.now()}.png`,
      mimeType: "image/png",
      sizeBytes: imageBuffer.byteLength,
      width,
      height,
      ocrRawText: ocr.fullText,
      ocrConfidence: ocr.overallConfidence,
    });
    media.applyOCRResult({
      rawText: ocr.fullText,
      confidence: ocr.overallConfidence,
      cleanedText: ocr.cleanedText,
      detectedLanguage: ocr.inferredCodeLanguage ?? undefined,
    });
    const savedMedia = await this.mediaRepo.save(media);

    // ── 5. Create Snippet from OCR output ────────────────────
    const snippet = SnippetEntity.create({
      content: ocr.cleanedText,
      captureMethod: "ocr",
      language: ocr.inferredCodeLanguage ?? null,
      isPinned: false,
      isEnriched: false,
    });
    const savedSnippet = await this.snippetRepo.save(snippet);

    // Link the media to the snippet
    savedMedia.attachToSnippet(savedSnippet.id!);
    await this.mediaRepo.update(savedMedia);

    // ── 6. Optional enrichment ────────────────────────────────
    if (input.enrichAfterCapture !== false) {
      try {
        const enriched = await this.enrichmentService.enrich({
          content: ocr.cleanedText,
          knownLanguage: ocr.inferredCodeLanguage ?? undefined,
        });
        savedSnippet.markEnriched(
          enriched.modelUsed,
          enriched.title,
          enriched.summary ?? undefined,
        );
        await this.snippetRepo.update(savedSnippet);
      } catch {
        // Enrichment is best-effort — never block the capture
      }
    }

    return {
      success: true,
      snippet: savedSnippet,
      media: savedMedia,
      ocrConfidence: ocr.overallConfidence,
    };
  }
}
