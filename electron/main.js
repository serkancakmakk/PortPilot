"use strict";

// Serkanzilla masaüstü (Electron) giriş noktası.
// Express sunucusunu yerel bir portta başlatır ve bir pencere içinde açar.
// macOS · Windows · Linux için electron-builder ile paketlenir.

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { startServer } = require("../server.js");

let mainWindow = null;
let httpServer = null;

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
    },
  });

  // Dış bağlantılar (varsa) sistem tarayıcısında açılsın
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://localhost:${port}`);

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
    { role: "editMenu" },
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
