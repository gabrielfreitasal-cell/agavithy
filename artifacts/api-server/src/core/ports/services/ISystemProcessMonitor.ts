// ─────────────────────────────────────────────────────────────
// PORT: ISystemProcessMonitor
//
// Outbound port for OS-level window & process inspection.
// Queries the foreground window at a point in time to determine
// which application the user was working in when a capture
// event occurred.
//
// In production (Electron/Tauri):
//   Uses Windows UI Automation API, macOS Accessibility API,
//   or X11/Wayland via native bindings.
//
// In web/dev environments:
//   Returns a simulated/stub context (always marked as simulated).
// ─────────────────────────────────────────────────────────────

export interface ActiveWindowInfo {
  /** OS process name, e.g. "Code.exe", "chrome.exe" */
  processName: string;

  /** OS process ID */
  processId: number;

  /** Full window title string */
  windowTitle: string;

  /** Full path to the executable */
  executablePath: string;

  /** Current working directory of the process (if accessible) */
  workingDirectory: string | null;

  /** For browser processes: active tab URL (requires accessibility) */
  activeUrl: string | null;

  /** True when this info was simulated (no native API available) */
  isSimulated: boolean;
}

export interface ProcessSnapshot {
  /** All visible/running processes at the moment of the snapshot */
  processes: Array<{
    processId: number;
    processName: string;
    windowTitle: string | null;
    isActive: boolean;
  }>;
  capturedAt: Date;
}

export interface ISystemProcessMonitor {
  /**
   * Returns information about the currently active foreground window.
   * Never throws — returns a simulated stub if the native API is
   * unavailable, with `isSimulated: true`.
   */
  getActiveWindow(): Promise<ActiveWindowInfo>;

  /**
   * Captures a lightweight snapshot of all running processes.
   * Useful for activity auditing.
   */
  snapshotProcesses(): Promise<ProcessSnapshot>;

  /**
   * Returns true if the monitor has access to the native
   * accessibility/window-management APIs of the current OS.
   */
  isNativeAccessAvailable(): boolean;

  /**
   * Registers a listener that fires whenever the active window changes.
   * Only meaningful in native environments; no-op in web mode.
   */
  onWindowChange(
    handler: (info: ActiveWindowInfo) => void | Promise<void>
  ): void;

  /**
   * Removes all previously registered window-change listeners.
   */
  removeAllListeners(): void;
}
