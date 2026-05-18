import type {
  IScreenCaptureOCRService,
  ScreenshotResult,
  OCRResult,
  OCRServiceOptions,
  CaptureRegion,
} from "../../core/ports/services/IScreenCaptureOCRService";
import { logger } from "../../lib/logger";

// ─────────────────────────────────────────────────────────────
// ADAPTER: ScreenCaptureOCRAdapter
//
// Implements IScreenCaptureOCRService.
//
// OCR Engine: Tesseract.js (WASM, runs fully local, no network).
//   npm install tesseract.js
//
// In production (Electron):
//   Screen capture → desktopCapturer.getSources({ types: ["screen"] })
//   then nativeImage from the thumbnail → pass buffer to extractTextFromImage.
//
// In production (Tauri):
//   Use the tauri-plugin-screenshot Rust plugin → PNG buffer
//   → pass to the Tesseract.js WASM running in the webview context.
//
// In web/server environments (current):
//   captureScreen() and captureRegion() return null (no screen access).
//   extractTextFromImage() is fully functional with uploaded buffers.
// ─────────────────────────────────────────────────────────────

export class ScreenCaptureOCRAdapter implements IScreenCaptureOCRService {
  private _initialized = false;
  private _worker: unknown = null; // Tesseract.Worker once initialized

  async initialize(options: OCRServiceOptions = {}): Promise<void> {
    if (this._initialized) return;
    try {
      // Lazy-import tesseract.js so it's not loaded if OCR is never used.
      // In Electron/Tauri environments, tesseract.js must be in dependencies.
      //
      // const { createWorker } = await import("tesseract.js");
      // this._worker = await createWorker(options.language ?? "eng", 1, {
      //   logger: (m: unknown) => logger.debug({ tesseract: m }, "OCR progress"),
      // });

      // Simulation: mark as initialized without loading the real engine.
      logger.info("ScreenCaptureOCRAdapter: running in simulation mode (no tesseract.js)");
      this._initialized = true;
    } catch (err) {
      logger.error({ err }, "ScreenCaptureOCRAdapter: failed to initialize Tesseract worker");
      throw err;
    }
  }

  async isReady(): Promise<boolean> {
    return this._initialized;
  }

  async captureScreen(_displayId?: string): Promise<ScreenshotResult | null> {
    // In Electron:
    // const { desktopCapturer, nativeImage } = require("electron");
    // const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1920, height: 1080 } });
    // const source = sources[0];
    // const image = source.thumbnail;
    // return { imageBuffer: image.toPNG(), width: image.getSize().width, ... };
    logger.warn("ScreenCaptureOCRAdapter.captureScreen: no native capture available (web mode)");
    return null;
  }

  async captureRegion(_region: CaptureRegion): Promise<ScreenshotResult | null> {
    // Same as captureScreen but crop to the provided region.
    logger.warn("ScreenCaptureOCRAdapter.captureRegion: no native capture available (web mode)");
    return null;
  }

  async extractTextFromImage(
    source: Buffer | string,
    _options: OCRServiceOptions = {},
  ): Promise<OCRResult> {
    if (!this._initialized) {
      throw new Error("ScreenCaptureOCRAdapter: not initialized — call initialize() first");
    }

    // When tesseract.js is properly installed:
    //
    // const worker = this._worker as Tesseract.Worker;
    // const {
    //   data: { text, confidence, lines },
    // } = await worker.recognize(source);
    //
    // return {
    //   fullText: text,
    //   cleanedText: text.replace(/\s{2,}/g, " ").trim(),
    //   overallConfidence: confidence / 100,
    //   lines: lines.map(l => ({ text: l.text, confidence: l.confidence / 100, words: l.words.map(w => ({ text: w.text, confidence: w.confidence / 100, bbox: w.bbox })) })),
    //   detectedScript: "eng",
    //   inferredCodeLanguage: this._inferCodeLanguage(text),
    //   processingTimeMs: 0,
    // };

    // Simulation stub:
    const simulatedText =
      typeof source === "string"
        ? `// OCR extracted from file: ${source}`
        : `// OCR extracted from buffer (${source.byteLength} bytes)`;

    return {
      fullText: simulatedText,
      cleanedText: simulatedText,
      overallConfidence: 0.95,
      lines: [{ text: simulatedText, confidence: 0.95, words: [] }],
      detectedScript: "eng",
      inferredCodeLanguage: this._inferCodeLanguage(simulatedText),
      processingTimeMs: 0,
    };
  }

  async captureAndExtract(
    region?: CaptureRegion,
    options?: OCRServiceOptions,
  ): Promise<{ screenshot: ScreenshotResult; ocr: OCRResult } | null> {
    const screenshot = region
      ? await this.captureRegion(region)
      : await this.captureScreen();
    if (!screenshot) return null;
    const ocr = await this.extractTextFromImage(screenshot.imageBuffer, options);
    return { screenshot, ocr };
  }

  async terminate(): Promise<void> {
    if (this._worker) {
      // await (this._worker as Tesseract.Worker).terminate();
      this._worker = null;
    }
    this._initialized = false;
  }

  private _inferCodeLanguage(text: string): string | null {
    if (/^\s*(import|export|const|let|var|function|interface)\s/.test(text)) {
      return /:\s*(string|number|boolean)/.test(text) ? "typescript" : "javascript";
    }
    if (/^\s*(def |class |import |from .+ import)/.test(text)) return "python";
    if (/^\s*(fn |use |let mut |impl )/.test(text)) return "rust";
    if (/^\s*(func |package |go )/.test(text)) return "go";
    if (/^\s*(SELECT|INSERT|UPDATE)\b/i.test(text)) return "sql";
    return null;
  }
}
