// Uygulama içi yerel (bilgisayar) gezgini — yalnızca masaüstü/Electron.
// "Klasör Seç" ile alt ekranda açılır; kullanıcı diski gezer, çoklu klasör/dosya
// seçip yükleyebilir, manuel yol yazabilir veya öğeleri yükleme alanına sürükleyebilir.
import { $, toast } from "./dom.js";
import { applyIcons, iconFor } from "./icons.js";
import { cwd, session } from "./state.js";
import { navigate, fmtSize, fmtDate } from "./explorer.js";
import { askUploadOptions } from "./upload.js";
import { rememberLocalPaths, renderRecentLocal } from "./recent-local.js";
import { recordLocalPath, getLocalPathForHost, renderLocalLast } from "./local-last.js";

export const LOCAL_DT_TYPE = "application/x-portpilot-local";

function isDesktopApp() {
  return !!(window.desktop && window.desktop.isDesktop && window.desktop.listDir);
}

let curPath = null;
let curParent = null;
let curEntries = [];                 // [{ abs, name, isDir }]
let lxView = localStorage.getItem("lxView") || "list"; // "list" | "grid"
const selected = new Map();          // abs → isDir

function applyView() {
  const list = $("lx-list");
  if (list) list.classList.toggle("grid", lxView === "grid");
  const btn = $("lx-view");
  if (btn) {
    btn.innerHTML = `<span class="nav-ico-wrap" data-icon="${lxView === "grid" ? "list" : "grid"}"></span>`;
    applyIcons(btn);
  }
}

function joinPath(dir, name) {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

// Seçimden hatırlanacak KLASÖRLERİ üretir: seçili klasörler + (dosya seçildiyse
// içinde bulunulan klasör). Böylece tek tek dosyalar "son klasörler"i kirletmez.
function foldersToRemember(items, dir) {
  const set = new Set();
  let anyFile = false;
  for (const it of items) { if (it.isDir) set.add(it.path); else anyFile = true; }
  if (anyFile && dir) set.add(dir);
  return [...set];
}

export async function openLocalExplorer(startPath) {
  if (!isDesktopApp()) return false;
  const box = $("local-explorer");
  if (!box) return false;
  box.hidden = false;
  // Kalabalığı azalt: gezgin açıkken alttaki panelleri gizle.
  const rl = $("recent-local");
  if (rl) rl.hidden = true;
  const ll = $("local-last");
  if (ll) ll.hidden = true;
  // Açılış yolu: verilen yol > bu sunucu için kayıtlı son yerel yol > mevcut > ev.
  const start = startPath || (!curPath ? getLocalPathForHost() : "");
  if (start) await listDir(start);
  else if (!curPath) {
    let home = "/";
    try { home = await window.desktop.homeDir(); } catch (_) {}
    await listDir(home);
  }
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return true;
}

function closeExplorer() {
  const box = $("local-explorer");
  if (box) box.hidden = true;
  renderRecentLocal(); // panelleri geri getir (içerik varsa)
  renderLocalLast();
}

async function listDir(dir) {
  let r;
  try { r = await window.desktop.listDir(dir); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    toast("Klasör açılamadı: " + ((r && r.error) || "bilinmeyen hata"), true);
    return;
  }
  curPath = r.path;
  curParent = r.parent;
  curEntries = r.entries.map((e) => ({ abs: joinPath(curPath, e.name), name: e.name, isDir: e.isDir, size: e.size || 0, mtime: e.mtime || 0 }));
  selected.clear();
  $("lx-path").value = curPath;
  renderList();
  applyView();
  updateFoot();
  recordLocalPath(curPath); // bu sunucu için son yerel konumu hatırla
}

function renderList() {
  const listEl = $("lx-list");
  listEl.innerHTML = "";
  if (!curEntries.length) {
    listEl.innerHTML = '<div class="lx-empty">Bu klasör boş.</div>';
    return;
  }
  for (const ent of curEntries) {
    const abs = ent.abs;
    const row = document.createElement("div");
    row.className = "lx-item" + (selected.has(abs) ? " sel" : "");
    row.draggable = true;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "lx-check";
    cb.checked = selected.has(abs);
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) selected.set(abs, ent.isDir); else selected.delete(abs);
      row.classList.toggle("sel", cb.checked);
      updateFoot();
    });

    const ico = document.createElement("span");
    ico.className = "nav-ico-wrap";
    ico.innerHTML = iconFor({ type: ent.isDir ? "dir" : "file", name: ent.name });

    const nm = document.createElement("span");
    nm.className = "lx-name";
    nm.textContent = ent.name;

    const date = document.createElement("span");
    date.className = "lx-date";
    date.textContent = ent.mtime ? fmtDate(ent.mtime) : "";

    const size = document.createElement("span");
    size.className = "lx-size";
    size.textContent = ent.isDir ? "—" : fmtSize(ent.size);

    row.appendChild(cb);
    row.appendChild(ico);
    row.appendChild(nm);
    row.appendChild(date);
    row.appendChild(size);

    row.addEventListener("dblclick", () => { if (ent.isDir) listDir(abs); });
    row.addEventListener("click", () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); });

    // Sürükle-bırak: yolları ve hatırlanacak klasörleri taşı.
    row.addEventListener("dragstart", (e) => {
      const items = selected.size
        ? [...selected].map(([p, isDir]) => ({ path: p, isDir }))
        : [{ path: abs, isDir: ent.isDir }];
      const payload = { paths: items.map((i) => i.path), folders: foldersToRemember(items, curPath) };
      e.dataTransfer.setData(LOCAL_DT_TYPE, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    });

    listEl.appendChild(row);
  }
}

function allSelected() {
  return curEntries.length > 0 && curEntries.every((e) => selected.has(e.abs));
}

function setSelectAll(on) {
  selected.clear();
  if (on) for (const e of curEntries) selected.set(e.abs, e.isDir);
  renderList();
  updateFoot();
}

function updateFoot() {
  const info = $("lx-info");
  const btn = $("lx-upload");
  const cb = $("lx-selall-cb");
  const n = selected.size;
  if (info) info.textContent = n
    ? `${n} öğe seçili → ${cwd}`
    : "Klasörleri/dosyaları seç ya da yukarıdaki yükleme alanına sürükle.";
  if (btn) btn.disabled = !n;
  if (cb) {
    cb.disabled = !curEntries.length;
    cb.checked = allSelected();
    cb.indeterminate = n > 0 && !cb.checked; // bazıları seçili
  }
}

// Verilen yolları sunucudaki güncel dizine yükler; seçenek sorar. rememberFolders
// verilirse yalnızca onlar "son klasörler"e eklenir (dosyalar kirletmez).
export async function uploadLocalPaths(paths, rememberFolders) {
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return;
  const names = paths.map((p) => p.split(/[\\/]/).filter(Boolean).pop());
  const opts = await askUploadOptions([], `${paths.length} öğe (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}) → ${cwd}`);
  if (!opts) return; // iptal

  rememberLocalPaths(rememberFolders || []); // yalnızca klasörleri hatırla
  if ($("lx-info")) $("lx-info").textContent = "Yükleniyor…";
  try {
    const res = await fetch("/api/upload-local", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { "x-session": session } : {}) },
      body: JSON.stringify({ path: cwd, localPaths: paths, conflict: opts.conflict, concurrency: opts.concurrency }),
    });
    if (res.status === 401) { import("./connections.js").then((m) => m.logout()); throw new Error("Oturum doldu."); }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", total = 0, last = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim(); if (!t) continue;
        let o; try { o = JSON.parse(t); } catch (_) { continue; }
        if (o.total != null) total = o.total;
        if (o.done != null && total && $("lx-info")) $("lx-info").textContent = `Yükleniyor… %${Math.round((o.done / total) * 100)}`;
        if (o.ok || o.error) last = o;
      }
    }
    if (buf.trim()) { try { last = JSON.parse(buf.trim()); } catch (_) {} }

    if (last && last.error) toast(last.error, true);
    else {
      const c = (last && last.count) || 0;
      const extra = last && last.skipped ? `, ${last.skipped} atlandı` : "";
      toast(`Yüklendi (${c} dosya${extra})`);
      navigate(cwd);
    }
  } catch (e) {
    toast(e.message || "Yükleme başarısız", true);
  } finally {
    updateFoot();
  }
}

function uploadSelected() {
  const items = [...selected].map(([p, isDir]) => ({ path: p, isDir }));
  uploadLocalPaths(items.map((i) => i.path), foldersToRemember(items, curPath));
}

export function initLocalExplorer() {
  if (!$("local-explorer")) return;
  if ($("lx-close")) $("lx-close").addEventListener("click", closeExplorer);
  if ($("lx-up")) $("lx-up").addEventListener("click", () => { if (curParent) listDir(curParent); });
  if ($("lx-refresh")) $("lx-refresh").addEventListener("click", () => { if (curPath) listDir(curPath); });
  if ($("lx-home")) $("lx-home").addEventListener("click", async () => {
    let home = "/"; try { home = await window.desktop.homeDir(); } catch (_) {}
    listDir(home);
  });
  const go = () => { const v = $("lx-path").value.trim(); if (v) listDir(v); };
  if ($("lx-go")) $("lx-go").addEventListener("click", go);
  if ($("lx-path")) $("lx-path").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  if ($("lx-selall-cb")) $("lx-selall-cb").addEventListener("change", (e) => setSelectAll(e.target.checked));
  if ($("lx-upload")) $("lx-upload").addEventListener("click", uploadSelected);
  if ($("lx-view")) $("lx-view").addEventListener("click", () => {
    lxView = lxView === "grid" ? "list" : "grid";
    localStorage.setItem("lxView", lxView);
    applyView();
  });
  applyView();
}
