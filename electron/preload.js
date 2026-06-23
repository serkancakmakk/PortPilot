"use strict";

// Web arayüzüne güvenli bir köprü açar (contextIsolation açık).
// Yalnızca masaüstü (Electron) çalışırken window.desktop tanımlı olur.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  version: () => ipcRenderer.invoke("app:version"),
  checkUpdate: (opts) => ipcRenderer.invoke("app:check-update", opts || {}),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  // Güncelleme olaylarını dinle (available/downloading/downloaded/latest/error)
  onUpdate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("update:event", handler);
    return () => ipcRenderer.removeListener("update:event", handler);
  },
});
