// Uygulama içi yerel (bilgisayar) gezgini — yalnızca masaüstü/Electron.
// "Klasör Seç" ile alt ekranda açılır; kullanıcı diski gezer, çoklu klasör/dosya
// seçip yükleyebilir, manuel yol yazabilir veya öğeleri yükleme alanına sürükleyebilir.
import { $, toast } from "./dom.js";
import { applyIcons, iconFor } from "./icons.js";
import { cwd, session } from "./state.js";
import { navigate } from "./explorer.js";
import { askUploadOptions } from "./upload.js";
import { rememberLocalPaths } from "./recent-local.js";

export const LOCAL_DT_TYPE = "application/x-portpilot-local";

function isDesktopApp() {
  return !!(window.desktop && window.desktop.isDesktop && window.desktop.listDir);
}

let curPath = null;
let curParent = null;
let lxView = localStorage.getItem("lxView") || "list"; // "list" | "grid"
const selected = new Set(); // seçili mutlak yollar

function applyView() {
  const list = $("lx-list");
  if (list) list.classList.toggle("grid", lxView === "grid");
  const btn = $("lx-view");
  if (btn) {
    // Liste görünümündeyken ızgaraya, ızgaradayken listeye geçiş ikonu göster
    btn.innerHTML = `<span class="nav-ico-wrap" data-icon="${lxView === "grid" ? "list" : "grid"}"></span>`;
    applyIcons(btn);
  }
}

function joinPath(dir, name) {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export async function openLocalExplorer() {
  if (!isDesktopApp()) return false;
  const box = $("local-explorer");
  if (!box) return false;
  box.hidden = false;
  if (!curPath) {
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
  selected.clear();
  $("lx-path").value = curPath;
  renderList(r.entries);
  applyView();
  updateFoot();
}

function renderList(entries) {
  const listEl = $("lx-list");
  listEl.innerHTML = "";
  if (!entries.length) {
    listEl.innerHTML = '<div class="lx-empty">Bu klasör boş.</div>';
    return;
  }
  for (const ent of entries) {
    const abs = joinPath(curPath, ent.name);
    const row = document.createElement("div");
    row.className = "lx-item";
    row.draggable = true;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "lx-check";
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(abs); else selected.delete(abs);
      row.classList.toggle("sel", cb.checked);
      updateFoot();
    });

    const ico = document.createElement("span");
    ico.className = "nav-ico-wrap";
    ico.innerHTML = ent.isDir ? iconFor({ type: "dir", name: ent.name }) : iconFor({ type: "file", name: ent.name });

    const nm = document.createElement("span");
    nm.className = "lx-name";
    nm.textContent = ent.name;

    row.appendChild(cb);
    row.appendChild(ico);
    row.appendChild(nm);

    // Klasöre çift/tek tık → içine gir; dosyada → seç.
    row.addEventListener("dblclick", () => { if (ent.isDir) listDir(abs); });
    row.addEventListener("click", () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); });

    // Sürükle-bırak: yükleme alanına bırakılınca işlenecek yolu taşı.
    row.addEventListener("dragstart", (e) => {
      const paths = selected.size ? [...selected] : [abs];
      e.dataTransfer.setData(LOCAL_DT_TYPE, JSON.stringify(paths));
      e.dataTransfer.effectAllowed = "copy";
    });

    listEl.appendChild(row);
  }
}

function updateFoot() {
  const info = $("lx-info");
  const btn = $("lx-upload");
  const n = selected.size;
  if (info) info.textContent = n
    ? `${n} öğe seçili → ${cwd}`
    : "Klasörleri/dosyaları seç ya da yukarıdaki yükleme alanına sürükle.";
  if (btn) btn.disabled = !n;
}

// Seçili (ya da verilen) yerel yolları sunucudaki güncel dizine yükler; seçenek sorar.
export async function uploadLocalPaths(paths) {
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return;
  const names = paths.map((p) => p.split(/[\\/]/).filter(Boolean).pop());
  const opts = await askUploadOptions([], `${paths.length} öğe (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}) → ${cwd}`);
  if (!opts) return; // iptal

  rememberLocalPaths(paths); // yüklenenleri son kullanılanlara da ekle
  $("lx-info").textContent = "Yükleniyor…";
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
        if (o.done != null && total) $("lx-info").textContent = `Yükleniyor… %${Math.round((o.done / total) * 100)}`;
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
  if ($("lx-upload")) $("lx-upload").addEventListener("click", () => uploadLocalPaths([...selected]));
  if ($("lx-view")) $("lx-view").addEventListener("click", () => {
    lxView = lxView === "grid" ? "list" : "grid";
    localStorage.setItem("lxView", lxView);
    applyView();
  });
  applyView();
}
