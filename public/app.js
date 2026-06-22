"use strict";

let session = null;
let cwd = "/";
let homePath = "/";
const history = [];
const $ = (id) => document.getElementById(id);

// ---------- API yardımcıları ----------
async function api(pathName, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  if (session) headers["x-session"] = session;
  if (opts.json) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }
  let res;
  try {
    res = await fetch("/api/" + pathName, Object.assign({}, opts, { headers }));
  } catch (_) {
    throw new Error("Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm start).");
  }
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  if (!res.ok) {
    let msg = "Hata " + res.status;
    if (isJson) { try { msg = (await res.json()).error || msg; } catch (_) {} }
    if (res.status === 401) { logout(); }
    throw new Error(msg);
  }
  if (!isJson) return res;
  const text = await res.text();
  if (!text) return {}; // boş gövde → boş nesne (kriptik JSON hatası olmasın)
  try { return JSON.parse(text); }
  catch (_) { throw new Error("Sunucudan geçersiz yanıt alındı."); }
}

function showLoading(on) { $("loading").hidden = !on; }
function toast(msg, isErr) {
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ---------- Bağlantı ekranı ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.auth;
    document.querySelector('[data-pane="password"]').hidden = mode !== "password";
    document.querySelector('[data-pane="key"]').hidden = mode !== "key";
  });
});

$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector(".connect-btn");
  $("login-error").textContent = "";
  btn.disabled = true; btn.textContent = "Bağlanıyor...";
  try {
    const body = {
      host: f.host.value.trim(),
      port: f.port.value.trim() || 22,
      username: f.username.value.trim(),
      password: f.password.value,
      privateKey: f.privateKey.value,
      passphrase: f.passphrase.value,
    };
    let r;
    try {
      r = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (_) {
      throw new Error("Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm start).");
    }
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch (_) { throw new Error("Sunucudan geçersiz yanıt: " + (text.slice(0, 120) || "boş yanıt")); }
    if (!r.ok) throw new Error(data.error || ("Bağlanılamadı (HTTP " + r.status + ")"));
    session = data.session;
    maybeSaveServer(body); // istenirse sunucuyu kaydet
    const i = data.info;
    $("conn-info").innerHTML =
      `<span class="dot"></span>🖧 <b>${i.username}@${i.host}</b><span class="port">:${i.port}</span>`;
    $("conn-info").title = `Bağlı: ${i.username}@${i.host}:${i.port}`;
    $("login").hidden = true;
    $("explorer").hidden = false;
    history.length = 0;
    homePath = data.home || "/";
    renderQuickLinks();
    navigate(homePath, false);
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Bağlan";
  }
});

function logout() {
  if (session) { api("disconnect", { method: "POST" }).catch(() => {}); }
  session = null;
  $("explorer").hidden = true;
  $("login").hidden = false;
  $("save-server").checked = false;
  $("save-pass").checked = false;
  $("save-pass-row").hidden = true;
  $("save-name").value = "";
  renderSavedServers();
}

$("btn-disconnect").addEventListener("click", logout);

// ---------- Kayıtlı sunucular (sunucudaki servers.json dosyasında kalıcı) ----------
let savedServers = [];

// "Bu sunucuyu kaydet" işaretliyse parola seçeneğini göster
$("save-server").addEventListener("change", (e) => {
  $("save-pass-row").hidden = !e.target.checked;
});

// Başarılı bağlantıdan sonra çağrılır → dosyaya kaydeder
async function maybeSaveServer(body) {
  if (!$("save-server").checked) return;
  const savePass = $("save-pass").checked;
  const isKey = !!(body.privateKey && body.privateKey.trim());
  const server = {
    name: ($("save-name").value.trim()) || `${body.username}@${body.host}`,
    host: body.host, port: body.port, username: body.username,
    auth: isKey ? "key" : "password",
    // Kimlik bilgileri yalnızca kullanıcı isterse saklanır
    password: savePass && !isKey ? body.password : "",
    privateKey: savePass && isKey ? body.privateKey : "",
    passphrase: savePass && isKey ? body.passphrase : "",
  };
  try { await api("servers", { method: "POST", json: server }); }
  catch (e) { console.warn("Sunucu kaydedilemedi:", e.message); }
}

async function renderSavedServers() {
  try {
    const data = await api("servers");
    savedServers = data.servers || [];
  } catch (_) { savedServers = []; }
  const servers = savedServers;
  const wrap = $("saved-wrap");
  const list = $("saved-list");
  wrap.hidden = servers.length === 0;
  list.innerHTML = "";
  servers.forEach((s) => {
    const hasCreds = !!(s.password || s.privateKey);
    const el = document.createElement("div");
    el.className = "saved-item";
    el.innerHTML = `
      <span class="si-ico">🖥️</span>
      <div class="si-body">
        <div class="si-name"></div>
        <div class="si-sub"></div>
      </div>
      <span class="si-lock" title="${hasCreds ? "Kimlik bilgisi kayıtlı" : "Bağlanırken parola istenir"}">${hasCreds ? "🔓" : "🔒"}</span>
      <button type="button" class="si-del" title="Sil">×</button>`;
    el.querySelector(".si-name").textContent = s.name;
    el.querySelector(".si-sub").textContent = `${s.username}@${s.host}:${s.port} • ${s.auth === "key" ? "SSH anahtarı" : "parola"}`;
    el.addEventListener("click", () => selectServer(s));
    el.querySelector(".si-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`"${s.name}" kaydı silinsin mi?`)) return;
      try { await api("servers/" + encodeURIComponent(s.id), { method: "DELETE" }); }
      catch (err) { toast(err.message, true); }
      renderSavedServers();
    });
    list.appendChild(el);
  });
  if (servers.length) {
    const div = document.createElement("div");
    div.className = "saved-divider";
    div.textContent = "veya yeni bağlantı";
    list.appendChild(div);
  }
}

// Kayıtlı sunucuyu forma doldur; kimlik bilgisi varsa direkt bağlan
function selectServer(s) {
  const f = $("connect-form");
  f.host.value = s.host;
  f.port.value = s.port;
  f.username.value = s.username;
  f.password.value = s.password || "";
  f.privateKey.value = s.privateKey || "";
  f.passphrase.value = s.passphrase || "";
  // Doğru kimlik sekmesini seç
  document.querySelector(`.tab[data-auth="${s.auth}"]`).click();
  const hasCreds = !!(s.password || s.privateKey);
  if (hasCreds) {
    f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true }));
  } else {
    (s.auth === "key" ? f.privateKey : f.password).focus();
    $("login-error").textContent = "Bu sunucu için " + (s.auth === "key" ? "anahtar" : "parola") + " girin.";
  }
}

renderSavedServers();

// ---------- Gezinme ----------
async function navigate(target, pushHistory = true) {
  showLoading(true);
  try {
    const data = await api("list?path=" + encodeURIComponent(target));
    if (pushHistory && cwd !== data.path) history.push(cwd);
    cwd = data.path;
    renderBreadcrumb();
    renderList(data.items);
    highlightQuick();
    $("btn-back").disabled = history.length === 0;
    $("btn-up").disabled = cwd === "/";
    fetchDisk(cwd); // disk doluluk oranını arka planda güncelle
  } catch (err) {
    toast(err.message, true);
  } finally {
    showLoading(false);
  }
}

// ---------- Kenar çubuğu hızlı erişim ----------
function renderQuickLinks() {
  const links = [
    { icon: "🏠", label: "Ana Dizin", path: homePath },
    { icon: "🖥️", label: "Kök (/)", path: "/" },
    { icon: "📦", label: "/var", path: "/var" },
    { icon: "⚙️", label: "/etc", path: "/etc" },
    { icon: "🗂️", label: "/tmp", path: "/tmp" },
  ];
  // Ana dizin "/" ise tekrarı önle
  const seen = new Set();
  const nav = $("quick-links");
  nav.innerHTML = "";
  links.forEach((l) => {
    if (seen.has(l.path)) return;
    seen.add(l.path);
    const a = document.createElement("a");
    a.dataset.path = l.path;
    a.innerHTML = `<span class="q-ico">${l.icon}</span> ${l.label}`;
    a.onclick = () => navigate(l.path);
    nav.appendChild(a);
  });
  highlightQuick();
}
function highlightQuick() {
  $("quick-links").querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.path === cwd);
  });
}

function renderBreadcrumb() {
  const bc = $("breadcrumb");
  bc.innerHTML = "";
  const parts = cwd.split("/").filter(Boolean);
  const root = document.createElement("span");
  root.className = "crumb"; root.textContent = "🖥 /";
  root.onclick = () => navigate("/");
  bc.appendChild(root);
  let acc = "";
  parts.forEach((p) => {
    acc += "/" + p;
    const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "›";
    bc.appendChild(sep);
    const c = document.createElement("span");
    c.className = "crumb"; c.textContent = p;
    const path = acc;
    c.onclick = () => navigate(path);
    bc.appendChild(c);
  });
}

// ---- SVG ikon sistemi (emoji yerine tutarlı, şık ikonlar) ----
function folderSVG(back, front) {
  return `<svg viewBox="0 0 48 48" class="ic">
    <path d="M5 13a4 4 0 0 1 4-4h10l4 4h16a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${back}"/>
    <path d="M5 19h38v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${front}"/>
  </svg>`;
}
function fileSVG(body, corner, label) {
  const tag = label
    ? `<text x="24" y="36" font-size="11" font-weight="700" text-anchor="middle" fill="#fff" font-family="Segoe UI,Arial">${label}</text>`
    : "";
  return `<svg viewBox="0 0 48 48" class="ic">
    <path d="M12 3h17l11 11v28a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" fill="${body}"/>
    <path d="M29 3l11 11h-8a3 3 0 0 1-3-3z" fill="${corner}"/>
    ${tag}
  </svg>`;
}

// uzantı → kategori
const EXT_CAT = {
  image: ["jpg","jpeg","png","gif","svg","webp","bmp","ico","tiff","heic"],
  video: ["mp4","mkv","avi","mov","webm","flv","wmv","m4v"],
  audio: ["mp3","wav","flac","aac","ogg","m4a","opus"],
  archive: ["zip","tar","gz","tgz","rar","7z","bz2","xz"],
  pdf: ["pdf"],
  sheet: ["xls","xlsx","csv","ods"],
  doc: ["doc","docx","rtf","odt","txt","md","markdown","log"],
  code: ["js","mjs","cjs","ts","tsx","jsx","vue","svelte","py","rb","php","pl","lua","sh","bash","zsh",
    "c","h","cpp","hpp","cc","cs","java","kt","go","rs","swift","sql","r","dart","html","htm","css","scss","sass","less"],
  config: ["json","json5","xml","yml","yaml","toml","ini","conf","cfg","env","properties"],
};
// kategori → [gövde, köşe, etiket]
const CAT_STYLE = {
  image:   ["#34d399", "#10b981", "IMG"],
  video:   ["#818cf8", "#6366f1", "VID"],
  audio:   ["#f0abfc", "#e879f9", "MP3"],
  archive: ["#fbbf24", "#f59e0b", "ZIP"],
  pdf:     ["#f87171", "#ef4444", "PDF"],
  sheet:   ["#4ade80", "#22c55e", "XLS"],
  doc:     ["#60a5fa", "#3b82f6", "DOC"],
  code:    ["#a78bfa", "#8b5cf6", "</>"],
  config:  ["#94a3b8", "#64748b", "CFG"],
  default: ["#cbd5e1", "#94a3b8", ""],
};
function categoryOf(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  for (const cat in EXT_CAT) if (EXT_CAT[cat].includes(ext)) return cat;
  return "default";
}
function iconFor(item) {
  if (item.type === "dir") return folderSVG("#2f6fed", "#5b9bff");
  if (item.type === "link") return folderSVG("#0ea5a4", "#2dd4bf");
  const [body, corner, label] = CAT_STYLE[categoryOf(item.name)];
  return fileSVG(body, corner, label);
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1; let n = bytes;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
}
function fmtDate(ms) {
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

let currentItems = [];
let selectedItem = null;
let viewMode = localStorage.getItem("viewMode") || "grid"; // varsayılan: masaüstü tarzı simge

function selectEl(el, item) {
  $("file-area").querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
  el.classList.add("selected");
  selectedItem = item;
  updateStatus();
}

function renderList(items) {
  currentItems = items;
  selectedItem = null;
  const grid = viewMode === "grid";
  document.querySelector(".file-table").hidden = grid;
  $("grid").hidden = !grid;
  $("empty").hidden = items.length > 0;
  if (grid) renderGrid(items);
  else renderTable(items);
  syncCheckState();
}

// ---- Liste (tablo) görünümü ----
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

// ---- Masaüstü tarzı simge (ızgara) görünümü ----
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

// Satır/karo için ortak olay bağlama
function wireEntry(el, item) {
  const cb = el.querySelector(".row-check");
  cb._item = item;
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => {
    el.classList.toggle("checked", cb.checked);
    syncCheckState();
  });
  el.addEventListener("click", () => selectEl(el, item));
  el.addEventListener("dblclick", () => openItem(item));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    selectEl(el, item);
    showContextMenu(e, item);
  });
}

// İşaretli öğeleri döndür (her iki görünümde de çalışır)
function checkedItems() {
  return Array.from($("file-area").querySelectorAll(".row-check"))
    .filter((cb) => cb.checked)
    .map((cb) => cb._item);
}
// "Tümünü seç" kutusunu ve durum çubuğunu güncelle (her iki görünüm)
function syncCheckState() {
  const rows = $("file-area").querySelectorAll(".row-check");
  const checked = $("file-area").querySelectorAll(".row-check:checked");
  const all = $("check-all");
  if (all) {
    all.checked = rows.length > 0 && checked.length === rows.length;
    all.indeterminate = checked.length > 0 && checked.length < rows.length;
  }
  updateStatus();
}

let diskInfo = null;
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

// Disk kullanımını kenar çubuğundaki karta çiz
function renderSideDisk() {
  const box = $("side-disk");
  if (!diskInfo || !diskInfo.available) { box.innerHTML = ""; return; }
  const d = diskInfo;
  const cls = d.percent >= 90 ? "full" : d.percent >= 75 ? "warn" : "";
  box.innerHTML =
    `<div class="sd-title">💾 Disk Kullanımı</div>` +
    `<div class="sd-bar"><div class="sd-fill ${cls}" style="width:${d.percent}%"></div></div>` +
    `<div class="sd-text">${fmtSize(d.used)} / ${fmtSize(d.total)} • %${d.percent} dolu<br>${fmtSize(d.avail)} boş</div>`;
}

async function fetchDisk(target) {
  diskInfo = null;
  renderSideDisk();
  try {
    diskInfo = await api("disk?path=" + encodeURIComponent(target));
  } catch (_) { diskInfo = null; }
  renderSideDisk();
}

// Tarayıcıda düzenlenebilir kabul edilen dosya uzantıları / adları
const TEXT_EXT = new Set([
  "txt","md","markdown","log","csv","tsv","ini","conf","cfg","cnf","config","env","properties",
  "json","json5","xml","yml","yaml","toml","html","htm","css","scss","sass","less",
  "js","mjs","cjs","ts","tsx","jsx","vue","svelte","py","rb","php","pl","lua","sh","bash","zsh","fish",
  "c","h","cpp","hpp","cc","cs","java","kt","go","rs","swift","sql","r","dart",
  "gitignore","dockerfile","makefile","gradle","bat","ps1","htaccess","service","nginx",
]);
const TEXT_NAMES = new Set([
  ".bashrc",".bash_profile",".bash_history",".profile",".zshrc",".gitconfig",".vimrc",
  ".npmrc",".env",".gitignore","dockerfile","makefile",".wget-hsts","authorized_keys","known_hosts",
]);
function isEditable(name) {
  const lower = name.toLowerCase();
  if (TEXT_NAMES.has(lower)) return true;
  const ext = lower.includes(".") ? lower.split(".").pop() : "";
  return TEXT_EXT.has(ext);
}

function openItem(item) {
  const full = joinPath(cwd, item.name);
  if (item.type === "dir" || item.type === "link") navigate(full);
  else if (isEditable(item.name)) editFile(item, full);
  else downloadFile(full);
}

function joinPath(base, name) {
  return (base.endsWith("/") ? base : base + "/") + name;
}

// ---------- Toolbar ----------
$("btn-back").addEventListener("click", () => {
  if (history.length) navigate(history.pop(), false);
});
$("btn-up").addEventListener("click", () => {
  if (cwd === "/") return;
  const parent = cwd.replace(/\/[^/]+\/?$/, "") || "/";
  navigate(parent);
});
$("btn-refresh").addEventListener("click", () => navigate(cwd, false));

$("btn-newfolder").addEventListener("click", async () => {
  const name = prompt("Yeni klasör adı:");
  if (!name) return;
  try {
    await api("mkdir", { method: "POST", json: { path: cwd, name } });
    toast("Klasör oluşturuldu");
    navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
});

// ---------- İndir / Yükle ----------
function triggerDownload(url) {
  const a = document.createElement("a");
  a.href = url; a.download = "";
  document.body.appendChild(a); a.click(); a.remove();
}
function downloadFile(fullPath) {
  triggerDownload("/api/download?session=" + encodeURIComponent(session) +
    "&path=" + encodeURIComponent(fullPath));
}
function downloadFolder(fullPath) {
  toast("Klasör arşivleniyor, indirme birazdan başlayacak...");
  triggerDownload("/api/download-folder?session=" + encodeURIComponent(session) +
    "&path=" + encodeURIComponent(fullPath));
}
function downloadItem(item) {
  const full = joinPath(cwd, item.name);
  if (item.type === "dir") downloadFolder(full);
  else downloadFile(full);
}

// ---------- Dosya düzenleyici ----------
let editorPath = null;
let editorDirty = false;
const editorArea = $("editor-area");

async function editFile(item, full) {
  showLoading(true);
  try {
    const data = await api("read?path=" + encodeURIComponent(full));
    editorPath = full;
    editorDirty = false;
    $("editor-title").textContent = item.name;
    $("editor-status").textContent = fmtSize(data.size);
    editorArea.value = data.content;
    $("editor").hidden = false;
    editorArea.focus();
    editorArea.setSelectionRange(0, 0);
    editorArea.scrollTop = 0;
  } catch (e) {
    toast(e.message, true);
  } finally {
    showLoading(false);
  }
}

editorArea.addEventListener("input", () => {
  if (!editorDirty) {
    editorDirty = true;
    $("editor-status").textContent = "• kaydedilmedi";
  }
});

// Editörde Tab tuşu sekme eklesin (odak kaybetmesin)
editorArea.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const s = editorArea.selectionStart, en = editorArea.selectionEnd;
    editorArea.value = editorArea.value.slice(0, s) + "\t" + editorArea.value.slice(en);
    editorArea.selectionStart = editorArea.selectionEnd = s + 1;
    editorArea.dispatchEvent(new Event("input"));
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveEditor(); }
});

async function saveEditor() {
  if (!editorPath) return;
  const btn = $("editor-save");
  btn.disabled = true;
  try {
    await api("save", { method: "POST", json: { path: editorPath, content: editorArea.value } });
    editorDirty = false;
    $("editor-status").textContent = "✓ kaydedildi";
    toast("Kaydedildi");
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

function closeEditor() {
  if (editorDirty && !confirm("Kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?")) return;
  $("editor").hidden = true;
  editorPath = null;
  editorDirty = false;
  editorArea.value = "";
}

$("editor-save").addEventListener("click", saveEditor);
$("editor-close").addEventListener("click", closeEditor);

// ---------- Docker yönetimi ----------
let dockerTab = "containers";

$("btn-docker").addEventListener("click", openDocker);
$("docker-close").addEventListener("click", () => { $("docker-panel").hidden = true; });
$("docker-refresh").addEventListener("click", loadDocker);
document.querySelectorAll(".dk-tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".dk-tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    dockerTab = t.dataset.tab;
    loadDocker();
  });
});

function openDocker() {
  $("docker-panel").hidden = false;
  loadDocker();
}

async function loadDocker() {
  const body = $("docker-body");
  body.innerHTML = `<div class="dk-msg">Yükleniyor…</div>`;
  $("docker-status").textContent = "";
  try {
    if (dockerTab === "containers") {
      const data = await api("docker/ps");
      if (!data.available) return showDockerUnavailable(data.error);
      renderContainers(data.containers);
    } else {
      const data = await api("docker/images");
      if (!data.available) return showDockerUnavailable(data.error);
      renderImages(data.images);
    }
  } catch (e) {
    body.innerHTML = `<div class="dk-msg">Hata: ${escapeHtml(e.message)}</div>`;
  }
}

function showDockerUnavailable(err) {
  $("docker-body").innerHTML =
    `<div class="dk-msg">🐳 Bu sunucuda Docker'a erişilemedi.<br><br>` +
    `<code>docker</code> kurulu ve çalışıyor olmalı; kullanıcının docker yetkisi olmalı.` +
    (err ? `<br><br><span class="dk-sub">${escapeHtml(err)}</span>` : "") + `</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderContainers(list) {
  $("docker-status").textContent = `${list.length} konteyner`;
  if (!list.length) { $("docker-body").innerHTML = `<div class="dk-msg">Hiç konteyner yok.</div>`; return; }
  const rows = list.map((c) => {
    const st = (c.state || "").toLowerCase();
    const cls = st.includes("run") ? "running" : st.includes("paus") ? "paused" : "exited";
    const running = cls === "running";
    const paused = cls === "paused";
    const a = [];
    if (!running && !paused) a.push(btn("start", c.id, "container", "▶ Başlat", "go"));
    if (running) a.push(btn(paused ? "unpause" : "pause", c.id, "container", paused ? "▶ Devam" : "⏸ Duraklat"));
    if (running || paused) a.push(btn("stop", c.id, "container", "⏹ Durdur"));
    a.push(btn("restart", c.id, "container", "⟳ Yeniden başlat"));
    a.push(`<button class="dk-btn" onclick="dockerLogs('${c.id}','${escapeAttr(c.name)}')">📄 Loglar</button>`);
    a.push(btn("rm", c.id, "container", "🗑 Sil", "danger"));
    return `<tr>
      <td><div class="dk-name">${escapeHtml(c.name)}</div><div class="dk-sub">${escapeHtml(c.image)}</div></td>
      <td><span class="dk-state ${cls}"><span class="dot"></span>${escapeHtml(c.status || c.state)}</span></td>
      <td class="dk-sub">${escapeHtml(c.ports || "—")}</td>
      <td><div class="dk-actions">${a.join("")}</div></td>
    </tr>`;
  }).join("");
  $("docker-body").innerHTML =
    `<table class="dk-table"><thead><tr><th>Konteyner</th><th>Durum</th><th>Portlar</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderImages(list) {
  $("docker-status").textContent = `${list.length} görüntü`;
  if (!list.length) { $("docker-body").innerHTML = `<div class="dk-msg">Hiç görüntü yok.</div>`; return; }
  const rows = list.map((i) => `<tr>
    <td><div class="dk-name">${escapeHtml((i.repo || "<none>") + ":" + (i.tag || "latest"))}</div><div class="dk-sub">${escapeHtml(i.id)}</div></td>
    <td class="dk-sub">${escapeHtml(i.size || "")}</td>
    <td class="dk-sub">${escapeHtml(i.created || "")}</td>
    <td><div class="dk-actions">${btn("rmi", i.id, "image", "🗑 Sil", "danger")}</div></td>
  </tr>`).join("");
  $("docker-body").innerHTML =
    `<table class="dk-table"><thead><tr><th>Görüntü</th><th>Boyut</th><th>Oluşturulma</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function btn(action, id, type, label, extra = "") {
  return `<button class="dk-btn ${extra}" onclick="dockerAction('${action}','${id}','${type}')">${label}</button>`;
}
function escapeAttr(s) { return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

async function dockerAction(action, id, type) {
  const labels = { start: "başlatılsın", stop: "durdurulsun", restart: "yeniden başlatılsın", pause: "duraklatılsın", unpause: "devam etsin", rm: "SİLİNSİN", rmi: "SİLİNSİN" };
  if ((action === "rm" || action === "rmi") && !confirm(`Bu ${type === "image" ? "görüntü" : "konteyner"} kalıcı olarak silinsin mi?`)) return;
  showLoading(true);
  try {
    await api("docker/action", { method: "POST", json: { type, id, action } });
    toast("İşlem tamam: " + (labels[action] || action));
    await loadDocker();
  } catch (e) {
    toast(e.message, true);
  } finally {
    showLoading(false);
  }
}

// Log görüntüleyici
let logsCtxId = null;
async function dockerLogs(id, name) {
  logsCtxId = id;
  $("logs-title").textContent = "📄 Loglar — " + name;
  $("docker-logs").hidden = false;
  $("logs-area").textContent = "Yükleniyor…";
  await refreshLogs();
}
async function refreshLogs() {
  if (!logsCtxId) return;
  try {
    const data = await api("docker/logs?id=" + encodeURIComponent(logsCtxId));
    $("logs-area").textContent = data.logs || "(log yok)";
    $("logs-area").scrollTop = $("logs-area").scrollHeight;
  } catch (e) {
    $("logs-area").textContent = "Hata: " + e.message;
  }
}
$("logs-refresh").addEventListener("click", refreshLogs);
$("logs-close").addEventListener("click", () => { $("docker-logs").hidden = true; logsCtxId = null; });

// onclick içinden erişim için global'e aç
window.dockerAction = dockerAction;
window.dockerLogs = dockerLogs;

$("check-all").addEventListener("change", (e) => {
  $("file-area").querySelectorAll(".row-check").forEach((cb) => {
    cb.checked = e.target.checked;
    const entry = cb.closest("tr, .tile");
    if (entry) entry.classList.toggle("checked", cb.checked);
  });
  syncCheckState();
});

// Görünüm değiştir (simge ızgarası / liste)
function applyViewButton() {
  $("btn-view").textContent = viewMode === "grid" ? "≣ Liste" : "▦ Simge";
}
$("btn-view").addEventListener("click", () => {
  viewMode = viewMode === "grid" ? "list" : "grid";
  localStorage.setItem("viewMode", viewMode);
  applyViewButton();
  renderList(currentItems);
});
applyViewButton();

$("btn-download").addEventListener("click", () => {
  const checked = checkedItems();
  if (checked.length > 1) {
    // Birden çok öğe → tek arşiv
    toast(checked.length + " öğe arşivleniyor, indirme başlıyor...");
    const params = checked.map((i) => "name=" + encodeURIComponent(i.name)).join("&");
    triggerDownload("/api/download-multi?session=" + encodeURIComponent(session) +
      "&dir=" + encodeURIComponent(cwd) + "&" + params);
    return;
  }
  const one = checked[0] || selectedItem;
  if (!one) { toast("Önce indirmek istediğin dosya/klasörü seç (kutucuk).", true); return; }
  downloadItem(one);
});

$("btn-upload").addEventListener("click", () => $("file-input").click());
$("dropzone").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (e) => uploadFiles(e.target.files));

async function uploadFiles(fileList) {
  if (!fileList || !fileList.length) return;
  const fd = new FormData();
  fd.append("path", cwd);
  for (const f of fileList) fd.append("files", f);
  showLoading(true);
  try {
    const r = await api("upload", { method: "POST", body: fd });
    toast(r.count + " dosya yüklendi");
    navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); $("file-input").value = ""; }
}

// Sürükle-bırak yükleme (tüm pencerede, derinlik sayacı ile titremesiz)
let dragDepth = 0;
const explorerActive = () => !$("explorer").hidden && $("editor").hidden;
const hasFiles = (e) =>
  e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

window.addEventListener("dragenter", (e) => {
  if (!explorerActive()) return;
  e.preventDefault();
  dragDepth++;
  if (hasFiles(e)) { $("drop-hint").hidden = false; $("dropzone").classList.add("dragging"); }
});
window.addEventListener("dragover", (e) => {
  if (!explorerActive()) return;
  e.preventDefault(); // her durumda: tarayıcının dosyayı açmasını engelle
  try { e.dataTransfer.dropEffect = "copy"; } catch (_) {}
});
window.addEventListener("dragleave", (e) => {
  if (!explorerActive()) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) { $("drop-hint").hidden = true; $("dropzone").classList.remove("dragging"); }
});
window.addEventListener("drop", (e) => {
  if (!explorerActive()) return;
  e.preventDefault();
  dragDepth = 0;
  $("drop-hint").hidden = true;
  $("dropzone").classList.remove("dragging");
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) uploadFiles(files);
  else toast("Sürüklenen öğede yüklenebilir dosya yok.", true);
});

// ---------- Sağ tık menüsü ----------
const menu = $("context-menu");
function showContextMenu(e, item) {
  const full = joinPath(cwd, item.name);
  const actions = [];
  if (item.type === "dir") {
    actions.push({ label: "📂 Aç", fn: () => navigate(full) });
    actions.push({ label: "⬇ İndir (.tar.gz)", fn: () => downloadFolder(full) });
  } else {
    if (isEditable(item.name)) actions.push({ label: "📝 Düzenle", fn: () => editFile(item, full) });
    actions.push({ label: "⬇ İndir", fn: () => downloadFile(full) });
  }
  actions.push({ label: "✏ Yeniden adlandır", fn: () => renameItem(item, full) });
  actions.push({ sep: true });
  actions.push({ label: "🗑 Sil", danger: true, fn: () => deleteItem(item, full) });

  menu.innerHTML = "";
  actions.forEach((a) => {
    if (a.sep) { const s = document.createElement("div"); s.className = "sep"; menu.appendChild(s); return; }
    const el = document.createElement("div");
    el.className = "item" + (a.danger ? " danger" : "");
    el.textContent = a.label;
    el.onclick = () => { hideMenu(); a.fn(); };
    menu.appendChild(el);
  });
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + "px";
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 20) + "px";
  menu.hidden = false;
}
function hideMenu() { menu.hidden = true; }
document.addEventListener("click", hideMenu);
document.addEventListener("scroll", hideMenu, true);

async function renameItem(item, full) {
  const name = prompt("Yeni ad:", item.name);
  if (!name || name === item.name) return;
  try {
    await api("rename", { method: "POST", json: { from: full, to: joinPath(cwd, name) } });
    toast("Yeniden adlandırıldı");
    navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
}

async function deleteItem(item, full) {
  const what = item.type === "dir" ? "klasörü ve TÜM içeriğini" : "dosyayı";
  if (!confirm(`"${item.name}" ${what} silmek istediğinize emin misiniz?`)) return;
  try {
    await api("delete", { method: "POST", json: { path: full, type: item.type } });
    toast("Silindi");
    navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
}

// Klavye: F5 yenile, Delete sil
document.addEventListener("keydown", (e) => {
  if (!$("editor").hidden) {
    if (e.key === "Escape") closeEditor();
    return; // editör açıkken gezgin kısayolları devre dışı
  }
  if ($("explorer").hidden) return;
  if (e.key === "F5") { e.preventDefault(); navigate(cwd, false); }
  if (e.key === "Backspace" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    e.preventDefault(); $("btn-up").click();
  }
});
