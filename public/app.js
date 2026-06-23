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
  server:
    '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  monitor:
    '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  settings:
    '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  "folder-plus":
    '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  "hard-drive":
    '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list: '<path d="M3 6h.01M3 12h.01M3 18h.01"/><path d="M8 6h13M8 12h13M8 18h13"/>',
  container:
    '<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.7 1.7 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.7 1.7 0 0 0 1.7 0l10.3-6c.5-.3.9-.9.9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  terminal:
    '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
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
  if (c) {
    c.session = session;
    c.cwd = cwd;
    c.homePath = homePath;
    c.history = history;
  }
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
    label.querySelector(".ct-name").textContent =
      c.info.name || `${c.info.username}@${c.info.host}`;
    const close = document.createElement("button");
    close.className = "ct-close";
    close.textContent = "✕";
    close.title = "Bağlantıyı kapat";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeConnection(c.id);
    });
    tab.appendChild(label);
    tab.appendChild(close);
    tab.addEventListener("click", () => {
      if (c.id !== activeConnId) activateConn(c.id);
    });
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
  if (
    opts.ask !== false &&
    !confirm(`"${c.info.name || c.info.host}" bağlantısı kapatılsın mı?`)
  )
    return;
  // O bağlantının oturumunu sonlandır
  if (c.session) {
    fetch("/api/disconnect", {
      method: "POST",
      headers: { "x-session": c.session },
    }).catch(() => {});
  }
  connections = connections.filter((x) => x.id !== id);
  if (activeConnId === id) {
    activeConnId = null;
    if (connections.length) {
      activateConn(connections[connections.length - 1].id);
    } else {
      // Hiç bağlantı kalmadı → giriş ekranı
      session = null;
      cwd = "/";
      homePath = "/";
      history = [];
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
    throw new Error(
      "Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm start).",
    );
  }
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  if (!res.ok) {
    let msg = "Hata " + res.status;
    if (isJson) {
      try {
        msg = (await res.json()).error || msg;
      } catch (_) {}
    }
    if (res.status === 401) {
      logout();
    }
    throw new Error(msg);
  }
  if (!isJson) return res;
  const text = await res.text();
  if (!text) return {}; // boş gövde → boş nesne (kriptik JSON hatası olmasın)
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("Sunucudan geçersiz yanıt alındı.");
  }
}

function showLoading(on) {
  $("loading").hidden = !on;
}
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
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.auth;
    document.querySelector('[data-pane="password"]').hidden =
      mode !== "password";
    document.querySelector('[data-pane="key"]').hidden = mode !== "key";
  });
});

$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector(".connect-btn");
  $("login-error").textContent = "";
  btn.disabled = true;
  btn.textContent = "Bağlanıyor...";
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
      throw new Error(
        "Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm start).",
      );
    }
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error(
        "Sunucudan geçersiz yanıt: " + (text.slice(0, 120) || "boş yanıt"),
      );
    }
    if (!r.ok)
      throw new Error(data.error || "Bağlanılamadı (HTTP " + r.status + ")");
    const i = data.info;
    const savedName = maybeSaveServer(body); // istenirse sunucuyu kaydet
    // Aynı sunucuya tekrar bağlanıldıysa eski sekmeyi koru, yenisini ekle
    const home = data.home || "/";
    const conn = {
      id:
        "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      session: data.session,
      info: {
        host: i.host,
        username: i.username,
        port: i.port,
        protocol: i.protocol,
        name: savedName || null,
      },
      cwd: home,
      homePath: home,
      history: [],
    };
    if (activeConnId) syncActiveConn();
    connections.push(conn);
    $("login-close").hidden = true;
    activateConn(conn.id);
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Bağlan";
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
  if (connections.length) {
    $("login").hidden = true;
  }
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
  const name = $("save-name").value.trim() || `${body.username}@${body.host}`;
  const server = {
    name,
    host: body.host,
    port: body.port,
    username: body.username,
    protocol: body.protocol || "sftp",
    auth: isKey ? "key" : "password",
    // Kimlik bilgileri yalnızca kullanıcı isterse saklanır
    password: savePass && !isKey ? body.password : "",
    privateKey: savePass && isKey ? body.privateKey : "",
    passphrase: savePass && isKey ? body.passphrase : "",
    group: $("save-group") ? $("save-group").value.trim() : "",
  };
  api("servers", { method: "POST", json: server }).catch((e) =>
    console.warn("Sunucu kaydedilemedi:", e.message),
  );
  return name;
}

let selectedServerIds = new Set();

// Kapatılmış grupların adlarını localStorage'da sakla
function loadCollapsedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem("collapsedGroups") || "[]"));
  } catch (_) {
    return new Set();
  }
}
function saveCollapsedGroups(set) {
  localStorage.setItem("collapsedGroups", JSON.stringify([...set]));
}

async function renderSavedServers() {
  try {
    const data = await api("servers");
    savedServers = data.servers || [];
  } catch (_) {
    savedServers = [];
  }
  const servers = savedServers;
  const wrap = $("saved-wrap");
  const list = $("saved-list");
  wrap.hidden = servers.length === 0;
  list.innerHTML = "";
  selectedServerIds = new Set();

  // Toplu işlem çubuğu
  const bar = document.createElement("div");
  bar.className = "srv-bulk";
  bar.innerHTML = `<button type="button" id="srv-del-selected" class="srv-bulk-btn danger" hidden>Seçilenleri Sil</button>
     <button type="button" id="srv-del-all" class="srv-bulk-btn">Tümünü Sil</button>`;
  list.appendChild(bar);

  const updateBulkBtn = () => {
    const btn = $("srv-del-selected");
    btn.hidden = selectedServerIds.size === 0;
    btn.textContent = `Seçilenleri Sil (${selectedServerIds.size})`;
  };
  const bulkDelete = async (json, confirmMsg) => {
    if (!confirm(confirmMsg)) return;
    try {
      await api("servers/bulk-delete", { method: "POST", json });
    } catch (e) {
      toast(e.message, true);
    }
    renderSavedServers();
  };

  // Gruplara ayır (eklenme sırası korunur)
  const groups = new Map();
  servers.forEach((s) => {
    const g = (s.group || "").trim();
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  });

  const collapsed = loadCollapsedGroups();

  groups.forEach((items, g) => {
    const label = g || "Gruplanmamış";
    const isCollapsed = collapsed.has(label);
    const section = document.createElement("div");
    section.className = "srv-group" + (isCollapsed ? " collapsed" : "");
    const head = document.createElement("div");
    head.className = "srv-group-head";
    head.innerHTML = `<span class="srv-group-name"><span class="srv-chevron">▾</span> 📁 ${escapeHtml(label)} <span class="srv-group-count">${items.length}</span></span>`;
    const delG = document.createElement("button");
    delG.type = "button";
    delG.className = "srv-group-del";
    delG.textContent = "🗑 Grubu sil";
    delG.addEventListener("click", (e) => {
      e.stopPropagation();
      bulkDelete(
        g ? { group: g } : { ids: items.map((x) => x.id) },
        `"${label}" grubundaki ${items.length} sunucu silinsin mi?`,
      );
    });
    head.appendChild(delG);
    section.appendChild(head);

    const inner = document.createElement("div");
    inner.className = "saved-list";
    inner.hidden = isCollapsed;
    items.forEach((s) => inner.appendChild(buildServerCell(s, updateBulkBtn)));
    section.appendChild(inner);

    // Başlığa tıkla → aç/kapa (kalıcı)
    head.querySelector(".srv-group-name").addEventListener("click", () => {
      const nowCollapsed = !section.classList.contains("collapsed");
      section.classList.toggle("collapsed", nowCollapsed);
      inner.hidden = nowCollapsed;
      const set = loadCollapsedGroups();
      if (nowCollapsed) set.add(label);
      else set.delete(label);
      saveCollapsedGroups(set);
    });

    list.appendChild(section);
  });

  $("srv-del-all").addEventListener("click", () =>
    bulkDelete(
      { all: true },
      `TÜM kayıtlı sunucular (${servers.length}) silinsin mi?`,
    ),
  );
  $("srv-del-selected").addEventListener("click", () => {
    const ids = [...selectedServerIds];
    if (ids.length) bulkDelete({ ids }, `${ids.length} sunucu silinsin mi?`);
  });
}

// Tek bir kayıtlı sunucu hücresi (seçim kutusu + kart)
function buildServerCell(s, updateBulkBtn) {
  const hasCreds = !!(s.password || s.privateKey);
  const online = connections.some(
    (c) =>
      c.info.host === s.host &&
      c.info.username === s.username &&
      String(c.info.port) === String(s.port),
  );
  const cell = document.createElement("div");
  cell.className = "srv-cell";
  const pick = document.createElement("input");
  pick.type = "checkbox";
  pick.className = "srv-pick";
  pick.title = "Toplu silme için seç";
  pick.addEventListener("click", (e) => e.stopPropagation());
  pick.addEventListener("change", () => {
    if (pick.checked) selectedServerIds.add(s.id);
    else selectedServerIds.delete(s.id);
    cell.classList.toggle("picked", pick.checked);
    updateBulkBtn();
  });
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
  el.querySelector(".srv-host").textContent =
    `${protoUp} · ${s.username}@${s.host}:${s.port}`;
  el.addEventListener("click", () => selectServer(s));
  el.querySelector(".srv-del").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`"${s.name}" kaydı silinsin mi?`)) return;
    try {
      await api("servers/" + encodeURIComponent(s.id), { method: "DELETE" });
    } catch (err) {
      toast(err.message, true);
    }
    renderSavedServers();
  });
  cell.appendChild(pick);
  cell.appendChild(el);
  return cell;
}

// ---------- FileZilla içe aktarma (sitemanager.xml) ----------
$("import-fz").addEventListener("click", () => $("fz-file").click());
$("fz-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importFileZilla(file);
  $("fz-file").value = "";
});

// base64 (UTF-8 güvenli) çöz
function b64decode(str) {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch (_) {
    try {
      return atob(str);
    } catch (_) {
      return "";
    }
  }
}

// FileZilla protokol numarasını uygulamanın protokolüne çevir
function fzProtocol(num) {
  switch (String(num)) {
    case "1":
      return "sftp"; // SFTP
    case "3":
    case "4":
      return "ftps"; // FTPS (implicit/explicit)
    case "0":
    default:
      return "ftp"; // FTP (varsayılan)
  }
}

// Bir <Server> düğümünden site adını çıkar (<Name> ya da düğümün metni)
function fzServerName(node) {
  const nameEl = node.querySelector(":scope > Name");
  if (nameEl && nameEl.textContent.trim()) return nameEl.textContent.trim();
  // Eski sürümler adı doğrudan <Server> metni olarak tutar
  let txt = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) txt += n.textContent;
  });
  return txt.trim();
}

// Tek bir <Server> düğümünü sunucu nesnesine çevir (grup hariç)
function fzServerToObj(s) {
  const get = (tag) => {
    const el = s.querySelector(":scope > " + tag);
    return el ? el.textContent.trim() : "";
  };
  const host = get("Host");
  if (!host) return null;
  const protocol = fzProtocol(get("Protocol"));
  const passEl = s.querySelector(":scope > Pass");
  let password = "";
  if (passEl) {
    password =
      passEl.getAttribute("encoding") === "base64"
        ? b64decode(passEl.textContent.trim())
        : passEl.textContent.trim();
  }
  let username = get("User");
  const logontype = get("Logontype");
  if (!username && logontype === "0") username = "anonymous"; // anonim giriş
  return {
    name: fzServerName(s) || `${username || "user"}@${host}`,
    host,
    port: Number(get("Port")) || (protocol === "sftp" ? 22 : 21),
    username: username || "anonymous",
    protocol,
    auth: "password",
    password,
  };
}

// Bir <Folder> düğümünün doğrudan metni = klasör adı (alt düğümler hariç)
function fzFolderName(node) {
  let nm = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) nm += n.textContent;
  });
  return nm.trim() || "Klasör";
}

// Ağacı dolaş: <Folder> → grup yolu (iç içe " / " ile), <Server> → nesne
function fzWalk(node, path, out) {
  node.childNodes.forEach((child) => {
    if (child.nodeType !== 1) return; // yalnızca elemanlar
    if (child.tagName === "Folder") {
      fzWalk(child, path.concat(fzFolderName(child)), out);
    } else if (child.tagName === "Server") {
      const srv = fzServerToObj(child);
      if (srv) {
        srv.group = path.join(" / ");
        out.push(srv);
      }
    }
  });
}

// sitemanager.xml metnini ayrıştır → gruplu sunucu nesneleri
function parseFileZilla(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("XML okunamadı (geçersiz dosya).");
  const out = [];
  const root = doc.querySelector("Servers") || doc.documentElement;
  if (root) fzWalk(root, [], out);
  return out;
}

async function importFileZilla(file) {
  showLoading(true);
  try {
    const text = await file.text();
    const servers = parseFileZilla(text);
    if (!servers.length) {
      toast("Dosyada içe aktarılacak sunucu bulunamadı.", true);
      return;
    }
    let ok = 0;
    for (const srv of servers) {
      try {
        await api("servers", { method: "POST", json: srv });
        ok++;
      } catch (e) {
        console.warn("İçe aktarılamadı:", srv.host, e.message);
      }
    }
    await renderSavedServers();
    toast(`FileZilla'dan ${ok}/${servers.length} sunucu içe aktarıldı.`);
  } catch (e) {
    toast("İçe aktarma hatası: " + e.message, true);
  } finally {
    showLoading(false);
  }
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
  const auth = s.protocol && s.protocol !== "sftp" ? "password" : s.auth;
  document.querySelector(`.tab[data-auth="${auth}"]`).click();
  const hasCreds = !!(s.password || s.privateKey);
  if (hasCreds) {
    f.requestSubmit
      ? f.requestSubmit()
      : f.dispatchEvent(new Event("submit", { cancelable: true }));
  } else {
    (s.auth === "key" ? f.privateKey : f.password).focus();
    $("login-error").textContent =
      "Bu sunucu için " + (s.auth === "key" ? "anahtar" : "parola") + " girin.";
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
    allItems = data.items;
    if ($("file-search")) $("file-search").value = "";
    fileFilter = "";
    applyFileView();
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
  $("quick-links")
    .querySelectorAll("a")
    .forEach((a) => {
      a.classList.toggle("active", a.dataset.path === cwd);
    });
}

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
  image: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "svg",
    "webp",
    "bmp",
    "ico",
    "tiff",
    "heic",
  ],
  video: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v"],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"],
  archive: ["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"],
  pdf: ["pdf"],
  sheet: ["xls", "xlsx", "csv", "ods"],
  doc: ["doc", "docx", "rtf", "odt", "txt", "md", "markdown", "log"],
  code: [
    "js",
    "mjs",
    "cjs",
    "ts",
    "tsx",
    "jsx",
    "vue",
    "svelte",
    "py",
    "rb",
    "php",
    "pl",
    "lua",
    "sh",
    "bash",
    "zsh",
    "c",
    "h",
    "cpp",
    "hpp",
    "cc",
    "cs",
    "java",
    "kt",
    "go",
    "rs",
    "swift",
    "sql",
    "r",
    "dart",
    "html",
    "htm",
    "css",
    "scss",
    "sass",
    "less",
  ],
  config: [
    "json",
    "json5",
    "xml",
    "yml",
    "yaml",
    "toml",
    "ini",
    "conf",
    "cfg",
    "env",
    "properties",
  ],
};
// kategori → [gövde, köşe, etiket]
const CAT_STYLE = {
  image: ["#34d399", "#10b981", "IMG"],
  video: ["#818cf8", "#6366f1", "VID"],
  audio: ["#f0abfc", "#e879f9", "MP3"],
  archive: ["#fbbf24", "#f59e0b", "ZIP"],
  pdf: ["#f87171", "#ef4444", "PDF"],
  sheet: ["#4ade80", "#22c55e", "XLS"],
  doc: ["#60a5fa", "#3b82f6", "DOC"],
  code: ["#a78bfa", "#8b5cf6", "</>"],
  config: ["#94a3b8", "#64748b", "CFG"],
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
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  let n = bytes;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
}
function fmtDate(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleString("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function typeLabel(item) {
  if (item.type === "dir") return "Klasör";
  if (item.type === "link") return "Bağlantı";
  const ext = item.name.split(".").pop().toUpperCase();
  return ext === item.name.toUpperCase() ? "Dosya" : ext + " dosyası";
}

let currentItems = [];
let allItems = []; // klasörün filtrelenmemiş tam listesi
let fileFilter = ""; // arama kutusundaki metin
let showHidden = localStorage.getItem("showHidden") !== "0"; // gizli (.) dosyalar görünsün mü
let selectedItem = null;
let viewMode = localStorage.getItem("viewMode") || "grid"; // varsayılan: masaüstü tarzı simge

// Tam listeyi gizli-filtre + arama metnine göre süzüp aktif görünümü çizer
function applyFileView() {
  let items = allItems;
  if (!showHidden) items = items.filter((i) => !i.name.startsWith("."));
  const q = fileFilter.trim().toLowerCase();
  if (q) items = items.filter((i) => i.name.toLowerCase().includes(q));
  renderList(items);
}

// Arama kutusu (canlı filtre)
if ($("file-search")) {
  $("file-search").addEventListener("input", (e) => {
    fileFilter = e.target.value;
    applyFileView();
  });
  $("file-search").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.target.value = "";
      fileFilter = "";
      applyFileView();
    }
  });
}

// Gizli dosyaları göster/gizle
function updateHiddenBtn() {
  const b = $("btn-hidden");
  if (b) b.classList.toggle("active", !showHidden);
}
if ($("btn-hidden")) {
  $("btn-hidden").addEventListener("click", () => {
    showHidden = !showHidden;
    localStorage.setItem("showHidden", showHidden ? "1" : "0");
    updateHiddenBtn();
    applyFileView();
  });
  updateHiddenBtn();
}

function selectEl(el, item) {
  $("file-area")
    .querySelectorAll(".selected")
    .forEach((e) => e.classList.remove("selected"));
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
  if (!diskInfo || !diskInfo.available) {
    box.innerHTML = "";
    return;
  }
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
  } catch (_) {
    diskInfo = null;
  }
  renderSideDisk();
}

// Tarayıcıda düzenlenebilir kabul edilen dosya uzantıları / adları
const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "log",
  "csv",
  "tsv",
  "ini",
  "conf",
  "cfg",
  "cnf",
  "config",
  "env",
  "properties",
  "json",
  "json5",
  "xml",
  "yml",
  "yaml",
  "toml",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "vue",
  "svelte",
  "py",
  "rb",
  "php",
  "pl",
  "lua",
  "sh",
  "bash",
  "zsh",
  "fish",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cs",
  "java",
  "kt",
  "go",
  "rs",
  "swift",
  "sql",
  "r",
  "dart",
  "gitignore",
  "dockerfile",
  "makefile",
  "gradle",
  "bat",
  "ps1",
  "htaccess",
  "service",
  "nginx",
]);
const TEXT_NAMES = new Set([
  ".bashrc",
  ".bash_profile",
  ".bash_history",
  ".profile",
  ".zshrc",
  ".gitconfig",
  ".vimrc",
  ".npmrc",
  ".env",
  ".gitignore",
  "dockerfile",
  "makefile",
  ".wget-hsts",
  "authorized_keys",
  "known_hosts",
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

async function newFolder() {
  const name = prompt("Yeni klasör adı:");
  if (!name) return;
  try {
    await api("mkdir", { method: "POST", json: { path: cwd, name } });
    toast("Klasör oluşturuldu");
    navigate(cwd, false);
  } catch (e) {
    toast(e.message, true);
  }
}
$("btn-newfolder").addEventListener("click", newFolder);

// ---------- İndir / Yükle ----------
function triggerDownload(url) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function downloadFile(fullPath) {
  triggerDownload(
    "/api/download?session=" +
      encodeURIComponent(session) +
      "&path=" +
      encodeURIComponent(fullPath),
  );
}
function downloadFolder(fullPath) {
  toast("Klasör arşivleniyor, indirme birazdan başlayacak...");
  triggerDownload(
    "/api/download-folder?session=" +
      encodeURIComponent(session) +
      "&path=" +
      encodeURIComponent(fullPath),
  );
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
    const s = editorArea.selectionStart,
      en = editorArea.selectionEnd;
    editorArea.value =
      editorArea.value.slice(0, s) + "\t" + editorArea.value.slice(en);
    editorArea.selectionStart = editorArea.selectionEnd = s + 1;
    editorArea.dispatchEvent(new Event("input"));
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveEditor();
  }
});

async function saveEditor() {
  if (!editorPath) return;
  const btn = $("editor-save");
  btn.disabled = true;
  try {
    await api("save", {
      method: "POST",
      json: { path: editorPath, content: editorArea.value },
    });
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
  if (
    editorDirty &&
    !confirm("Kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?")
  )
    return;
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
$("docker-close").addEventListener("click", () => {
  $("docker-panel").hidden = true;
});
$("docker-refresh").addEventListener("click", loadDocker);
document.querySelectorAll(".dk-tab").forEach((t) => {
  t.addEventListener("click", () => {
    document
      .querySelectorAll(".dk-tab")
      .forEach((x) => x.classList.remove("active"));
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
      // Canlı CPU/RAM kullanımını paralel çek (hata olursa konteynerler yine listelenir)
      const statsData = await api("docker/stats").catch(() => ({
        available: false,
      }));
      const statsMap = {};
      if (statsData.available) {
        for (const st of statsData.stats || []) {
          if (st.name) statsMap[st.name] = st;
          if (st.id) {
            statsMap[st.id] = st;
            statsMap[st.id.slice(0, 12)] = st;
          }
        }
      }
      renderContainers(data.containers, statsMap);
    } else if (dockerTab === "idle") {
      const data = await api("docker/idle");
      if (!data.available) return showDockerUnavailable(data.error);
      renderIdle(data.containers, data.now);
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
    (err ? `<br><br><span class="dk-sub">${escapeHtml(err)}</span>` : "") +
    `</div>`;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// Tek bir konteyner satırı (<tr>) üret
function containerRow(c, statsMap) {
  const st = (c.state || "").toLowerCase();
  const cls = st.includes("run")
    ? "running"
    : st.includes("paus")
      ? "paused"
      : "exited";
  const running = cls === "running";
  const paused = cls === "paused";
  const stat =
    statsMap[c.name] ||
    statsMap[c.id] ||
    statsMap[(c.id || "").slice(0, 12)] ||
    null;
  const cpu = stat && stat.cpu ? stat.cpu : "—";
  const mem = stat && stat.mem ? stat.mem : "—";
  const memPerc = stat && stat.memPerc ? stat.memPerc : "";
  const a = [];
  if (!running && !paused)
    a.push(btn("start", c.id, "container", "▶ Başlat", "go"));
  if (running)
    a.push(
      btn(
        paused ? "unpause" : "pause",
        c.id,
        "container",
        paused ? "▶ Devam" : "⏸ Duraklat",
      ),
    );
  if (running || paused) a.push(btn("stop", c.id, "container", "⏹ Durdur"));
  a.push(btn("restart", c.id, "container", "⟳ Yeniden başlat"));
  if (running)
    a.push(
      `<button class="dk-btn" onclick="openTerminal('${c.id}','${escapeAttr(c.name)}')">⌨ Terminal</button>`,
    );
  a.push(
    `<button class="dk-btn" onclick="dockerLogs('${c.id}','${escapeAttr(c.name)}')">📄 Loglar</button>`,
  );
  a.push(btn("rm", c.id, "container", "🗑 Sil", "danger"));
  return `<tr>
    <td><div class="dk-name">${escapeHtml(c.name)}</div><div class="dk-sub">${escapeHtml(c.image)}</div></td>
    <td><span class="dk-state ${cls}"><span class="dot"></span>${escapeHtml(c.status || c.state)}</span></td>
    <td class="dk-metric">${escapeHtml(cpu)}</td>
    <td class="dk-metric"><div>${escapeHtml(mem)}</div>${memPerc ? `<div class="dk-sub">${escapeHtml(memPerc)}</div>` : ""}</td>
    <td class="dk-sub">${escapeHtml(c.ports || "—")}</td>
    <td><div class="dk-actions">${a.join("")}</div></td>
  </tr>`;
}

const DK_HEAD = `<thead><tr><th>Konteyner</th><th>Durum</th><th>CPU</th><th>RAM</th><th>Portlar</th><th></th></tr></thead>`;

function renderContainers(list, statsMap = {}) {
  $("docker-status").textContent = `${list.length} konteyner`;
  if (!list.length) {
    $("docker-body").innerHTML = `<div class="dk-msg">Hiç konteyner yok.</div>`;
    return;
  }

  // compose projesine göre grupla (eklenme sırası korunur)
  const groups = new Map();
  list.forEach((c) => {
    const g = (c.group || "").trim();
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  });
  const hasGroups = [...groups.keys()].some((k) => k);

  if (!hasGroups) {
    const rows = list.map((c) => containerRow(c, statsMap)).join("");
    $("docker-body").innerHTML =
      `<table class="dk-table">${DK_HEAD}<tbody>${rows}</tbody></table>`;
    return;
  }

  let html = "";
  groups.forEach((items, g) => {
    const label = g || "Diğer (compose dışı)";
    const rows = items.map((c) => containerRow(c, statsMap)).join("");
    html += `<div class="dk-group">
      <div class="dk-group-head">🧩 ${escapeHtml(label)} <span class="srv-group-count">${items.length}</span></div>
      <table class="dk-table">${DK_HEAD}<tbody>${rows}</tbody></table>
    </div>`;
  });
  $("docker-body").innerHTML = html;
}

function renderImages(list) {
  $("docker-status").textContent = `${list.length} görüntü`;
  if (!list.length) {
    $("docker-body").innerHTML = `<div class="dk-msg">Hiç görüntü yok.</div>`;
    return;
  }
  const rows = list
    .map(
      (i) => `<tr>
    <td><div class="dk-name">${escapeHtml((i.repo || "<none>") + ":" + (i.tag || "latest"))}</div><div class="dk-sub">${escapeHtml(i.id)}</div></td>
    <td class="dk-sub">${escapeHtml(i.size || "")}</td>
    <td class="dk-sub">${escapeHtml(i.created || "")}</td>
    <td><div class="dk-actions">${btn("rmi", i.id, "image", "🗑 Sil", "danger")}</div></td>
  </tr>`,
    )
    .join("");
  $("docker-body").innerHTML =
    `<table class="dk-table"><thead><tr><th>Görüntü</th><th>Boyut</th><th>Oluşturulma</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Süreyi "3 gün", "5 saat", "12 dk" gibi yaz
function fmtDuration(ms) {
  if (!ms || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} gün${h ? " " + h + " sa" : ""}`;
  if (h > 0) return `${h} saat${m ? " " + m + " dk" : ""}`;
  if (m > 0) return `${m} dk`;
  return `${sec} sn`;
}

// Boşta / eski konteynerler — son hareketten bu yana geçen süreye göre sıralı
const IDLE_THRESHOLD = 7 * 86400 * 1000; // 7 gün → "uzun süredir kullanılmıyor"
function renderIdle(list, now) {
  if (!list.length) {
    $("docker-body").innerHTML = `<div class="dk-msg">Hiç konteyner yok.</div>`;
    return;
  }
  const longIdle = list.filter(
    (c) => !c.running && c.idleMs >= IDLE_THRESHOLD,
  ).length;
  $("docker-status").textContent = longIdle
    ? `${longIdle} konteyner 7+ gündür durdurulmuş`
    : `${list.length} konteyner`;

  const rows = list
    .map((c) => {
      const idle = fmtDuration(c.idleMs);
      const stale = !c.running && c.idleMs >= IDLE_THRESHOLD;
      const stateCls = c.running ? "running" : "exited";
      const activity = c.running
        ? `⬆ ${idle} süredir çalışıyor`
        : c.finishedAt
          ? `⏹ ${idle} önce durdu`
          : `oluşturuldu, hiç çalışmadı`;
      const created = c.created ? fmtDate(c.created) : "—";
      const lastSeen = c.lastActivity ? fmtDate(c.lastActivity) : "—";
      const a = [];
      if (!c.running) a.push(btn("start", c.id, "container", "▶ Başlat", "go"));
      a.push(
        `<button class="dk-btn" onclick="dockerLogs('${c.id}','${escapeAttr(c.name)}')">📄 Loglar</button>`,
      );
      a.push(btn("rm", c.id, "container", "🗑 Sil", "danger"));
      return `<tr class="${stale ? "dk-stale" : ""}">
      <td>
        <div class="dk-name">${stale ? "⚠️ " : ""}${escapeHtml(c.name)}</div>
        <div class="dk-sub">${escapeHtml(c.image)}</div>
        ${c.cmd ? `<div class="dk-sub dk-cmd" title="${escapeAttr(c.cmd)}">$ ${escapeHtml(c.cmd)}</div>` : ""}
      </td>
      <td><span class="dk-state ${stateCls}"><span class="dot"></span>${escapeHtml(c.status)}</span></td>
      <td class="dk-metric"><div>${escapeHtml(activity)}</div><div class="dk-sub">son: ${escapeHtml(lastSeen)}</div></td>
      <td class="dk-sub">${escapeHtml(created)}</td>
      <td class="dk-sub">${c.restartCount}×</td>
      <td><div class="dk-actions">${a.join("")}</div></td>
    </tr>`;
    })
    .join("");
  const tools = `<div class="dk-prune">
      <button class="dk-btn danger" onclick="dockerPrune('containers')">🧹 Durmuş konteynerleri sil</button>
      <button class="dk-btn danger" onclick="dockerPrune('images')">🧹 Artık (dangling) imajları sil</button>
    </div>`;
  const hint = longIdle
    ? `<div class="dk-msg" style="text-align:left;padding:10px 14px;opacity:.8">⚠️ işaretli konteynerler 7+ gündür durdurulmuş — artık gerekmiyorsa silebilirsin.</div>`
    : "";
  $("docker-body").innerHTML =
    tools +
    hint +
    `<table class="dk-table"><thead><tr><th>Konteyner</th><th>Durum</th><th>Son hareket</th><th>Oluşturulma</th><th>Restart</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Docker temizliği: durmuş konteynerler veya artık imajlar
async function dockerPrune(what) {
  const msg =
    what === "containers"
      ? "TÜM durmuş konteynerler kalıcı olarak silinsin mi? (çalışanlar etkilenmez)"
      : "Kullanılmayan (dangling) tüm imajlar silinsin mi?";
  if (!confirm(msg)) return;
  showLoading(true);
  try {
    const r = await api("docker/prune", { method: "POST", json: { what } });
    toast(r.output ? r.output.split("\n").slice(-1)[0] : "Temizlik tamam");
    await loadDocker();
  } catch (e) {
    toast(e.message, true);
  } finally {
    showLoading(false);
  }
}
window.dockerPrune = dockerPrune;

function btn(action, id, type, label, extra = "") {
  return `<button class="dk-btn ${extra}" onclick="dockerAction('${action}','${id}','${type}')">${label}</button>`;
}
function escapeAttr(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

async function dockerAction(action, id, type) {
  const labels = {
    start: "başlatılsın",
    stop: "durdurulsun",
    restart: "yeniden başlatılsın",
    pause: "duraklatılsın",
    unpause: "devam etsin",
    rm: "SİLİNSİN",
    rmi: "SİLİNSİN",
  };
  if (
    (action === "rm" || action === "rmi") &&
    !confirm(
      `Bu ${type === "image" ? "görüntü" : "konteyner"} kalıcı olarak silinsin mi?`,
    )
  )
    return;
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
$("logs-close").addEventListener("click", () => {
  $("docker-logs").hidden = true;
  logsCtxId = null;
});

// ---------- Konteyner terminali (xterm + WebSocket) ----------
let termState = null;
function openTerminal(id, name, dir) {
  if (!session) {
    toast("Önce bir sunucuya bağlan.", true);
    return;
  }
  if (typeof Terminal === "undefined") {
    toast("Terminal bileşeni yüklenemedi.", true);
    return;
  }
  $("term-title").textContent = "⌨ " + name;
  $("terminal-modal").hidden = false;
  const host = $("term-host");
  host.innerHTML = "";

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    theme: { background: "#0b1020", foreground: "#e6e9ef" },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  // modal yeni görünür olduğundan layout oturana kadar bekleyip fit et
  requestAnimationFrame(() => {
    try {
      fit.fit();
      sendResize();
    } catch (_) {}
  });
  term.focus();

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url =
    `${proto}://${location.host}/api/terminal?session=${encodeURIComponent(session)}` +
    `&id=${encodeURIComponent(id)}&cols=${term.cols}&rows=${term.rows}` +
    (dir ? `&dir=${encodeURIComponent(dir)}` : "");
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const sendResize = () => {
    if (ws.readyState === 1)
      ws.send(JSON.stringify({ r: [term.cols, term.rows] }));
  };
  ws.onopen = () => {
    try {
      fit.fit();
    } catch (_) {}
    sendResize();
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") term.write(ev.data);
    else term.write(new Uint8Array(ev.data));
  };
  ws.onclose = () => term.write("\r\n\x1b[90m[bağlantı kapandı]\x1b[0m\r\n");
  ws.onerror = () => term.write("\r\n\x1b[31m[bağlantı hatası]\x1b[0m\r\n");

  term.onData((d) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ i: d }));
  });
  const onResize = () => {
    try {
      fit.fit();
      sendResize();
    } catch (_) {}
  };
  window.addEventListener("resize", onResize);

  termState = { term, ws, onResize };
}
function closeTerminal() {
  if (termState) {
    window.removeEventListener("resize", termState.onResize);
    try {
      termState.ws.close();
    } catch (_) {}
    try {
      termState.term.dispose();
    } catch (_) {}
    termState = null;
  }
  $("terminal-modal").hidden = true;
}
// Sunucunun kendisinde (host) interaktif kabuk aç.
// dir verilirse kabuk o dizinde açılır.
function openServerTerminal(dir) {
  const name = dir ? "Terminal — " + dir : "Sunucu Terminali";
  openTerminal("__host__", name, dir);
}
$("term-close").addEventListener("click", closeTerminal);
const btnTerminal = $("btn-terminal");
if (btnTerminal) btnTerminal.addEventListener("click", openServerTerminal);

// onclick içinden erişim için global'e aç
window.dockerAction = dockerAction;
window.dockerLogs = dockerLogs;
window.openTerminal = openTerminal;

$("check-all").addEventListener("change", (e) => {
  $("file-area")
    .querySelectorAll(".row-check")
    .forEach((cb) => {
      cb.checked = e.target.checked;
      const entry = cb.closest("tr, .tile");
      if (entry) entry.classList.toggle("checked", cb.checked);
    });
  syncCheckState();
});

// Görünüm değiştir (simge ızgarası / liste)
function applyViewButton() {
  $("btn-view").innerHTML =
    viewMode === "grid"
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
    const params = checked
      .map((i) => "name=" + encodeURIComponent(i.name))
      .join("&");
    triggerDownload(
      "/api/download-multi?session=" +
        encodeURIComponent(session) +
        "&dir=" +
        encodeURIComponent(cwd) +
        "&" +
        params,
    );
    return;
  }
  const one = checked[0] || selectedItem;
  if (!one) {
    toast("Önce indirmek istediğin dosya/klasörü seç (kutucuk).", true);
    return;
  }
  downloadItem(one);
});

$("btn-upload").addEventListener("click", () => $("file-input").click());
// Dropzone: arka plana tıklayınca dosya seç; içindeki butonlar dosya/klasör seçer
$("dropzone").addEventListener("click", (e) => {
  if (e.target.closest("#dz-files, #dz-folder")) return; // buton kendi işini yapar
  $("file-input").click();
});
$("dz-files") &&
  $("dz-files").addEventListener("click", () => $("file-input").click());
$("dz-folder") &&
  $("dz-folder").addEventListener("click", () => $("folder-input").click());
// Dosya seçimi: webkitRelativePath varsa (klasör seçimi) onu göreli yol olarak kullan
$("file-input").addEventListener("change", (e) => {
  const entries = Array.from(e.target.files).map((f) => ({
    file: f,
    rel: f.webkitRelativePath || f.name,
  }));
  uploadEntries(entries);
});
if ($("folder-input")) {
  $("btn-upload-folder") &&
    $("btn-upload-folder").addEventListener("click", () =>
      $("folder-input").click(),
    );
  $("folder-input").addEventListener("change", (e) => {
    const entries = Array.from(e.target.files).map((f) => ({
      file: f,
      rel: f.webkitRelativePath || f.name,
    }));
    uploadEntries(entries);
    $("folder-input").value = "";
  });
}

// Oturum boyunca hatırlanan aktarım tercihleri (FileZilla'daki "tekrar sorma" gibi)
let uploadPrefs = null;

// {file, rel} listesini paralel/akışlı olarak sunucuya yükler, ilerleme gösterir.
async function uploadEntries(entries) {
  entries = (entries || []).filter((e) => e && e.file);
  if (!entries.length) {
    toast("Yüklenecek dosya bulunamadı.", true);
    return;
  }

  // Aktarım seçeneklerini sor (çakışma davranışı + paralel sayısı)
  const opts = uploadPrefs || (await askUploadOptions(entries));
  if (!opts) {
    $("file-input").value = "";
    return;
  } // iptal
  if (opts.remember)
    uploadPrefs = { conflict: opts.conflict, concurrency: opts.concurrency };

  const fd = new FormData();
  fd.append("path", cwd);
  fd.append("conflict", opts.conflict);
  fd.append("concurrency", String(opts.concurrency));
  for (const { file, rel } of entries) {
    fd.append("files", file);
    fd.append("paths", rel || file.name);
  }
  const targetDir = cwd;
  setUploadProgress(0, entries.length);
  try {
    const r = await uploadWithProgress(fd);
    setUploadProgress(null);
    const parts = [];
    if (r.count) parts.push(`${r.count} yüklendi`);
    if (r.renamed) parts.push(`${r.renamed} yeniden adlandırıldı`);
    if (r.skipped) parts.push(`${r.skipped} atlandı`);
    if (r.failed) {
      parts.push(`${r.failed} başarısız`);
      toast(parts.join(", ") + (r.error ? ` — ${r.error}` : ""), true);
    } else toast(parts.join(", ") || "Yükleme tamam");
    if (cwd === targetDir) navigate(cwd, false);
  } catch (e) {
    setUploadProgress(null);
    toast(e.message, true);
  } finally {
    $("file-input").value = "";
  }
}

// Aktarım seçenekleri diyaloğu → {conflict, concurrency, remember} veya null (iptal)
function askUploadOptions(entries) {
  return new Promise((resolve) => {
    const dlg = $("upload-options");
    if (!dlg)
      return resolve({
        conflict: "overwrite",
        concurrency: 4,
        remember: false,
      });
    const count = entries.length;
    let bytes = 0;
    for (const e of entries) bytes += (e.file && e.file.size) || 0;
    $("uo-summary").textContent = `${count} dosya (${fmtSize(bytes)}) → ${cwd}`;
    $("uo-remember").checked = false;
    dlg.hidden = false;

    const cleanup = () => {
      dlg.hidden = true;
      $("uo-start").removeEventListener("click", onStart);
      $("uo-cancel").removeEventListener("click", onCancel);
    };
    const onStart = () => {
      const conflict =
        (dlg.querySelector('input[name="uo-conflict"]:checked') || {}).value ||
        "overwrite";
      const concurrency = parseInt($("uo-concurrency").value, 10) || 4;
      const remember = $("uo-remember").checked;
      cleanup();
      resolve({ conflict, concurrency, remember });
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    $("uo-start").addEventListener("click", onStart);
    $("uo-cancel").addEventListener("click", onCancel);
  });
}

// XHR ile yükleme: yükleme ilerlemesini (%) raporlar.
function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    if (session) xhr.setRequestHeader("x-session", session);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadProgress(ev.loaded / ev.total);
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401) logout();
      reject(new Error(data.error || "Yükleme hatası (" + xhr.status + ")"));
    };
    xhr.onerror = () => reject(new Error("Sunucuya ulaşılamadı."));
    xhr.send(formData);
  });
}

// İlerleme göstergesi. frac: 0..1 veya null (gizle). count: dosya sayısı (başlangıçta).
function setUploadProgress(frac, count) {
  const box = $("upload-progress");
  if (!box) {
    showLoading(frac !== null);
    return;
  }
  if (frac === null) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const pct = Math.round((frac || 0) * 100);
  const bar = $("upload-progress-bar");
  const label = $("upload-progress-label");
  if (bar) bar.style.width = pct + "%";
  if (label)
    label.textContent =
      count != null
        ? `${count} dosya yükleniyor… %${pct}`
        : `Yükleniyor… %${pct}`;
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
  if (hasFiles(e)) {
    $("drop-hint").hidden = false;
    $("dropzone").classList.add("dragging");
  }
});
window.addEventListener("dragover", (e) => {
  if (!explorerActive()) return;
  e.preventDefault(); // her durumda: tarayıcının dosyayı açmasını engelle
  try {
    e.dataTransfer.dropEffect = "copy";
  } catch (_) {}
});
window.addEventListener("dragleave", (e) => {
  if (!explorerActive()) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    $("drop-hint").hidden = true;
    $("dropzone").classList.remove("dragging");
  }
});
window.addEventListener("drop", async (e) => {
  if (!explorerActive()) return;
  e.preventDefault();
  dragDepth = 0;
  $("drop-hint").hidden = true;
  $("dropzone").classList.remove("dragging");
  const dt = e.dataTransfer;
  if (!dt) return;

  // Klasör sürüklemeyi de destekle: webkitGetAsEntry ile dizinleri özyinelemeli tara.
  // ÖNEMLİ: entry'leri olay döngüsü dönmeden ÖNCE (await öncesi) senkron yakala.
  const items = dt.items ? Array.from(dt.items) : [];
  const roots = items
    .filter(
      (it) => it.kind === "file" && typeof it.webkitGetAsEntry === "function",
    )
    .map((it) => it.webkitGetAsEntry())
    .filter(Boolean);
  const hasDir = roots.some((r) => r && r.isDirectory);

  if (roots.length) {
    setUploadProgress(0); // tarama sürerken kullanıcıyı oyalama
    try {
      const entries = [];
      for (const root of roots) await walkEntry(root, "", entries);
      setUploadProgress(null);
      if (entries.length) return uploadEntries(entries);
      if (hasDir) return toast("Klasör boş görünüyor ya da okunamadı.", true);
    } catch (err) {
      setUploadProgress(null);
      return toast("Klasör okunamadı: " + ((err && err.message) || err), true);
    }
  }
  // Geri dönüş: düz dosya listesi (klasör yoksa)
  const files = dt.files;
  if (files && files.length)
    uploadEntries(
      Array.from(files).map((f) => ({
        file: f,
        rel: f.webkitRelativePath || f.name,
      })),
    );
  else toast("Sürüklenen öğede yüklenebilir dosya yok.", true);
});

// Bir dizin okuyucusundaki TÜM girdileri (parça parça gelir) topla
function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const read = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          read();
        }
      }, reject);
    read();
  });
}

// FileSystemEntry ağacını dolaşıp {file, rel} listesi üretir (klasör yapısını korur).
// Önce dizinin tüm girdilerini oku, SONRA alt dizinlere in (reader'ı kesmeden) → güvenilir.
async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, rel: prefix + entry.name });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const children = await readAllEntries(reader);
    const dirPrefix = prefix + entry.name + "/";
    for (const child of children) await walkEntry(child, dirPrefix, out);
  }
}

// ---------- Sağ tık menüsü ----------
const menu = $("context-menu");
function showContextMenu(e, item) {
  const full = joinPath(cwd, item.name);
  const actions = [];
  if (item.type === "dir") {
    actions.push({ label: "📂 Aç", fn: () => navigate(full) });
    actions.push({
      label: "⌨ Terminal'i burada aç",
      fn: () => openServerTerminal(full),
    });
    actions.push({
      label: "⬇ İndir (.tar.gz)",
      fn: () => downloadFolder(full),
    });
  } else {
    if (isEditable(item.name))
      actions.push({ label: "📝 Düzenle", fn: () => editFile(item, full) });
    actions.push({ label: "⬇ İndir", fn: () => downloadFile(full) });
  }
  actions.push({
    label: "✏ Yeniden adlandır",
    fn: () => renameItem(item, full),
  });
  actions.push({ sep: true });
  actions.push({
    label: "🗑 Sil",
    danger: true,
    fn: () => deleteItem(item, full),
  });

  renderMenu(e, actions);
}

// Verilen eylemleri context-menu öğesinde gösterir
function renderMenu(e, actions) {
  menu.innerHTML = "";
  actions.forEach((a) => {
    if (a.sep) {
      const s = document.createElement("div");
      s.className = "sep";
      menu.appendChild(s);
      return;
    }
    const el = document.createElement("div");
    el.className = "item" + (a.danger ? " danger" : "");
    el.textContent = a.label;
    el.onclick = () => {
      hideMenu();
      a.fn();
    };
    menu.appendChild(el);
  });
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + "px";
  menu.style.top =
    Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 20) + "px";
  menu.hidden = false;
}

// Boş alana (dosya/klasör dışına) sağ tıklayınca: bulunulan klasör için menü
function showAreaMenu(e) {
  if (e.target.closest("tr, .tile")) return; // öğe üstündeyse normal menü çalışır
  e.preventDefault();
  renderMenu(e, [
    { label: "⌨ Terminal'i burada aç", fn: () => openServerTerminal(cwd) },
    { label: "📁 Yeni Klasör", fn: () => newFolder() },
    { label: "🔄 Yenile", fn: () => navigate(cwd, false) },
  ]);
}
$("file-area").addEventListener("contextmenu", showAreaMenu);
function hideMenu() {
  menu.hidden = true;
}
document.addEventListener("click", hideMenu);
document.addEventListener("scroll", hideMenu, true);

async function renameItem(item, full) {
  const name = prompt("Yeni ad:", item.name);
  if (!name || name === item.name) return;
  try {
    await api("rename", {
      method: "POST",
      json: { from: full, to: joinPath(cwd, name) },
    });
    toast("Yeniden adlandırıldı");
    navigate(cwd, false);
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteItem(item, full) {
  const what = item.type === "dir" ? "klasörü ve TÜM içeriğini" : "dosyayı";
  if (!confirm(`"${item.name}" ${what} silmek istediğinize emin misiniz?`))
    return;
  try {
    await api("delete", {
      method: "POST",
      json: { path: full, type: item.type },
    });
    toast("Silindi");
    navigate(cwd, false);
  } catch (e) {
    toast(e.message, true);
  }
}

// Klavye: F5 yenile, Delete sil
document.addEventListener("keydown", (e) => {
  if (!$("editor").hidden) {
    if (e.key === "Escape") closeEditor();
    return; // editör açıkken gezgin kısayolları devre dışı
  }
  if ($("explorer").hidden) return;
  if (e.key === "F5") {
    e.preventDefault();
    navigate(cwd, false);
  }
  if (
    e.key === "Backspace" &&
    e.target.tagName !== "INPUT" &&
    e.target.tagName !== "TEXTAREA"
  ) {
    e.preventDefault();
    $("btn-up").click();
  }
});

// ---------- Masaüstü uygulaması indirmeleri (web modunda) ----------
$("open-downloads").addEventListener("click", openDownloads);
$("downloads-close").addEventListener("click", () => {
  $("downloads").hidden = true;
});

async function openDownloads() {
  $("downloads").hidden = false;
  const body = $("dl-body");
  body.innerHTML = `<div class="dl-msg">Yükleniyor…</div>`;
  let data;
  try {
    data = await api("downloads");
  } catch (e) {
    body.innerHTML = `<div class="dl-msg">Hata: ${escapeHtml(e.message)}</div>`;
    return;
  }
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
  data.items.forEach((it) => {
    (groups[it.label] = groups[it.label] || {
      icon: it.icon,
      items: [],
    }).items.push(it);
  });
  html += Object.keys(groups)
    .map((label) => {
      const g = groups[label];
      const rows = g.items
        .map(
          (it) => `
      <a class="dl-item${best && it.name === best.name ? " current" : ""}" href="${it.url}" download>
        <span class="dl-ic">⬇</span>
        <span class="dl-info">
          <span class="dl-name">${escapeHtml(prettyName(it))}</span>
          <span class="dl-meta">${escapeHtml(it.name)} • ${fmtSize(it.size)}</span>
        </span>
      </a>`,
        )
        .join("");
      return `<div class="dl-group"><div class="dl-head">${g.icon} ${escapeHtml(label)}</div>${rows}</div>`;
    })
    .join("");
  body.innerHTML = html;
}

// Tarayıcıdan işletim sistemi + mimari tahmini
async function detectPlatform() {
  let os = "",
    arch = "x64";
  const ua = navigator.userAgent || "";
  const uad = navigator.userAgentData;
  if (uad && uad.platform) {
    const p = uad.platform.toLowerCase();
    os = p.includes("mac")
      ? "mac"
      : p.includes("win")
        ? "win"
        : p.includes("linux")
          ? "linux"
          : "";
    try {
      const hv = await uad.getHighEntropyValues(["architecture"]);
      if ((hv.architecture || "").includes("arm")) arch = "arm64";
    } catch (_) {}
  } else {
    os = /mac/i.test(ua)
      ? "mac"
      : /win/i.test(ua)
        ? "win"
        : /linux|x11|android/i.test(ua)
          ? "linux"
          : "";
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
    if (n.endsWith(".exe")) return 1; // taşınabilir exe
    if (n.endsWith(".zip")) return 3; // zip en son
    return 2;
  };
  return pool.slice().sort((a, b) => rank(a) - rank(b))[0];
}

function prettyName(it) {
  let archTxt = "";
  if (it.arch === "arm64")
    archTxt = it.os === "mac" ? "Apple Silicon / ARM64" : "ARM64";
  else if (it.arch === "x64")
    archTxt = it.os === "mac" ? "Intel / x64" : "64-bit (x64)";
  const ext = (it.name.split(".").pop() || "").toUpperCase();
  const isSetup = /setup/i.test(it.name);
  const kind =
    ext === "DMG"
      ? "DMG kurulum"
      : ext === "EXE"
        ? isSetup
          ? "Kurulumlu (Setup)"
          : "Taşınabilir (portable)"
        : ext === "APPIMAGE"
          ? "AppImage (taşınabilir)"
          : ext === "DEB"
            ? "DEB paketi"
            : ext === "ZIP"
              ? "ZIP arşivi"
              : ext;
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
  btn.childNodes.forEach((n) => {
    if (n.nodeType === 3) n.textContent = "";
  });
  btn.insertBefore(
    document.createTextNode(" " + text),
    btn.querySelector(".upd-dot"),
  );
}

async function runUpdateCheck(silent) {
  if (!window.desktop || !window.desktop.checkUpdate) return;
  const btn = $("btn-update");
  if (updateChecking) return;
  updateChecking = true;
  if (btn && !silent) {
    btn.classList.add("checking");
    setUpdateLabel("Denetleniyor…");
  }
  try {
    const r = await window.desktop.checkUpdate({ silent });
    // Geliştirme modu (paketlenmemiş): indirip kuramayız, sayfayı aç
    if (r && r.packaged === false) {
      if (!r.ok) {
        if (!silent)
          toast("Güncelleme denetlenemedi: " + (r.error || "ağ hatası"), true);
        return;
      }
      if (r.hasUpdate && !silent) {
        const go = confirm(
          `Yeni sürüm var: v${r.latest} (yüklü: v${r.current})\n\nİndirme sayfasını açmak ister misin?`,
        );
        if (go) window.desktop.openExternal(r.url);
      } else if (!r.hasUpdate && !silent) {
        toast(`En güncel sürümdesin (v${r.current}).`);
      }
      return;
    }
    // Paketli: sonuç update:event ile gelecek; hata varsa burada bildir
    if (r && !r.ok && !silent)
      toast("Güncelleme denetlenemedi: " + (r.error || "hata"), true);
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
      if (!p.silent)
        toast("Güncelleme hatası: " + (p.error || "bilinmiyor"), true);
      break;
  }
}
