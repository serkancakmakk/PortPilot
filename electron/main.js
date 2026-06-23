"use strict";

// Serkanzilla masaüstü (Electron) giriş noktası.
// Express sunucusunu yerel bir portta başlatır ve bir pencere içinde açar.
// macOS · Windows · Linux için electron-builder ile paketlenir.

const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");

// Kayıtlı sunucular paket içindeki salt-okunur asar'a değil, yazılabilir
// kullanıcı veri klasörüne kaydedilsin. (server.js require edilmeden ÖNCE ayarla.)
process.env.SERKANZILLA_DATA_DIR = app.getPath("userData");

const { startServer } = require("../server.js");

let mainWindow = null;
let httpServer = null;

// GitHub deposu (güncelleme denetimi için)
const REPO = "serkancakmakk/Serkanzilla";

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// En son yayımlanan sürümü GitHub'dan sorgula, mevcut sürümle karşılaştır
async function checkForUpdate() {
  const current = app.getVersion();
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Serkanzilla" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    const hasUpdate = latest && cmpVersion(latest, current) > 0;
    return { ok: true, current, latest, hasUpdate, url: data.html_url || `https://github.com/${REPO}/releases/latest` };
  } catch (e) {
    return { ok: false, current, error: e.message, url: `https://github.com/${REPO}/releases/latest` };
  }
}

// Renderer (web arayüzü) ile köprü
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:check-update", () => checkForUpdate());
ipcMain.handle("app:open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});

async function createWindow() {
  // 0 → işletim sistemi boş bir port seçsin (çakışma olmaz)
  const { server, port } = await startServer(0);
  httpServer = server;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#eef1f6",
    title: "Serkanzilla",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dış bağlantılar (varsa) sistem tarayıcısında açılsın
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  // Sağ tık menüsü: kes/kopyala/yapıştır/tümünü seç (her platformda çalışır)
  mainWindow.webContents.on("context-menu", (_e, params) => {
    const { editFlags, isEditable, selectionText } = params;
    const items = [];
    if (isEditable || selectionText) {
      items.push({ role: "cut", enabled: isEditable && editFlags.canCut });
      items.push({ role: "copy", enabled: editFlags.canCopy });
      if (isEditable) items.push({ role: "paste", enabled: editFlags.canPaste });
      items.push({ type: "separator" });
      items.push({ role: "selectAll" });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Sade bir uygulama menüsü (kopyala/yapıştır kısayolları için Edit menüsü şart)
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    {
      label: "Düzen",
      submenu: [
        { label: "Geri Al", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Yinele", accelerator: isMac ? "Shift+CmdOrCtrl+Z" : "CmdOrCtrl+Y", role: "redo" },
        { type: "separator" },
        { label: "Kes", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Kopyala", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Yapıştır", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Tümünü Seç", accelerator: "CmdOrCtrl+A", role: "selectAll" },
      ],
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  try { httpServer && httpServer.close(); } catch (_) {}
  if (process.platform !== "darwin") app.quit();
});
