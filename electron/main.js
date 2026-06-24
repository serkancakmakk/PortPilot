"use strict";

// PortPilot masaüstü (Electron) giriş noktası.
// Express sunucusunu yerel bir portta başlatır ve bir pencere içinde açar.
// macOS · Windows · Linux için electron-builder ile paketlenir.

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

// Linux'ta paketlenmiş uygulamada chrome-sandbox çoğu kez SUID/izin sorunundan
// uygulamanın hiç açılmamasına yol açar; bu platformda sandbox'ı kapat.
if (process.platform === "linux") {
  // CachyOS/Arch gibi sistemlerde JS'den eklenen --no-sandbox switch'i sandbox
  // kararı için ÇOK GEÇ uygulanır; bayrak gerçek komut satırında olmalı.
  // Yoksa onu ekleyip uygulamayı bir kez yeniden başlat → kullanıcının elle
  // "--no-sandbox" yazmasına gerek kalmaz (hem dev hem paketli build için).
  const argv = process.argv.slice(1);
  if (!argv.includes("--no-sandbox")) {
    app.relaunch({ args: argv.concat("--no-sandbox") });
    app.exit(0);
  }
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  // /dev/shm erişilemiyor/izinsizse renderer çöker (beyaz ekran) → /tmp kullan.
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  // Wayland (CachyOS/Arch/GNOME/KDE) oturumlarında Electron yanlış backend seçip
  // beyaz ekranda kalabilir → doğru ozone platformunu (wayland/x11) otomatik seç.
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  // Wayland'da pencere dekorasyonu/çizim sorunlarını azaltır.
  app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");
  // GPU/derleyici çakışması sık sık beyaz ekrana yol açar → yazılım render.
  app.disableHardwareAcceleration();
}

// Chromium paylaşımlı belleği (shared memory) önce /dev/shm, sonra geçici klasörde
// (/tmp ya da $TMPDIR) oluşturur. Bazı ortamlarda /tmp erişilemez olabilir
// ("No such process" / W_OK|X_OK) → garanti yazılabilir bir klasöre yönlendir.
// Renderer/GPU süreçleri doğmadan ÖNCE ayarlanmalı.
try {
  const safeTmp = path.join(app.getPath("userData"), "tmp");
  fs.mkdirSync(safeTmp, { recursive: true });
  process.env.TMPDIR = safeTmp;
  app.setPath("temp", safeTmp);
} catch (_) {}

// Çökme günlüğü: açılış dahil her yakalanmayan hatayı dosyaya yaz (uzaktan teşhis için).
function logCrash(tag, err) {
  const msg = `[${new Date().toISOString()}] ${tag}: ${(err && err.stack) || err}\n`;
  try { fs.appendFileSync(path.join(app.getPath("userData"), "portpilot-crash.log"), msg); } catch (_) {}
  try { fs.appendFileSync(path.join(app.getPath("temp"), "portpilot-crash.log"), msg); } catch (_) {}
  try { console.error(msg); } catch (_) {}
}
process.on("uncaughtException", (err) => { logCrash("uncaughtException", err); try { dialog.showErrorBox("PortPilot hatası", String((err && err.stack) || err)); } catch (_) {} });
process.on("unhandledRejection", (err) => { logCrash("unhandledRejection", err); });

// Kayıtlı sunucular paket içindeki salt-okunur asar'a değil, yazılabilir
// kullanıcı veri klasörüne kaydedilsin. (server.js require edilmeden ÖNCE ayarla.)
process.env.PORTPILOT_DATA_DIR = app.getPath("userData");

const { startServer } = require("../server.js");

let mainWindow = null;
let httpServer = null;

// GitHub deposu (güncelleme denetimi için)
const REPO = "serkancakmakk/PortPilot";

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// En güncel yayımlanan sürümü GitHub'dan sorgula, mevcut sürümle karşılaştır.
// /releases/latest yalnızca "latest" işaretli sürümü döndürür ve ön-sürümleri
// (prerelease) atlar; bu yüzden tüm yayımlanmış sürümleri listeleyip en yükseğini seçiyoruz.
async function checkForUpdate() {
  const current = app.getVersion();
  const fallbackUrl = `https://github.com/${REPO}/releases/latest`;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "PortPilot" },
    });
    if (!res.ok) {
      const hint = res.status === 403 ? "GitHub API limiti (kısa süre sonra tekrar deneyin)" : "HTTP " + res.status;
      throw new Error(hint);
    }
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error("Beklenmeyen yanıt");
    // Yalnızca taslak olmayanlar; en yüksek sürümü bul
    const published = list.filter((r) => r && !r.draft && r.tag_name);
    if (!published.length) {
      return { ok: true, current, latest: null, hasUpdate: false, url: fallbackUrl };
    }
    let best = published[0];
    for (const r of published) {
      if (cmpVersion(r.tag_name.replace(/^v/, ""), best.tag_name.replace(/^v/, "")) > 0) best = r;
    }
    const latest = best.tag_name.replace(/^v/, "");
    const hasUpdate = cmpVersion(latest, current) > 0;
    return { ok: true, current, latest, hasUpdate, url: best.html_url || fallbackUrl };
  } catch (e) {
    return { ok: false, current, error: e.message, url: fallbackUrl };
  }
}

// ---- Otomatik güncelleme (electron-updater) ----
// Paketlenmiş uygulamada güncellemeyi indirip kurar. Geliştirme (npm) modunda
// app-update.yml bulunmadığından electron-updater çalışmaz; GitHub API ile yalnızca bilgi veririz.
let updaterWired = false;
let lastCheckSilent = false;

function sendUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:event", payload);
  }
}

function wireAutoUpdater() {
  if (updaterWired) return;
  updaterWired = true;
  autoUpdater.autoDownload = false;          // indirmeyi kullanıcı onaylasın
  autoUpdater.autoInstallOnAppQuit = true;   // indirildiyse çıkışta sessizce kur

  autoUpdater.on("update-available", async (info) => {
    sendUpdate({ state: "available", version: info.version });
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["İndir", "Daha sonra"],
      defaultId: 0,
      cancelId: 1,
      title: "Güncelleme var",
      message: `Yeni sürüm hazır: v${info.version}`,
      detail: "Şimdi indirilsin mi? İndikten sonra tek tıkla kurabilirsin.",
    });
    if (response === 0) {
      sendUpdate({ state: "downloading", percent: 0 });
      autoUpdater.downloadUpdate().catch((e) => sendUpdate({ state: "error", error: String(e && e.message || e) }));
    }
  });

  autoUpdater.on("update-not-available", () => sendUpdate({ state: "latest", silent: lastCheckSilent }));
  autoUpdater.on("download-progress", (p) => sendUpdate({ state: "downloading", percent: Math.round(p.percent || 0) }));

  autoUpdater.on("update-downloaded", async (info) => {
    sendUpdate({ state: "downloaded", version: info.version });
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Yeniden başlat ve kur", "Sonra"],
      defaultId: 0,
      cancelId: 1,
      title: "Güncelleme indirildi",
      message: `v${info.version} kurulmaya hazır`,
      detail: "Kurulum için uygulama şimdi yeniden başlatılsın mı?",
    });
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });

  autoUpdater.on("error", (err) => {
    sendUpdate({ state: "error", error: String(err && err.message || err), silent: lastCheckSilent });
  });
}

// Renderer (web arayüzü) ile köprü
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:open-external", (_e, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});

// Kullanıcının kendi bilgisayarındaki bir klasörü/dosyayı sistem dosya
// yöneticisinde aç. Geçersiz yol → boş string döner (shell.openPath hata mesajı).
ipcMain.handle("fs:open-path", async (_e, p) => {
  if (typeof p !== "string" || !p) return "Geçersiz yol";
  try {
    if (!fs.existsSync(p)) return "Klasör bulunamadı (taşınmış ya da silinmiş olabilir)";
  } catch (_) {}
  return await shell.openPath(p); // başarılıysa "" döner
});

// Güncelleme denetle: paketliyse electron-updater, değilse GitHub API bilgisi
ipcMain.handle("app:check-update", async (_e, opts) => {
  const silent = !!(opts && opts.silent);
  lastCheckSilent = silent;
  if (!app.isPackaged) {
    // Geliştirme modu: yalnızca bilgi (indirip kuramayız)
    const r = await checkForUpdate();
    return { ...r, packaged: false };
  }
  try {
    wireAutoUpdater();
    autoUpdater.checkForUpdates(); // sonuç olayları (update:event) ile akar
    return { ok: true, packaged: true, current: app.getVersion() };
  } catch (e) {
    return { ok: false, packaged: true, current: app.getVersion(), error: e.message };
  }
});

async function createWindow() {
  // 0 → işletim sistemi boş bir port seçsin (çakışma olmaz)
  let port;
  try {
    const started = await startServer(0, "127.0.0.1");
    httpServer = started.server;
    port = started.port;
  } catch (e) {
    dialog.showErrorBox(
      "PortPilot başlatılamadı",
      "Yerel sunucu başlatılamadı:\n\n" + (e && e.stack || e) + "\n\nLütfen bu hatayı bildirin."
    );
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#eef1f6",
    title: "PortPilot",
    icon: path.join(__dirname, "..", "public", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dış bağlantılar (varsa) sistem tarayıcısında açılsın
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  // localhost bazı Linux kurulumlarında ::1'e (IPv6) çözümlenip sunucuya (IPv4)
  // ulaşamaz → beyaz ekran. 127.0.0.1 ile bu belirsizliği önle.
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (code === -3) return; // ERR_ABORTED — genelde zararsız
    logCrash("did-fail-load", `${code} ${desc} ${url}`);
    dialog.showErrorBox("Arayüz yüklenemedi", `Hata ${code}: ${desc}\n${url}`);
  });

  // Renderer çökerse (beyaz ekran) günlüğe yaz
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    logCrash("render-process-gone", JSON.stringify(details));
  });

  // Beyaz ekran teşhisi: renderer konsolundaki hata/uyarıları ve yükleme
  // olaylarını da günlüğe yaz (çökme olmasa bile JS/modül hatasını yakalar).
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) logCrash("renderer-console", `${message}  (${sourceId}:${line})`);
  });
  mainWindow.webContents.on("preload-error", (_e, preloadPath, err) => {
    logCrash("preload-error", `${preloadPath}: ${(err && err.stack) || err}`);
  });
  mainWindow.webContents.on("did-finish-load", () => logCrash("did-finish-load", "ok"));
  // PORTPILOT_DEBUG=1 ile başlatınca DevTools otomatik açılır (konsolu canlı gör).
  if (process.env.PORTPILOT_DEBUG === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

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
  createWindow().catch((e) => {
    dialog.showErrorBox("PortPilot hatası", String(e && e.stack || e));
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  try { httpServer && httpServer.close(); } catch (_) {}
  if (process.platform !== "darwin") app.quit();
});
