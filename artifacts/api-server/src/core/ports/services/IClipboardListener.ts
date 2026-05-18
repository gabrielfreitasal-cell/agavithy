// ─────────────────────────────────────────────────────────────
// PORT: IClipboardListener
//
// Outbound port for OS-level clipboard monitoring.
// The Core never imports a concrete implementation — it
// depends only on this contract.
//
// In production (Electron/Tauri):
//   Adapter polls nativeImage / clipboard API every N ms and
//   fires onChange when new non-duplicate content is detected.
//
// In web/dev environments:
//   Adapter uses the browser Clipboard API (read-on-demand).
// ─────────────────────────────────────────────────────────────

export interface ClipboardEntry {
  /** Raw text content read from the clipboard. */
  content: string;

  /** SHA-256 of the content — used for deduplication. */
  contentHash: string;

  /** UTC timestamp of when the read occurred. */
  capturedAt: Date;

  /** Optional: detected MIME type (text/plain, text/html, etc.) */
  mimeType?: string;
}

export interface ClipboardListenerOptions {
  /** Polling interval in milliseconds (default: 500). */
  intervalMs?: number;

  /** Minimum content length to consider valid (default: 3). */
  minLength?: number;

  /** If true, ignore entries identical to the previous capture (default: true). */
  deduplicateConsecutive?: boolean;
}

export interface ClipboardListenerState {
  isMonitoring: boolean;
  capturedCount: number;
  dedupCount: number;
  lastCapturedAt: Date | null;
  lastContentHash: string | null;
}

// ── Event callbacks ───────────────────────────────────────────

export type ClipboardChangeHandler = (entry: ClipboardEntry) => void | Promise<void>;
export type ClipboardErrorHandler = (error: Error) => void;

// ── Port contract ─────────────────────────────────────────────

export interface IClipboardListener {
  /**
   * Begin monitoring the clipboard.
   * Fires onChange every time new, non-duplicate text is detected.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(options?: ClipboardListenerOptions): void;

  /**
   * Stop clipboard monitoring and release any held resources.
   */
  stop(): void;

  /**
   * Register a handler invoked on every new clipboard capture.
   * Multiple handlers can be registered; all will be called.
   */
  onChange(handler: ClipboardChangeHandler): void;

  /**
   * Register a handler invoked when the clipboard read fails.
   */
  onError(handler: ClipboardErrorHandler): void;

  /**
   * Read the clipboard once without starting the monitor loop.
   * Returns null if the clipboard is empty or inaccessible.
   */
  readOnce(): Promise<ClipboardEntry | null>;

  /**
   * Returns the live state snapshot of the monitor.
   */
  getState(): ClipboardListenerState;

  /**
   * Resets cumulative counters (captured, dedup) without stopping
   * the monitor. Useful for session resets.
   */
  resetCounters(): void;
}
