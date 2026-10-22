import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pos", {
  version: "2.2.4",
  copilotQuery: (payload: any) => ipcRenderer.invoke("ai-copilot-query", payload),
  copilotStatus: (apiUrl?: string) => ipcRenderer.invoke("ai-copilot-status", apiUrl),
});
