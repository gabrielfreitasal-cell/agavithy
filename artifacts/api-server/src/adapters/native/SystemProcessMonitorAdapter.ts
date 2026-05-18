import type {
  ISystemProcessMonitor,
  ActiveWindowInfo,
  ProcessSnapshot,
} from "../../core/ports/services/ISystemProcessMonitor";

// ─────────────────────────────────────────────────────────────
// ADAPTER: SystemProcessMonitorAdapter
//
// Implements ISystemProcessMonitor.
//
// In production (Electron/Windows):
//   Use node-ffi-nasm or the @paymoapp/active-win package to call
//   GetForegroundWindow() → GetWindowText() → GetProcessId()
//   and QueryFullProcessImageName() from user32.dll / kernel32.dll.
//   No elevated permissions required for the foreground query.
//
// In production (Electron/macOS):
//   Use the macOS Accessibility API via the active-win npm package.
//
// In production (Tauri):
//   Use the tauri-plugin-process or a custom Rust command exposed
//   via tauri::command! to query the OS window manager.
//
// In web/server environments (current):
//   Returns a clearly labelled simulation stub so the capture
//   pipeline keeps working without native access.
// ─────────────────────────────────────────────────────────────

type WindowChangeHandler = (info: ActiveWindowInfo) => void | Promise<void>;

export class SystemProcessMonitorAdapter implements ISystemProcessMonitor {
  private _changeHandlers: WindowChangeHandler[] = [];
  private _nativeAvailable = false;

  constructor() {
    this._nativeAvailable = this._detectNativeAccess();
  }

  async getActiveWindow(): Promise<ActiveWindowInfo> {
    if (this._nativeAvailable) {
      return this._getNativeActiveWindow();
    }
    return this._getSimulatedWindow();
  }

  async snapshotProcesses(): Promise<ProcessSnapshot> {
    // In a real Electron environment, enumerate windows via
    // BrowserWindow.getAllWindows() + child_process list.
    return {
      processes: [
        {
          processId: process.pid,
          processName: "api-server",
          windowTitle: "Agavity API Server",
          isActive: true,
        },
      ],
      capturedAt: new Date(),
    };
  }

  isNativeAccessAvailable(): boolean {
    return this._nativeAvailable;
  }

  onWindowChange(handler: WindowChangeHandler): void {
    this._changeHandlers.push(handler);
  }

  removeAllListeners(): void {
    this._changeHandlers = [];
  }

  // ── Internal helpers ──────────────────────────────────────────

  private _detectNativeAccess(): boolean {
    // Detect if we're running inside Electron's main process
    try {
      const isElectron =
        typeof process !== "undefined" &&
        typeof process.versions === "object" &&
        !!process.versions.electron;
      return isElectron;
    } catch {
      return false;
    }
  }

  /**
   * Native implementation placeholder.
   *
   * ELECTRON: Replace body with:
   *   const activeWin = await import("active-win");
   *   const win = await activeWin.default();
   *   if (!win) return this._getSimulatedWindow();
   *   return {
   *     processName: win.owner.name,
   *     processId: win.owner.processId,
   *     windowTitle: win.title,
   *     executablePath: win.owner.path,
   *     workingDirectory: null,
   *     activeUrl: (win as any).url ?? null,
   *     isSimulated: false,
   *   };
   */
  private async _getNativeActiveWindow(): Promise<ActiveWindowInfo> {
    return this._getSimulatedWindow();
  }

  private _getSimulatedWindow(): ActiveWindowInfo {
    return {
      processName: "Simulated.exe",
      processId: process.pid,
      windowTitle: "Agavity — Simulated Window Context",
      executablePath: process.execPath,
      workingDirectory: process.cwd(),
      activeUrl: null,
      isSimulated: true,
    };
  }
}
