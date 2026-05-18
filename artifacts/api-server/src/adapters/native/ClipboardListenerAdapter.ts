import crypto from "crypto";
import type {
  IClipboardListener,
  ClipboardEntry,
  ClipboardChangeHandler,
  ClipboardErrorHandler,
  ClipboardListenerOptions,
  ClipboardListenerState,
} from "../../core/ports/services/IClipboardListener";

// ─────────────────────────────────────────────────────────────
// ADAPTER: ClipboardListenerAdapter
//
// Implements IClipboardListener for web/server environments.
// In production (Electron), replace the _readRaw() method with:
//   const { clipboard } = require("electron");
//   return clipboard.readText();
// In production (Tauri), use:
//   import { readText } from "@tauri-apps/plugin-clipboard-manager";
//
// The polling loop, deduplication, and event dispatch logic
// remain identical across all environments — only _readRaw changes.
// ─────────────────────────────────────────────────────────────

export class ClipboardListenerAdapter implements IClipboardListener {
  private _changeHandlers: ClipboardChangeHandler[] = [];
  private _errorHandlers: ClipboardErrorHandler[] = [];
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _state: ClipboardListenerState = {
    isMonitoring: false,
    capturedCount: 0,
    dedupCount: 0,
    lastCapturedAt: null,
    lastContentHash: null,
  };

  // ── Public API ────────────────────────────────────────────────

  start(options: ClipboardListenerOptions = {}): void {
    if (this._state.isMonitoring) return;

    const intervalMs = options.intervalMs ?? 500;
    const minLength = options.minLength ?? 3;
    const dedup = options.deduplicateConsecutive !== false;

    this._state.isMonitoring = true;

    this._timer = setInterval(async () => {
      try {
        const raw = await this._readRaw();
        if (!raw || raw.length < minLength) return;

        const hash = this._hash(raw);
        if (dedup && hash === this._state.lastContentHash) {
          this._state.dedupCount++;
          return;
        }

        const entry: ClipboardEntry = {
          content: raw,
          contentHash: hash,
          capturedAt: new Date(),
          mimeType: "text/plain",
        };

        this._state.lastContentHash = hash;
        this._state.lastCapturedAt = entry.capturedAt;
        this._state.capturedCount++;

        for (const handler of this._changeHandlers) {
          await handler(entry);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        for (const handler of this._errorHandlers) {
          handler(error);
        }
      }
    }, intervalMs);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._state.isMonitoring = false;
  }

  onChange(handler: ClipboardChangeHandler): void {
    this._changeHandlers.push(handler);
  }

  onError(handler: ClipboardErrorHandler): void {
    this._errorHandlers.push(handler);
  }

  async readOnce(): Promise<ClipboardEntry | null> {
    try {
      const raw = await this._readRaw();
      if (!raw || raw.trim().length === 0) return null;
      return {
        content: raw,
        contentHash: this._hash(raw),
        capturedAt: new Date(),
        mimeType: "text/plain",
      };
    } catch {
      return null;
    }
  }

  getState(): ClipboardListenerState {
    return { ...this._state };
  }

  resetCounters(): void {
    this._state.capturedCount = 0;
    this._state.dedupCount = 0;
  }

  // ── Internal helpers ──────────────────────────────────────────

  private _hash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Platform-specific clipboard read.
   *
   * WEB/SERVER (current):  Simulated — always returns null so the monitor
   *                         is active but requires manual triggers via
   *                         the /api/clipboard/capture endpoint.
   *
   * ELECTRON (replace with):
   *   const { clipboard } = require("electron");
   *   return clipboard.readText() || null;
   *
   * TAURI (replace with):
   *   const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
   *   return await readText();
   */
  protected async _readRaw(): Promise<string | null> {
    // Simulation: no native clipboard access in server context.
    // Content arrives via POST /api/clipboard/capture.
    return null;
  }
}
