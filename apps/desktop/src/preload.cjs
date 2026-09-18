const { contextBridge } = require("electron");

const { ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pos", {
  version: "1.1.0",
  saveInvoicePdf: (title) => ipcRenderer.invoke("save-invoice-pdf", title),
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  activateLicense: (token) => ipcRenderer.invoke("activate-license", token),
});
