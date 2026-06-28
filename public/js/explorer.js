import { $, showLoading, toast, escapeHtml, escapeAttr } from "./dom.js";
import { icon, iconFor } from "./icons.js";
import { api } from "./api.js";
import {
  session,
  cwd, history, allItems, currentItems, fileFilter, showHidden,
  selectedItem, viewMode, diskInfo, sortKey, sortDir,
  setCwd, setHistory, setAllItems, setCurrentItems, setFileFilter,
  setShowHidden, setSelectedItem, setDiskInfo, setViewMode, setSort, pushTransfer,
} from "./state.js";

// ---- Format yardımcıları ----
export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1, n = bytes;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
}

export function fmtDate(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function typeLabel(item) {
  if (item.type === "dir") return "Klasör";
  if (item.type === "link") return "Bağlantı";
  const ext = item.name.split(".").pop().toUpperCase();
  return ext === item.name.toUpperCase() ? "Dosya" : ext + " dosyası";
}

export function joinPath(base, name) {
  return (base.endsWith("/") ? base : base + "/") + name;
}

// ---- Gezinme ----
export async function navigate(target, pushHistory = true) {
  showLoading(true);
  try {
    const data = await api("list?path=" + encodeURIComponent(target));
    if (pushHistory && cwd !== data.path) setHistory([...history, cwd]);
    setCwd(data.path);
    renderBreadcrumb();
    setAllItems(data.items);
    if ($("file-search")) $("file-search").value = "";
    setFileFilter("");
    applyFileView();
    const { highlightQuick } = await import("./sidebar.js");
    highlightQuick();
    $("btn-back").disabled = history.length === 0;
    $("btn-up").disabled = cwd === "/";
    fetchDisk(cwd);
  } catch (err) {
    toast(err.message, true);
  } finally {
    showLoading(false);
  }
}

// ---- Breadcrumb ----
function renderBreadcrumb() {
  const bc = $("breadcrumb");
  bc.innerHTML = "";
  const parts = cwd.split("/").filter(Boolean);
  const root = document.createElement("span");
  root.className = "crumb";
  root.innerHTML = icon("server") + " /";
  root.onclick = () => navigate("/");
  bc.appendChild(root);
  let acc = "";
  parts.forEach((p) => {
    acc += "/" + p;
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.innerHTML = icon("chevron-right", "sep-ico");
    bc.appendChild(sep);
    const c = document.createElement("span");
    c.className = "crumb";
    c.textContent = p;
    const path = acc;
    c.onclick = () => navigate(path);
    bc.appendChild(c);
  });
}

// ---- Disk ----
export async function fetchDisk(target) {
  setDiskInfo(null);
  const { renderSideDisk } = await import("./sidebar.js");
  renderSideDisk();
  try {
    setDiskInfo(await api("disk?path=" + encodeURIComponent(target)));
  } catch (_) {
    setDiskInfo(null);
  }
  renderSideDisk();
}

// ---- Sıralama ----
function sortItems(items) {
  const dir = sortDir === "desc" ? -1 : 1;
  const rank = (i) => (i.type === "dir" ? 0 : i.type === "link" ? 1 : 2);
  const coll = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });
  return [...items].sort((a, b) => {
    // Klasörler her zaman üstte (yöne bakmaksızın)
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    let c = 0;
    if (sortKey === "size") c = (a.size || 0) - (b.size || 0);
    else if (sortKey === "mtime") c = (a.mtime || 0) - (b.mtime || 0);
    else if (sortKey === "type") c = coll.compare(typeLabel(a), typeLabel(b));
    else c = coll.compare(a.name, b.name);
    if (c === 0 && sortKey !== "name") c = coll.compare(a.name, b.name);
    return c * dir;
  });
}

// Başlık tıklamasıyla sırala: aynı sütun yönü çevirir, farklı sütun asc başlar
export function sortBy(key) {
  if (sortKey === key) setSort(key, sortDir === "asc" ? "desc" : "asc");
  else setSort(key, "asc");
  applyFileView();
}

function updateSortHeaders() {
  document.querySelectorAll(".file-table thead th[data-sort]").forEach((th) => {
    const active = th.dataset.sort === sortKey;
    th.classList.toggle("sorted", active);
    th.setAttribute("aria-sort", active ? (sortDir === "asc" ? "ascending" : "descending") : "none");
    const ind = th.querySelector(".sort-ind");
    if (ind) ind.textContent = active ? (sortDir === "asc" ? "▲" : "▼") : "";
  });
}

// ---- Dosya listesi ----
export function applyFileView() {
  let items = allItems;
  if (!showHidden) items = items.filter((i) => !i.name.startsWith("."));
  const q = fileFilter.trim().toLowerCase();
  if (q) items = items.filter((i) => i.name.toLowerCase().includes(q));
  items = sortItems(items);
  updateSortHeaders();
  renderList(items);
}

export function renderList(items) {
  setCurrentItems(items);
  setSelectedItem(null);
  const grid = viewMode === "grid";
  document.querySelector(".file-table").hidden = grid;
  $("grid").hidden = !grid;
  $("empty").hidden = items.length > 0;
  if (grid) renderGrid(items); else renderTable(items);
  syncCheckState();
}

function renderTable(items) {
  const tbody = $("file-list");
  tbody.innerHTML = "";
  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = item.type;
    tr.innerHTML = `
      <td class="c-check"><input type="checkbox" class="row-check" /></td>
      <td class="c-name"><span class="icon">${iconFor(item)}</span><span class="fname"></span></td>
      <td class="c-date">${fmtDate(item.mtime)}</td>
      <td class="c-type">${typeLabel(item)}</td>
      <td class="c-size">${item.type === "file" ? fmtSize(item.size) : ""}</td>`;
    tr.querySelector(".fname").textContent = item.name;
    wireEntry(tr, item);
    tbody.appendChild(tr);
  });
}

function renderGrid(items) {
  const g = $("grid");
  g.innerHTML = "";
  items.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "tile " + item.type;
    tile.innerHTML = `
      <input type="checkbox" class="row-check" />
      <div class="tile-icon">${iconFor(item)}</div>
      <div class="tile-name"></div>`;
    tile.querySelector(".tile-name").textContent = item.name;
    wireEntry(tile, item);
    g.appendChild(tile);
  });
}

function wireEntry(el, item) {
  const cb = el.querySelector(".row-check");
  cb._item = item;
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => { el.classList.toggle("checked", cb.checked); syncCheckState(); });
  // Sürükleyip masaüstüne/bir klasöre bırakarak indir (Chrome/Electron DownloadURL).
  el.draggable = true;
  el.addEventListener("dragstart", (e) => dragOut(e, item));
  el.addEventListener("click", () => selectEl(el, item));
  el.addEventListener("dblclick", () => openItem(item));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    selectEl(el, item);
    import("./context-menu.js").then((m) => m.showContextMenu(e, item));
  });
}

// Sürükle-bırakla indirme: bırakılınca tarayıcı/Electron, DownloadURL'i indirir.
// Klasörler .tar.gz olarak akıtılır (download-folder), dosyalar doğrudan.
function dragOut(e, item) {
  try {
    const full = joinPath(cwd, item.name);
    let url, fname;
    if (item.type === "dir") {
      fname = item.name + ".tar.gz";
      url = "/api/download-folder?session=" + encodeURIComponent(session) + "&path=" + encodeURIComponent(full);
    } else {
      fname = item.name;
      url = "/api/download?session=" + encodeURIComponent(session) + "&path=" + encodeURIComponent(full);
    }
    const abs = new URL(url, location.origin).href;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("DownloadURL", `application/octet-stream:${fname}:${abs}`);
    e.dataTransfer.setData("text/uri-list", abs);
  } catch (_) {}
}

export function selectEl(el, item) {
  $("file-area").querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
  el.classList.add("selected");
  setSelectedItem(item);
  updateStatus();
}

export function checkedItems() {
  return Array.from($("file-area").querySelectorAll(".row-check"))
    .filter((cb) => cb.checked)
    .map((cb) => cb._item);
}

// ---- Sunucuda arama sonuçları (overlay) ----
export function showSearchResults(query, items, truncated) {
  let ov = $("search-results");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "search-results";
    ov.className = "sr-overlay";
    document.body.appendChild(ov);
  }
  const rows = (items || []).map((it) => {
    const parent = it.path.replace(/\/[^/]+$/, "") || "/";
    return `<div class="sr-row" data-path="${escapeAttr(it.path)}" data-parent="${escapeAttr(parent)}" data-type="${it.type}">
      <span class="sr-ico">${it.type === "dir" ? "📁" : it.type === "link" ? "🔗" : "📄"}</span>
      <span class="sr-name">${escapeHtml(it.name)}</span>
      <span class="sr-path">${escapeHtml(it.path)}</span>
    </div>`;
  }).join("");
  ov.innerHTML = `<div class="sr-box">
    <div class="sr-head"><b>“${escapeHtml(query)}” sonuçları (${(items || []).length}${truncated ? "+" : ""})</b><button type="button" class="sr-close" title="Kapat">✕</button></div>
    <div class="sr-list">${rows || '<div class="sr-empty">Sonuç yok.</div>'}</div>
  </div>`;
  ov.hidden = false;
  ov.querySelector(".sr-close").onclick = () => { ov.hidden = true; };
  ov.onclick = (e) => { if (e.target === ov) ov.hidden = true; };
  ov.querySelectorAll(".sr-row").forEach((r) => {
    r.onclick = () => {
      ov.hidden = true;
      navigate(r.dataset.type === "dir" ? r.dataset.path : r.dataset.parent);
    };
  });
}

// İçerik araması (grep) sonuçları: dosya · satır · eşleşen metin; tıkla → düzenleyicide aç
export function showContentResults(query, items, truncated) {
  let ov = $("search-results");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "search-results";
    ov.className = "sr-overlay";
    document.body.appendChild(ov);
  }
  const rows = (items || []).map((it) => {
    const parent = it.path.replace(/\/[^/]+$/, "") || "/";
    return `<div class="sr-row sr-crow" data-path="${escapeAttr(it.path)}" data-parent="${escapeAttr(parent)}" data-line="${it.line}">
      <span class="sr-ico">📄</span>
      <span class="sr-cmain">
        <span class="sr-cline"><b>${escapeHtml(it.name)}</b> <span class="sr-cln">:${it.line}</span> <span class="sr-cpath">${escapeHtml(it.path)}</span></span>
        <code class="sr-ctext">${escapeHtml(it.text || "")}</code>
      </span>
    </div>`;
  }).join("");
  ov.innerHTML = `<div class="sr-box">
    <div class="sr-head"><b>“${escapeHtml(query)}” içerik sonuçları (${(items || []).length}${truncated ? "+" : ""})</b><button type="button" class="sr-close" title="Kapat">✕</button></div>
    <div class="sr-list">${rows || '<div class="sr-empty">Eşleşme yok.</div>'}</div>
  </div>`;
  ov.hidden = false;
  ov.querySelector(".sr-close").onclick = () => { ov.hidden = true; };
  ov.onclick = (e) => { if (e.target === ov) ov.hidden = true; };
  ov.querySelectorAll(".sr-crow").forEach((r) => {
    r.onclick = () => {
      ov.hidden = true;
      const path = r.dataset.path;
      const name = path.split("/").pop();
      import("./editor.js").then((m) => m.editFile({ name, type: "file" }, path));
    };
  });
}

export function syncCheckState() {
  const rows = $("file-area").querySelectorAll(".row-check");
  const checked = $("file-area").querySelectorAll(".row-check:checked");
  const all = $("check-all");
  if (all) {
    all.checked = rows.length > 0 && checked.length === rows.length;
    all.indeterminate = checked.length > 0 && checked.length < rows.length;
  }
  updateStatus();
}

function updateStatus() {
  const dirs = currentItems.filter((i) => i.type === "dir").length;
  const files = currentItems.filter((i) => i.type !== "dir").length;
  const nChecked = $("file-area").querySelectorAll(".row-check:checked").length;
  const sb = $("statusbar");
  sb.innerHTML = "";
  const left = document.createElement("span");
  left.textContent = `${currentItems.length} öğe (${dirs} klasör, ${files} dosya)`;
  sb.appendChild(left);
  if (nChecked) {
    const sel = document.createElement("span");
    sel.className = "sel";
    sel.textContent = `${nChecked} öğe seçili`;
    sb.appendChild(sel);
  }
}

// ---- Dosya açma / düzenleme ----
const TEXT_EXT = new Set([
  "txt","md","markdown","log","csv","tsv","ini","conf","cfg","cnf","config","env","properties",
  "json","json5","xml","yml","yaml","toml","html","htm","css","scss","sass","less",
  "js","mjs","cjs","ts","tsx","jsx","vue","svelte","py","rb","php","pl","lua",
  "sh","bash","zsh","fish","c","h","cpp","hpp","cc","cs","java","kt","go","rs","swift",
  "sql","r","dart","gitignore","dockerfile","makefile","gradle","bat","ps1","htaccess","service","nginx",
]);
const TEXT_NAMES = new Set([
  ".bashrc",".bash_profile",".bash_history",".profile",".zshrc",".gitconfig",
  ".vimrc",".npmrc",".env",".gitignore","dockerfile","makefile",".wget-hsts","authorized_keys","known_hosts",
]);

export function isEditable(name) {
  const lower = name.toLowerCase();
  if (TEXT_NAMES.has(lower)) return true;
  const ext = lower.includes(".") ? lower.split(".").pop() : "";
  return TEXT_EXT.has(ext);
}

export function openItem(item) {
  const full = joinPath(cwd, item.name);
  if (item.type === "dir" || item.type === "link") navigate(full);
  else if (isEditable(item.name)) import("./editor.js").then((m) => m.editFile(item, full));
  else downloadFile(full);
}

// ---- İndirme ----
export function triggerDownload(url) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  try {
    const q = new URL(url, location.origin).searchParams;
    const p = q.get("path") || q.get("dir") || "";
    const name = p ? (p.split("/").filter(Boolean).pop() || p) : "indirme";
    pushTransfer({ type: "download", label: name, bytes: 0, time: Date.now() });
  } catch (_) {}
}

export function downloadFile(fullPath) {
  triggerDownload("/api/download?session=" + encodeURIComponent(session) + "&path=" + encodeURIComponent(fullPath));
}

export function downloadFolder(fullPath) {
  toast("Klasör arşivleniyor, indirme birazdan başlayacak...");
  triggerDownload("/api/download-folder?session=" + encodeURIComponent(session) + "&path=" + encodeURIComponent(fullPath));
}

export function downloadItem(item) {
  const full = joinPath(cwd, item.name);
  if (item.type === "dir") downloadFolder(full); else downloadFile(full);
}
