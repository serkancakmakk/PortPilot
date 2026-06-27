"use strict";

// Web arayüzüne güvenli bir köprü açar (contextIsolation açık).
// Yalnızca masaüstü (Electron) çalışırken window.desktop tanımlı olur.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  version: () => ipcRenderer.invoke("app:version"),
  checkUpdate: (opts) => ipcRenderer.invoke("app:check-update", opts || {}),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  // Bir File nesnesinin kullanıcının diskindeki gerçek (mutlak) yolunu döndürür.
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return ""; }
  },
  // Yerel bir klasörü/dosyayı sistem dosya yöneticisinde aç.
  openPath: (p) => ipcRenderer.invoke("fs:open-path", p),
  // Uygulama içi yerel gezgin: ev klasörü ve klasör listeleme.
  homeDir: () => ipcRenderer.invoke("fs:home"),
  listDir: (p) => ipcRenderer.invoke("fs:list", p),
  // Bir URL'yi (uzak dosya indirme ucu) yerel bir klasöre kaydet — çift panel
  // "Soldan al" (sunucu → bu bilgisayar) için.
  downloadToDir: (url, dir, name) => ipcRenderer.invoke("fs:download", { url, dir, name }),
  // Biyometrik (macOS Touch ID) — uygulama kilidi için
  biometricAvailable: () => ipcRenderer.invoke("lock:biometric-available"),
  biometricPrompt: (reason) => ipcRenderer.invoke("lock:biometric-prompt", reason),
  // Dış uygulamada düzenle → otomatik geri yükle
  // editStart({url,name}) → {ok,id,localPath}; her kayıtta onEditChange tetiklenir.
  editStart: (opts) => ipcRenderer.invoke("edit:start", opts),
  editStop: (id) => ipcRenderer.invoke("edit:stop", id),
  editStopAll: () => ipcRenderer.invoke("edit:stopAll"),
  onEditChange: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("edit:change", handler);
    return () => ipcRenderer.removeListener("edit:change", handler);
  },
  // Güncelleme olaylarını dinle (available/downloading/downloaded/latest/error)
  onUpdate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("update:event", handler);
    return () => ipcRenderer.removeListener("update:event", handler);
  },
});
