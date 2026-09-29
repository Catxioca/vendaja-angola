const { contextBridge } = require("electron");

const { ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pos", {
  version: "1.1.0",
  saveInvoicePdf: (title) => ipcRenderer.invoke("save-invoice-pdf", title),
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  activateLicense: (token) => ipcRenderer.invoke("activate-license", token),
  getServerConfig: () => ipcRenderer.invoke("get-server-config"),
  saveServerConfig: (config) => ipcRenderer.invoke("save-server-config", config),
  testServerConnection: (apiUrl) => ipcRenderer.invoke("test-server-connection", apiUrl),
});
