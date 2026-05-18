// ─────────────────────────────────────────────────────────────
// VALUE OBJECTS
// ─────────────────────────────────────────────────────────────

export type KnownIDE =
  | "vscode"
  | "intellij"
  | "pycharm"
  | "goland"
  | "webstorm"
  | "rider"
  | "vim"
  | "neovim"
  | "emacs"
  | "sublime"
  | "atom"
  | "unknown";

export type KnownBrowser =
  | "chrome"
  | "firefox"
  | "edge"
  | "safari"
  | "brave"
  | "arc"
  | "unknown";

export interface WindowContextProps {
  id?: number;
  processName: string;
  processId?: number | null;
  windowTitle?: string | null;
  executablePath?: string | null;
  workingDirectory?: string | null;
  activeUrl?: string | null;
  capturedAt?: Date;
}

// ─────────────────────────────────────────────────────────────
// ENTITY
// Represents the OS window/process state at the exact instant
// a snippet was captured. Immutable after construction.
// ─────────────────────────────────────────────────────────────

export class WindowContextEntity {
  readonly id?: number;
  readonly processName: string;
  readonly processId: number | null;
  readonly windowTitle: string | null;
  readonly executablePath: string | null;
  readonly workingDirectory: string | null;
  readonly activeUrl: string | null;
  readonly capturedAt: Date;

  private constructor(props: WindowContextProps) {
    this.id = props.id;
    this.processName = props.processName;
    this.processId = props.processId ?? null;
    this.windowTitle = props.windowTitle ?? null;
    this.executablePath = props.executablePath ?? null;
    this.workingDirectory = props.workingDirectory ?? null;
    this.activeUrl = props.activeUrl ?? null;
    this.capturedAt = props.capturedAt ?? new Date();
  }

  // ── Factory ──────────────────────────────────────────────────

  static create(props: WindowContextProps): WindowContextEntity {
    if (!props.processName || props.processName.trim().length === 0) {
      throw new Error("WindowContextEntity: processName is required");
    }
    return new WindowContextEntity(props);
  }

  static reconstitute(props: Required<WindowContextProps>): WindowContextEntity {
    return new WindowContextEntity(props);
  }

  // ── Classification heuristics ────────────────────────────────

  classifyIDE(): KnownIDE {
    const proc = this.processName.toLowerCase();
    if (proc.includes("code") || proc.includes("vscode")) return "vscode";
    if (proc.includes("pycharm")) return "pycharm";
    if (proc.includes("goland")) return "goland";
    if (proc.includes("webstorm")) return "webstorm";
    if (proc.includes("rider")) return "rider";
    if (proc.includes("idea") || proc.includes("intellij")) return "intellij";
    if (proc.includes("vim") && !proc.includes("neovim")) return "vim";
    if (proc.includes("nvim") || proc.includes("neovim")) return "neovim";
    if (proc.includes("emacs")) return "emacs";
    if (proc.includes("sublime")) return "sublime";
    return "unknown";
  }

  classifyBrowser(): KnownBrowser | null {
    const proc = this.processName.toLowerCase();
    if (proc.includes("chrome")) return "chrome";
    if (proc.includes("firefox")) return "firefox";
    if (proc.includes("msedge") || proc.includes("edge")) return "edge";
    if (proc.includes("safari")) return "safari";
    if (proc.includes("brave")) return "brave";
    if (proc.includes("arc")) return "arc";
    return null; // not a browser
  }

  isBrowser(): boolean {
    return this.classifyBrowser() !== null;
  }

  isIDE(): boolean {
    return this.classifyIDE() !== "unknown";
  }

  /** Human-readable label derived from process name */
  get appLabel(): string {
    const name = this.processName
      .replace(/\.(exe|app|bin)$/i, "")
      .replace(/[-_]/g, " ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
