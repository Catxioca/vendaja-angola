const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pos", {
  version: "2.2.2",
  // Isolated HTML-based print & export engine
  printHtmlDocument: (html, options) => ipcRenderer.invoke("print-html-document", html, options),
  exportPdfDocument: (title, html, options) => ipcRenderer.invoke("export-pdf-document", title, html, options),
  savePrintDebugDump: (docNumber, html, meta) => ipcRenderer.invoke("save-print-debug-dump", docNumber, html, meta),
  // Legacy compatibility handlers
  saveInvoicePdf: (title, format) => ipcRenderer.invoke("save-invoice-pdf", title, format),
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  printDocument: (options) => ipcRenderer.invoke("print-document", options),
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  getHardwareId: () => ipcRenderer.invoke("get-hardware-id"),
  activateLicense: (token, targetType) => ipcRenderer.invoke("activate-license", token, targetType),
  logLicenseAudit: (event, details) => ipcRenderer.invoke("log-license-audit", event, details),
  getServerConfig: () => ipcRenderer.invoke("get-server-config"),
  saveServerConfig: (config) => ipcRenderer.invoke("save-server-config", config),
  testServerConnection: (apiUrl) => ipcRenderer.invoke("test-server-connection", apiUrl),
  checkLiveUpdates: (apiUrl) => ipcRenderer.invoke("check-live-updates", apiUrl),
  syncLiveConfig: (apiUrl) => ipcRenderer.invoke("sync-live-config", apiUrl),
});
