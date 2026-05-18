// ─────────────────────────────────────────────────────────────
// PORT: IScreenCaptureOCRService
//
// Outbound port for screen capture + optical character
// recognition. Responsible for:
//   1. Capturing a screenshot of the entire screen or a region.
//   2. Running Tesseract.js (or equivalent local OCR engine)
//      to extract text from the captured image.
//   3. Returning structured, confidence-annotated text output.
//
// In production (Electron/Tauri):
//   Uses desktopCapturer (Electron) or native screenshot APIs,
//   then pipes through tesseract.js with a local trained model.
//
// In web/dev environments:
//   Accepts user-uploaded images; processes them client-side
//   via tesseract.js WASM.
// ─────────────────────────────────────────────────────────────

/** A pixel region to capture. All values in logical pixels. */
export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotResult {
  /** Raw image data as a Buffer (PNG). */
  imageBuffer: Buffer;

  /** Width of the captured image in pixels. */
  width: number;

  /** Height of the captured image in pixels. */
  height: number;

  /** Path where the image was persisted, if auto-saved. */
  storagePath: string | null;

  /** MIME type of the image. Always "image/png". */
  mimeType: "image/png";

  capturedAt: Date;
}

export interface OCRWord {
  text: string;
  confidence: number; // 0–1
  bbox: { x: number; y: number; w: number; h: number };
}

export interface OCRLine {
  text: string;
  confidence: number;
  words: OCRWord[];
}

export interface OCRResult {
  /** The complete extracted text as a single string. */
  fullText: string;

  /** Cleaned version of fullText (extra whitespace removed, etc.) */
  cleanedText: string;

  /** Average confidence across all recognized characters. 0–1. */
  overallConfidence: number;

  lines: OCRLine[];

  /** Detected script/language by Tesseract (e.g. "eng"). */
  detectedScript: string;

  /** Programming language inferred from the text content. */
  inferredCodeLanguage: string | null;

  processingTimeMs: number;
}

export interface OCRServiceOptions {
  /** Tesseract language pack to load. Default: "eng". */
  language?: string;

  /** PSM (Page Segmentation Mode). Default: 6 (assume uniform block of text). */
  pageSegMode?: number;

  /** DPI scaling factor. Default: 1. Higher = better for small text. */
  scaleFactor?: number;
}

export interface IScreenCaptureOCRService {
  /**
   * Capture the full screen (or a named display) as a PNG buffer.
   * Returns null if screen capture permissions are denied.
   */
  captureScreen(displayId?: string): Promise<ScreenshotResult | null>;

  /**
   * Capture a specific pixel region of the screen.
   */
  captureRegion(region: CaptureRegion): Promise<ScreenshotResult | null>;

  /**
   * Run OCR on an existing image buffer or file path.
   * Does not capture a new screenshot.
   */
  extractTextFromImage(
    source: Buffer | string,
    options?: OCRServiceOptions
  ): Promise<OCRResult>;

  /**
   * Convenience: capture the screen and immediately run OCR.
   * The most common operation: copy-from-screen flow.
   */
  captureAndExtract(
    region?: CaptureRegion,
    options?: OCRServiceOptions
  ): Promise<{ screenshot: ScreenshotResult; ocr: OCRResult } | null>;

  /**
   * True if the OCR engine is initialized and ready.
   * Tesseract.js needs to load its WASM + language pack on first use.
   */
  isReady(): Promise<boolean>;

  /**
   * Pre-warms the OCR engine so the first call is fast.
   * Should be called at app startup.
   */
  initialize(options?: OCRServiceOptions): Promise<void>;

  /**
   * Release the OCR engine's resources. Must be called on app exit.
   */
  terminate(): Promise<void>;
}
