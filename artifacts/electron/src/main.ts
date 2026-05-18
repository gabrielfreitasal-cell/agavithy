import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  clipboard,
  ipcMain,
  shell,
  Notification,
} from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";

// ─── Config ───────────────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== "production";
const FRONTEND_URL = IS_DEV
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "../agavity/dist/public/index.html")}`;
const API_PORT = process.env.PORT || "8080";
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://agavity:agavity123@localhost:5432/agavity";

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiProcess: ChildProcess | null = null;
let clipboardWatcher: NodeJS.Timeout | null = null;
let lastClipboardText = "";
let isQuitting = false;

// ─── API Server ───────────────────────────────────────────────────────────────
function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const apiServerPath = path.join(
      __dirname,
      "../../api-server/dist/index.mjs"
    );

    // Em dev, verifica se a API já está rodando antes de subir outra
    fetch(`http://localhost:${API_PORT}/api/health`)
      .then((res) => {
        if (res.ok) {
          console.log("[Agavity] API already running, skipping auto-start");
          resolve();
          return;
        }
        launchApiProcess(apiServerPath, resolve, reject);
      })
      .catch(() => {
        // API não está rodando — sobe ela
        launchApiProcess(apiServerPath, resolve, reject);
      });
  });
}

function launchApiProcess(
  apiServerPath: string,
  resolve: () => void,
  reject: (err: Error) => void
) {
  if (!fs.existsSync(apiServerPath)) {
    console.warn("[Agavity] API server dist not found — skipping auto-start");
    resolve();
    return;
  }

  apiProcess = spawn("node", ["--enable-source-maps", apiServerPath], {
    env: {
      ...process.env,
      NODE_ENV: IS_DEV ? "development" : "production",
      PORT: API_PORT,
      DATABASE_URL: DB_URL,
    },
    stdio: "pipe",
  });

  apiProcess.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString();
    console.log("[API]", msg.trim());
    if (msg.includes("Server listening")) resolve();
  });

  apiProcess.stderr?.on("data", (data: Buffer) => {
    console.error("[API Error]", data.toString().trim());
  });

  apiProcess.on("error", reject);

  // Timeout de segurança
  setTimeout(resolve, 5000);
}

// ─── Clipboard Watcher ────────────────────────────────────────────────────────
function startClipboardWatcher() {
  lastClipboardText = clipboard.readText();

  clipboardWatcher = setInterval(() => {
    const current = clipboard.readText();
    if (current && current !== lastClipboardText && current.trim().length > 0) {
      lastClipboardText = current;
      console.log("[Clipboard] New content detected:", current.slice(0, 60));

      // Envia para o frontend via IPC
      mainWindow?.webContents.send("clipboard:new", {
        content: current,
        timestamp: new Date().toISOString(),
        source: "clipboard",
      });

      // Auto-salva via API
      autoSaveSnippet(current);
    }
  }, 1000); // Verifica a cada 1 segundo
}

async function autoSaveSnippet(content: string) {
  try {
    const res = await fetch(`http://localhost:${API_PORT}/api/snippets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        source: "clipboard",
        title: null,
        language: detectLanguage(content),
        tags: [],
      }),
    });
    if (res.ok) {
      console.log("[Clipboard] Snippet auto-saved");
    }
  } catch (err) {
    console.error("[Clipboard] Failed to auto-save:", err);
  }
}

function detectLanguage(text: string): string {
  if (/^\s*(import|export|const|let|var|function|class)\s/.test(text))
    return "javascript";
  if (/^\s*(def |class |import |from |if __name__)/.test(text))
    return "python";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|FROM)\s/i.test(text)) return "sql";
  if (/^\s*<[a-zA-Z]/.test(text)) return "html";
  if (/<\?php/.test(text)) return "php";
  if (/^\s*(fn |use |let |pub |struct |impl )/.test(text)) return "rust";
  return "plaintext";
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  // Ícone inline (16x16 PNG em base64 — substituir por ícone real depois)
  const iconBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADSSURBVDiNY2AYBUMHMDIy/mdiYPiPjBlIYEYGBgYGVmq5gBgwMzD8Z2RkZGBhYGBg+M/AwMDAwMCATp6BgYGBgYGBgYGBgYGBgYFheHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYGAAAAP//AwCUGgXbHkI4AAAAAElFTkSuQmCC";

  const icon = nativeImage.createFromDataURL(
    `data:image/png;base64,${iconBase64}`
  );

  tray = new Tray(icon);
  tray.setToolTip("Agavity — Context Engine");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Agavity",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "📋 Abrir Dashboard",
      click: () => showMainWindow(),
    },
    {
      label: "📎 Snippets",
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send("navigate", "/snippets");
      },
    },
    { type: "separator" },
    {
      label: "🔴 Clipboard Monitor: Ativo",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => showMainWindow());
}

// ─── Main Window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d1117",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "../agavity/public/favicon.svg"),
  });

  mainWindow.loadURL(FRONTEND_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (IS_DEV) mainWindow?.webContents.openDevTools({ mode: "detach" });
  });

  // Minimiza para bandeja ao invés de fechar
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      new Notification({
        title: "Agavity",
        body: "Rodando em segundo plano. Clique no ícone da bandeja para abrir.",
      }).show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Frontend pedindo para abrir URL no browser externo
  ipcMain.handle("shell:openExternal", (_, url: string) => {
    shell.openExternal(url);
  });

  // Frontend pedindo o conteúdo atual do clipboard
  ipcMain.handle("clipboard:read", () => {
    return clipboard.readText();
  });

  // Frontend pedindo para escrever no clipboard
  ipcMain.handle("clipboard:write", (_, text: string) => {
    clipboard.writeText(text);
  });

  // Status do monitor de clipboard
  ipcMain.handle("clipboard:status", () => {
    return { active: clipboardWatcher !== null };
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  console.log("[Agavity] Starting...");

  // Impede múltiplas instâncias
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => showMainWindow());

  // Setup IPC antes de criar janela
  setupIPC();

  // Inicia o servidor de API em background
  console.log("[Agavity] Starting API server...");
  await startApiServer();
  console.log("[Agavity] API server ready");

  // Cria a janela principal
  createMainWindow();

  // Cria o ícone na bandeja do sistema
  createTray();

  // Inicia o monitor de clipboard
  startClipboardWatcher();
  console.log("[Agavity] Clipboard watcher active");

  console.log("[Agavity] Ready! 🚀");
});

app.on("window-all-closed", () => {
  // No macOS mantém o app aberto mesmo sem janelas
  if (process.platform !== "darwin") {
    // Não encerra — continua na bandeja
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;

  // Para o watcher
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher);
    clipboardWatcher = null;
  }

  // Para a API
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
});
