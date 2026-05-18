import { contextBridge, ipcRenderer } from "electron";

// Expõe APIs seguras para o frontend via window.agavity
contextBridge.exposeInMainWorld("agavity", {
  // Clipboard
  clipboard: {
    read: () => ipcRenderer.invoke("clipboard:read"),
    write: (text: string) => ipcRenderer.invoke("clipboard:write", text),
    status: () => ipcRenderer.invoke("clipboard:status"),
    onNew: (callback: (data: { content: string; timestamp: string; source: string }) => void) => {
      ipcRenderer.on("clipboard:new", (_, data) => callback(data));
    },
  },
  // Navegação
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on("navigate", (_, path) => callback(path));
  },
  // Shell
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  // Info
  isDesktop: true,
  version: "0.1.0",
});
