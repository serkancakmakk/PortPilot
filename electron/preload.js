"use strict";

// Web arayüzüne güvenli bir köprü açar (contextIsolation açık).
// Yalnızca masaüstü (Electron) çalışırken window.desktop tanımlı olur.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  version: () => ipcRenderer.invoke("app:version"),
  checkUpdate: () => ipcRenderer.invoke("app:check-update"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
});
