"use strict";

// ---- Aktif bağlantının durumu (sekme değişince swap edilir) ----
let session = null;
let cwd = "/";
let homePath = "/";
let history = [];

// ---- Çoklu sunucu: bağlı oturumlar ----
// Her bağlantı: { id, session, info:{host,username,port}, cwd, homePath, history }
let connections = [];
let activeConnId = null;

const $ = (id) => document.getElementById(id);

// ---- Tutarlı SVG ikon seti (emoji yerine: Mac/Windows/Linux'ta aynı görünür) ----
// Lucide tarzı, stroke="currentColor" çizgi ikonlar; metin rengini miras alır.
const ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  "folder-plus": '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  "hard-drive": '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list: '<path d="M3 6h.01M3 12h.01M3 18h.01"/><path d="M8 6h13M8 12h13M8 18h13"/>',
  container: '<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.7 1.7 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.7 1.7 0 0 0 1.7 0l10.3-6c.5-.3.9-.9.9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
};

// İkon adından inline SVG üretir (currentColor ile metin rengini alır)
function icon(name, cls = "nav-ico") {
  const p = ICONS[name] || "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// data-icon özniteliği olan tüm elemanları SVG ile doldurur
function applyIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconCls || "nav-ico");
  });
}
document.addEventListener("DOMContentLoaded", () => applyIcons());

// Globalleri aktif bağlantı nesnesine yaz (sekme değiştirmeden önce)
function syncActiveConn() {
  const c = connections.find((x) => x.id === activeConnId);
  if (c) { c.session = session; c.cwd = cwd; c.homePath = homePath; c.history = history; }
}

// Bir bağlantıyı aktif yap: globalleri ondan doldur ve gezgini güncelle
function activateConn(id) {
  const c = connections.find((x) => x.id === id);
  if (!c) return;
  if (activeConnId && activeConnId !== id) syncActiveConn();
  activeConnId = id;
  session = c.session;
  cwd = c.cwd;
  homePath = c.homePath;
  history = c.history;
  $("login").hidden = true;
  $("explorer").hidden = false;
  updateConnInfo(c.info);
  renderTabs();
  renderQuickLinks();
  navigate(cwd, false);
}

function updateConnInfo(i) {
  const proto = (i.protocol || "sftp").toUpperCase();
  $("conn-info").innerHTML =
    `<span class="dot"></span><span class="conn-proto">${proto}</span> <b>${i.username}@${i.host}</b><span class="port">:${i.port}</span>`;
  $("conn-info").title = `Bağlı: ${proto} · ${i.username}@${i.host}:${i.port}`;
}

// Sekme şeridini çiz
function renderTabs() {
  const bar = $("conn-tabs");
  bar.innerHTML = "";
  bar.hidden = connections.length === 0;
  connections.forEach((c) => {
    const tab = document.createElement("div");
    tab.className = "conn-tab" + (c.id === activeConnId ? " active" : "");
    tab.title = `${c.info.username}@${c.info.host}:${c.info.port}`;
    const label = document.createElement("span");
    label.className = "ct-label";
    label.innerHTML = `<span class="ct-dot"></span><span class="ct-name"></span>`;
    label.querySelector(".ct-name").textContent = c.info.name || `${c.info.username}@${c.info.host}`;
    const close = document.createElement("button");
    close.className = "ct-close";
    close.textContent = "✕";
    close.title = "Bağlantıyı kapat";
    close.addEventListener("click", (e) => { e.stopPropagation(); closeConnection(c.id); });
    tab.appendChild(label);
    tab.appendChild(close);
    tab.addEventListener("click", () => { if (c.id !== activeConnId) activateConn(c.id); });
    bar.appendChild(tab);
  });
  // "+" yeni bağlantı ekle
  const add = document.createElement("button");
  add.className = "conn-add";
  add.textContent = "+";
  add.title = "Yeni sunucuya bağlan";
  add.addEventListener("click", showAddConnection);
  bar.appendChild(add);
}

// Yeni bağlantı eklemek için giriş ekranını göster (mevcutları kapatmadan)
function showAddConnection() {
  const f = $("connect-form");
  f.reset();
  f.port.value = "22";
  document.querySelector('.tab[data-auth="password"]').click();
  $("login-error").textContent = "";
  $("save-pass-row").hidden = true;
  $("login-close").hidden = connections.length === 0;
  $("login").hidden = false;
  renderSavedServers();
  setTimeout(() => f.host.focus(), 50);
}

// Bir bağlantıyı kapat (kendi oturumunu sonlandırarak)
function closeConnection(id, opts = {}) {
  const c = connections.find((x) => x.id === id);
  if (!c) return;
  if (opts.ask !== false && !confirm(`"${c.info.name || c.info.host}" bağlantısı kapatılsın mı?`)) return;
  // O bağlantının oturumunu sonlandır
  if (c.session) {
    fetch("/api/disconnect", { method: "POST", headers: { "x-session": c.session } }).catch(() => {});
  }
  connections = connections.filter((x) => x.id !== id);
  if (activeConnId === id) {
    activeConnId = null;
    if (connections.length) {
      activateConn(connections[connections.length - 1].id);
    } else {
      // Hiç bağlantı kalmadı → giriş ekranı
      session = null; cwd = "/"; homePath = "/"; history = [];
      $("explorer").hidden = true;
      $("login-close").hidden = true;
      $("login").hidden = false;
      renderTabs();
      renderSavedServers();
    }
  } else {
    renderTabs();
  }
}

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
// Protokol değişince varsayılan portu ayarla ve SSH anahtarı sekmesini yönet
const DEFAULT_PORTS = { sftp: "22", ftp: "21", ftps: "21" };
function applyProtocol(opts = {}) {
  const proto = $("protocol").value;
  const f = $("connect-form");
  // FTP/FTPS'te SSH anahtarı yoktur → sekmeyi gizle ve parolaya zorla
  const keyTab = document.querySelector('.tab[data-auth="key"]');
  const isSsh = proto === "sftp";
  keyTab.hidden = !isSsh;
  if (!isSsh) document.querySelector('.tab[data-auth="password"]').click();
  // Port alanı boş ya da bilinen bir varsayılansa, yeni protokolün portunu yaz
  if (!opts.keepPort) {
    const cur = f.port.value.trim();
    if (!cur || Object.values(DEFAULT_PORTS).includes(cur)) {
      f.port.value = DEFAULT_PORTS[proto];
    }
  }
}
$("protocol").addEventListener("change", () => applyProtocol());

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
    const protocol = f.protocol.value;
    const body = {
      protocol,
      host: f.host.value.trim(),
      port: f.port.value.trim() || (protocol === "sftp" ? 22 : 21),
      username: f.username.value.trim(),
      password: f.password.value,
      privateKey: protocol === "sftp" ? f.privateKey.value : "",
      passphrase: protocol === "sftp" ? f.passphrase.value : "",
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
    const i = data.info;
    const savedName = maybeSaveServer(body); // istenirse sunucuyu kaydet
    // Aynı sunucuya tekrar bağlanıldıysa eski sekmeyi koru, yenisini ekle
    const home = data.home || "/";
    const conn = {
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      session: data.session,
      info: { host: i.host, username: i.username, port: i.port, protocol: i.protocol, name: savedName || null },
      cwd: home, homePath: home, history: [],
    };
    if (activeConnId) syncActiveConn();
    connections.push(conn);
    $("login-close").hidden = true;
    activateConn(conn.id);
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Bağlan";
  }
});

// Aktif bağlantıyı kapat (sekme). Oturum 401 olduğunda da çağrılır.
function logout() {
  if (activeConnId) {
    closeConnection(activeConnId, { ask: false });
  } else {
    session = null;
    $("explorer").hidden = true;
    $("login").hidden = false;
    renderSavedServers();
  }
}

$("btn-disconnect").addEventListener("click", () => {
  if (activeConnId) closeConnection(activeConnId);
});

// Giriş ekranını kapat (yeni bağlantı eklemekten vazgeçildiğinde)
$("login-close").addEventListener("click", () => {
  if (connections.length) { $("login").hidden = true; }
});

// ---------- Kayıtlı sunucular (sunucudaki servers.json dosyasında kalıcı) ----------
let savedServers = [];

// "Bu sunucuyu kaydet" işaretliyse parola seçeneğini göster
$("save-server").addEventListener("change", (e) => {
  $("save-pass-row").hidden = !e.target.checked;
});

// Başarılı bağlantıdan sonra çağrılır → dosyaya kaydeder
function maybeSaveServer(body) {
  if (!$("save-server").checked) return null;
  const savePass = $("save-pass").checked;
  const isKey = !!(body.privateKey && body.privateKey.trim());
  const name = ($("save-name").value.trim()) || `${body.username}@${body.host}`;
  const server = {
    name,
    host: body.host, port: body.port, username: body.username,
    protocol: body.protocol || "sftp",
    auth: isKey ? "key" : "password",
    // Kimlik bilgileri yalnızca kullanıcı isterse saklanır
    password: savePass && !isKey ? body.password : "",
    privateKey: savePass && isKey ? body.privateKey : "",
    passphrase: savePass && isKey ? body.passphrase : "",
  };
  api("servers", { method: "POST", json: server })
    .catch((e) => console.warn("Sunucu kaydedilemedi:", e.message));
  return name;
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
    // Hâlihazırda bu sunucuya bağlı bir sekme var mı?
    const online = connections.some(
      (c) => c.info.host === s.host && c.info.username === s.username && String(c.info.port) === String(s.port)
    );
    const el = document.createElement("button");
    el.type = "button";
    el.className = "srv-tile" + (online ? " online" : "");
    const protoUp = (s.protocol || "sftp").toUpperCase();
    el.title = `${protoUp} · ${s.username}@${s.host}:${s.port} • ${s.auth === "key" ? "SSH anahtarı" : "parola"}`;
    el.innerHTML = `
      <span class="srv-ico">${computerSVG()}</span>
      <span class="srv-text">
        <span class="srv-name"></span>
        <span class="srv-host"></span>
      </span>
      <span class="srv-badge" title="${hasCreds ? "Kimlik bilgisi kayıtlı" : "Bağlanırken parola istenir"}">${hasCreds ? "🔓" : "🔒"}</span>
      <span class="srv-del" title="Kaydı sil">×</span>`;
    el.querySelector(".srv-name").textContent = s.name;
    el.querySelector(".srv-host").textContent = `${protoUp} · ${s.username}@${s.host}:${s.port}`;
    el.addEventListener("click", () => selectServer(s));
    el.querySelector(".srv-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`"${s.name}" kaydı silinsin mi?`)) return;
      try { await api("servers/" + encodeURIComponent(s.id), { method: "DELETE" }); }
      catch (err) { toast(err.message, true); }
      renderSavedServers();
    });
    list.appendChild(el);
  });
}

// Login ekranındaki kayıtlı sunucular için bilgisayar (masaüstü) simgesi
function computerSVG() {
  return `<svg width="30" height="30" viewBox="0 0 48 48" class="srv-svg" aria-hidden="true">
    <rect x="6" y="8" width="36" height="24" rx="2.5" fill="#5b9bff"/>
    <rect x="9" y="11" width="30" height="18" rx="1.2" fill="#eaf2ff"/>
    <rect x="6" y="8" width="36" height="24" rx="2.5" fill="none" stroke="#2f6fed" stroke-width="1.4"/>
    <path d="M18 32h12l2 6H16z" fill="#cdd9ee"/>
    <rect x="13" y="38" width="22" height="3" rx="1.5" fill="#9fb3d4"/>
  </svg>`;
}

// Kayıtlı sunucuyu forma doldur; kimlik bilgisi varsa direkt bağlan
function selectServer(s) {
  const f = $("connect-form");
  f.protocol.value = s.protocol || "sftp";
  applyProtocol({ keepPort: true });
  f.host.value = s.host;
  f.port.value = s.port;
  f.username.value = s.username;
  f.password.value = s.password || "";
  f.privateKey.value = s.privateKey || "";
  f.passphrase.value = s.passphrase || "";
  // Doğru kimlik sekmesini seç (FTP'de yalnızca parola)
  const auth = (s.protocol && s.protocol !== "sftp") ? "password" : s.auth;
  document.querySelector(`.tab[data-auth="${auth}"]`).click();
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
    { icon: "home", label: "Ana Dizin", path: homePath },
    { icon: "server", label: "Kök (/)", path: "/" },
    { icon: "box", label: "/var", path: "/var" },
    { icon: "settings", label: "/etc", path: "/etc" },
    { icon: "folder", label: "/tmp", path: "/tmp" },
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
    a.innerHTML = `<span class="q-ico">${icon(l.icon)}</span> ${l.label}`;
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
  root.className = "crumb"; root.innerHTML = icon("server") + " /";
  root.onclick = () => navigate("/");
  bc.appendChild(root);
  let acc = "";
  parts.forEach((p) => {
    acc += "/" + p;
    const sep = document.createElement("span"); sep.className = "sep"; sep.innerHTML = icon("chevron-right", "sep-ico");
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
    `<div class="sd-title">${icon("hard-drive")} Disk Kullanımı</div>` +
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
    `<div class="dk-msg">Bu sunucuda Docker'a erişilemedi.<br><br>` +
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
  $("btn-view").innerHTML = viewMode === "grid"
    ? `<span class="nav-ico-wrap">${icon("list")}</span> Liste`
    : `<span class="nav-ico-wrap">${icon("grid")}</span> Simge`;
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

// ---------- Masaüstü uygulaması indirmeleri (web modunda) ----------
$("open-downloads").addEventListener("click", openDownloads);
$("downloads-close").addEventListener("click", () => { $("downloads").hidden = true; });

async function openDownloads() {
  $("downloads").hidden = false;
  const body = $("dl-body");
  body.innerHTML = `<div class="dl-msg">Yükleniyor…</div>`;
  let data;
  try { data = await api("downloads"); }
  catch (e) { body.innerHTML = `<div class="dl-msg">Hata: ${escapeHtml(e.message)}</div>`; return; }
  if (!data.available || !data.items.length) {
    body.innerHTML =
      `<div class="dl-msg">Henüz hazır kurulum dosyası yok.<br><br>` +
      `Bilgisayarında <code>npm run dist</code> komutunu çalıştırınca üretilen dosyalar ` +
      `<code>dist/</code> klasörüne düşer ve burada listelenir.</div>`;
    return;
  }
  // Kullanıcının işletim sistemini algıla ve en uygun indirmeyi öne çıkar
  const det = await detectPlatform();
  const best = pickBest(data.items, det);
  let html = "";
  if (best) {
    html += `
      <a class="dl-rec" href="${best.url}" download>
        <span class="dl-rec-ic">${best.icon}</span>
        <span class="dl-rec-info">
          <span class="dl-rec-top">Senin sistemin için önerilen</span>
          <span class="dl-rec-name">${escapeHtml(best.label)} — ${escapeHtml(prettyName(best))}</span>
          <span class="dl-rec-meta">${escapeHtml(best.name)} • ${fmtSize(best.size)}</span>
        </span>
        <span class="dl-rec-btn">⬇ İndir</span>
      </a>
      <div class="dl-allhead">Tüm sürümler</div>`;
  }

  // Platforma göre grupla
  const groups = {};
  data.items.forEach((it) => { (groups[it.label] = groups[it.label] || { icon: it.icon, items: [] }).items.push(it); });
  html += Object.keys(groups).map((label) => {
    const g = groups[label];
    const rows = g.items.map((it) => `
      <a class="dl-item${best && it.name === best.name ? " current" : ""}" href="${it.url}" download>
        <span class="dl-ic">⬇</span>
        <span class="dl-info">
          <span class="dl-name">${escapeHtml(prettyName(it))}</span>
          <span class="dl-meta">${escapeHtml(it.name)} • ${fmtSize(it.size)}</span>
        </span>
      </a>`).join("");
    return `<div class="dl-group"><div class="dl-head">${g.icon} ${escapeHtml(label)}</div>${rows}</div>`;
  }).join("");
  body.innerHTML = html;
}

// Tarayıcıdan işletim sistemi + mimari tahmini
async function detectPlatform() {
  let os = "", arch = "x64";
  const ua = navigator.userAgent || "";
  const uad = navigator.userAgentData;
  if (uad && uad.platform) {
    const p = uad.platform.toLowerCase();
    os = p.includes("mac") ? "mac" : p.includes("win") ? "win" : p.includes("linux") ? "linux" : "";
    try {
      const hv = await uad.getHighEntropyValues(["architecture"]);
      if ((hv.architecture || "").includes("arm")) arch = "arm64";
    } catch (_) {}
  } else {
    os = /mac/i.test(ua) ? "mac" : /win/i.test(ua) ? "win" : /linux|x11|android/i.test(ua) ? "linux" : "";
    if (/arm64|aarch64/i.test(ua)) arch = "arm64";
  }
  return { os, arch };
}

// O işletim sistemi için en uygun kurulum dosyasını seç
function pickBest(items, det) {
  if (!det.os) return null;
  const cand = items.filter((i) => i.os === det.os);
  if (!cand.length) return null;
  let pool = cand.filter((i) => i.arch === det.arch);
  if (!pool.length) pool = cand;
  const rank = (i) => {
    const n = i.name.toLowerCase();
    if (n.endsWith(".dmg")) return 0;
    if (n.endsWith(".exe") && /setup/i.test(n)) return 0;
    if (n.endsWith(".appimage")) return 0;
    if (n.endsWith(".exe")) return 1;       // taşınabilir exe
    if (n.endsWith(".zip")) return 3;       // zip en son
    return 2;
  };
  return pool.slice().sort((a, b) => rank(a) - rank(b))[0];
}

function prettyName(it) {
  let archTxt = "";
  if (it.arch === "arm64") archTxt = it.os === "mac" ? "Apple Silicon / ARM64" : "ARM64";
  else if (it.arch === "x64") archTxt = it.os === "mac" ? "Intel / x64" : "64-bit (x64)";
  const ext = (it.name.split(".").pop() || "").toUpperCase();
  const isSetup = /setup/i.test(it.name);
  const kind = ext === "DMG" ? "DMG kurulum"
    : ext === "EXE" ? (isSetup ? "Kurulumlu (Setup)" : "Taşınabilir (portable)")
    : ext === "APPIMAGE" ? "AppImage (taşınabilir)"
    : ext === "DEB" ? "DEB paketi"
    : ext === "ZIP" ? "ZIP arşivi" : ext;
  return archTxt ? `${kind} — ${archTxt}` : kind;
}

// ---------- Masaüstü (Electron): güncelleme denetimi ----------
(function initDesktop() {
  if (!window.desktop || !window.desktop.isDesktop) return;
  document.body.classList.add("is-desktop");

  // Web'e özel "uygulamayı indir" bağlantısı masaüstünde gereksiz
  const dl = $("open-downloads");
  if (dl) dl.hidden = true;

  const btn = $("btn-update");
  if (btn) {
    btn.hidden = false;
    btn.addEventListener("click", () => runUpdateCheck(false));
  }

  // Güncelleme olaylarını dinle (indirme ilerlemesi vb. — paketli uygulamada)
  if (window.desktop.onUpdate) window.desktop.onUpdate(handleUpdateEvent);

  // Açılışta sessizce denetle (varsa nokta ile işaretle)
  setTimeout(() => runUpdateCheck(true), 2500);
})();

let updateChecking = false;
function setUpdateLabel(text) {
  const btn = $("btn-update");
  if (!btn) return;
  // İkon + güncelleme noktası dışındaki metni güncelle
  btn.childNodes.forEach((n) => { if (n.nodeType === 3) n.textContent = ""; });
  btn.insertBefore(document.createTextNode(" " + text), btn.querySelector(".upd-dot"));
}

async function runUpdateCheck(silent) {
  if (!window.desktop || !window.desktop.checkUpdate) return;
  const btn = $("btn-update");
  if (updateChecking) return;
  updateChecking = true;
  if (btn && !silent) { btn.classList.add("checking"); setUpdateLabel("Denetleniyor…"); }
  try {
    const r = await window.desktop.checkUpdate({ silent });
    // Geliştirme modu (paketlenmemiş): indirip kuramayız, sayfayı aç
    if (r && r.packaged === false) {
      if (!r.ok) { if (!silent) toast("Güncelleme denetlenemedi: " + (r.error || "ağ hatası"), true); return; }
      if (r.hasUpdate && !silent) {
        const go = confirm(`Yeni sürüm var: v${r.latest} (yüklü: v${r.current})\n\nİndirme sayfasını açmak ister misin?`);
        if (go) window.desktop.openExternal(r.url);
      } else if (!r.hasUpdate && !silent) {
        toast(`En güncel sürümdesin (v${r.current}).`);
      }
      return;
    }
    // Paketli: sonuç update:event ile gelecek; hata varsa burada bildir
    if (r && !r.ok && !silent) toast("Güncelleme denetlenemedi: " + (r.error || "hata"), true);
  } finally {
    updateChecking = false;
    if (btn && !silent) btn.classList.remove("checking");
    setUpdateLabel("Güncellemeleri Denetle");
  }
}

// Paketli uygulamada electron-updater olayları
function handleUpdateEvent(p) {
  const btn = $("btn-update");
  const dot = btn && btn.querySelector(".upd-dot");
  if (!p || !btn) return;
  switch (p.state) {
    case "available":
      if (dot) dot.hidden = false;
      btn.classList.add("has-update");
      break;
    case "downloading":
      btn.classList.add("checking");
      setUpdateLabel(`İndiriliyor… %${p.percent || 0}`);
      break;
    case "downloaded":
      btn.classList.remove("checking");
      btn.classList.add("has-update");
      if (dot) dot.hidden = false;
      setUpdateLabel("Yeniden başlatınca kurulacak");
      toast(`v${p.version} indirildi — kurmak için yeniden başlat.`);
      break;
    case "latest":
      if (dot) dot.hidden = true;
      btn.classList.remove("has-update", "checking");
      setUpdateLabel("Güncellemeleri Denetle");
      if (!p.silent) toast("En güncel sürümdesin.");
      break;
    case "error":
      btn.classList.remove("checking");
      setUpdateLabel("Güncellemeleri Denetle");
      if (!p.silent) toast("Güncelleme hatası: " + (p.error || "bilinmiyor"), true);
      break;
  }
}
