import { $, toast } from "./dom.js";
import { api } from "./api.js";
import { connections, activeConnId, session, setConnections, setActiveConnId } from "./state.js";
import { syncActiveConn, activateConn, renderTabs } from "./connections.js";
import { maybeSaveServer, renderSavedServers } from "./servers.js";

const DEFAULT_PORTS = { sftp: "22", ftp: "21", ftps: "21" };

export function applyProtocol(opts = {}) {
  const proto = $("protocol").value;
  const f = $("connect-form");
  const keyTab = document.querySelector('[data-auth="key"]');
  const isSsh = proto === "sftp";
  keyTab.hidden = !isSsh;
  if (!isSsh) document.querySelector('[data-auth="password"]').click();
  // Jump host yalnızca SFTP'de geçerli
  if ($("jump-section")) $("jump-section").hidden = !isSsh;
  if (!opts.keepPort) {
    const cur = f.port.value.trim();
    if (!cur || Object.values(DEFAULT_PORTS).includes(cur))
      f.port.value = DEFAULT_PORTS[proto];
  }
}

// Formdan jump (atlama sunucusu) yapılandırmasını oku; doldurulmamışsa null döner.
function readJump(f) {
  if ($("jump-section") && $("jump-section").hidden) return null;
  const host = (f.jumpHost && f.jumpHost.value.trim()) || "";
  const username = (f.jumpUsername && f.jumpUsername.value.trim()) || "";
  if (!host || !username) return null;
  return {
    host,
    port: Number(f.jumpPort && f.jumpPort.value.trim()) || 22,
    username,
    password: (f.jumpPassword && f.jumpPassword.value) || "",
    privateKey: (f.jumpPrivateKey && f.jumpPrivateKey.value) || "",
    passphrase: (f.jumpPassphrase && f.jumpPassphrase.value) || "",
  };
}

export function initLogin() {
  $("protocol").addEventListener("change", () => applyProtocol());

  document.querySelectorAll("#auth-tabs button[data-auth]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#auth-tabs button[data-auth]").forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      const mode = tab.dataset.auth;
      document.querySelector('[data-pane="password"]').hidden = mode !== "password";
      document.querySelector('[data-pane="key"]').hidden = mode !== "key";
    });
  });

  $("save-server").addEventListener("change", (e) => {
    $("save-pass-row").hidden = !e.target.checked;
  });

  // Jump host bölümünü aç/kapat
  if ($("jump-toggle")) $("jump-toggle").addEventListener("click", () => {
    const body = $("jump-body");
    const open = body.hidden;
    body.hidden = !open;
    $("jump-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    $("jump-toggle").querySelector(".jump-chevron").textContent = open ? "▾" : "▸";
  });
  // Jump host auth sekmeleri
  document.querySelectorAll("#jump-auth-tabs button[data-jauth]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#jump-auth-tabs button[data-jauth]").forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      const mode = tab.dataset.jauth;
      document.querySelector('[data-jpane="password"]').hidden = mode !== "password";
      document.querySelector('[data-jpane="key"]').hidden = mode !== "key";
    });
  });

  $("connect-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $("connect-btn");
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
      const jump = protocol === "sftp" ? readJump(f) : null;
      if (jump) body.jump = jump;
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
      if (!r.ok) throw new Error(data.error || "Bağlanılamadı (HTTP " + r.status + ")");

      const i = data.info;
      const savedName = maybeSaveServer(body);
      const home = data.home || "/";
      const conn = {
        id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        session: data.session,
        info: { host: i.host, username: i.username, port: i.port, protocol: i.protocol, via: i.via || null, name: savedName || null },
        cwd: home, homePath: home, history: [], connectedAt: Date.now(),
      };
      if (activeConnId) syncActiveConn();
      setConnections([...connections, conn]);
      $("login-close").hidden = true;
      activateConn(conn.id);
      // Bağlantı sonrası ilk açılışta sunucu panelini göster
      import("./dashboard.js").then((m) => m.openDashboard());
    } catch (err) {
      $("login-error").textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Bağlan";
    }
  });

  $("login-close").addEventListener("click", () => {
    if (connections.length) $("login").hidden = true;
  });

  // FileZilla içe aktarma
  $("import-fz").addEventListener("click", () => $("fz-file").click());
  $("fz-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importFileZilla(file);
    $("fz-file").value = "";
  });

  // ~/.ssh/config içe aktarma
  if ($("import-ssh")) $("import-ssh").addEventListener("click", () => $("ssh-file").click());
  if ($("ssh-file")) $("ssh-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importSshConfig(file);
    $("ssh-file").value = "";
  });
}

// ---- ~/.ssh/config içe aktarma ----
// Host blokları → kayıtlı sunucular. Parola/anahtar içermez (bağlanırken girilir);
// ProxyJump varsa atlama sunucusu (host/kullanıcı/port) olarak alınır.
function parseProxyJump(v) {
  // [user@]host[:port]  (zincir varsa ilk atlamayı al)
  const first = String(v).split(",")[0].trim();
  if (!first) return null;
  let user = "", host = first, port = 22;
  const at = host.indexOf("@");
  if (at >= 0) { user = host.slice(0, at); host = host.slice(at + 1); }
  const col = host.lastIndexOf(":");
  if (col >= 0 && /^\d+$/.test(host.slice(col + 1))) { port = Number(host.slice(col + 1)); host = host.slice(0, col); }
  if (!host) return null;
  return { host, port, username: user };
}

function parseSshConfig(text) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && !/[*?]/.test(cur.alias)) {
      const host = cur.host || cur.alias; // HostName yoksa takma adı host kabul et
      if (host) out.push({
        name: cur.alias,
        host,
        port: cur.port || 22,
        username: cur.user || "root",
        protocol: "sftp",
        auth: "key",
        jump: cur.jump || undefined,
      });
    }
    cur = null;
  };
  for (let raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "host") {
      flush();
      // "Host a b" → ilk takma adı kullan
      const alias = val.split(/\s+/)[0];
      cur = { alias, host: "", port: 0, user: "", jump: null };
    } else if (cur) {
      if (key === "hostname") cur.host = val;
      else if (key === "port") cur.port = Number(val) || 0;
      else if (key === "user") cur.user = val;
      else if (key === "proxyjump") cur.jump = parseProxyJump(val);
    }
  }
  flush();
  return out.filter((s) => s.host);
}

async function importSshConfig(file) {
  const { showLoading } = await import("./dom.js");
  showLoading(true);
  try {
    const text = await file.text();
    const servers = parseSshConfig(text);
    if (!servers.length) { toast("Dosyada içe aktarılacak Host bulunamadı.", true); return; }
    let ok = 0;
    for (const srv of servers) {
      try { await api("servers", { method: "POST", json: srv }); ok++; }
      catch (e) { console.warn("İçe aktarılamadı:", srv.host, e.message); }
    }
    await renderSavedServers();
    toast(`SSH config'ten ${ok}/${servers.length} sunucu içe aktarıldı (kimlik bilgisi bağlanırken istenir).`);
  } catch (e) {
    toast("İçe aktarma hatası: " + e.message, true);
  } finally {
    showLoading(false);
  }
}

// ---- FileZilla içe aktarma ----
function b64decode(str) {
  try { return decodeURIComponent(escape(atob(str))); }
  catch (_) { try { return atob(str); } catch (_) { return ""; } }
}
function fzProtocol(num) {
  switch (String(num)) {
    case "1": return "sftp";
    case "3": case "4": return "ftps";
    default: return "ftp";
  }
}
function fzServerName(node) {
  const nameEl = node.querySelector(":scope > Name");
  if (nameEl && nameEl.textContent.trim()) return nameEl.textContent.trim();
  let txt = "";
  node.childNodes.forEach((n) => { if (n.nodeType === 3) txt += n.textContent; });
  return txt.trim();
}
function fzServerToObj(s) {
  const get = (tag) => { const el = s.querySelector(":scope > " + tag); return el ? el.textContent.trim() : ""; };
  const host = get("Host");
  if (!host) return null;
  const protocol = fzProtocol(get("Protocol"));
  const passEl = s.querySelector(":scope > Pass");
  let password = "";
  if (passEl) {
    password = passEl.getAttribute("encoding") === "base64"
      ? b64decode(passEl.textContent.trim()) : passEl.textContent.trim();
  }
  let username = get("User");
  const logontype = get("Logontype");
  if (!username && logontype === "0") username = "anonymous";
  return {
    name: fzServerName(s) || `${username || "user"}@${host}`,
    host, port: Number(get("Port")) || (protocol === "sftp" ? 22 : 21),
    username: username || "anonymous", protocol, auth: "password", password,
  };
}
function fzFolderName(node) {
  let nm = "";
  node.childNodes.forEach((n) => { if (n.nodeType === 3) nm += n.textContent; });
  return nm.trim() || "Klasör";
}
function fzWalk(node, path, out) {
  node.childNodes.forEach((child) => {
    if (child.nodeType !== 1) return;
    if (child.tagName === "Folder") fzWalk(child, path.concat(fzFolderName(child)), out);
    else if (child.tagName === "Server") {
      const srv = fzServerToObj(child);
      if (srv) { srv.group = path.join(" / "); out.push(srv); }
    }
  });
}
function parseFileZilla(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML okunamadı (geçersiz dosya).");
  const out = [];
  const root = doc.querySelector("Servers") || doc.documentElement;
  if (root) fzWalk(root, [], out);
  return out;
}
async function importFileZilla(file) {
  const { showLoading } = await import("./dom.js");
  showLoading(true);
  try {
    const text = await file.text();
    const servers = parseFileZilla(text);
    if (!servers.length) { toast("Dosyada içe aktarılacak sunucu bulunamadı.", true); return; }
    let ok = 0;
    for (const srv of servers) {
      try { await api("servers", { method: "POST", json: srv }); ok++; }
      catch (e) { console.warn("İçe aktarılamadı:", srv.host, e.message); }
    }
    await renderSavedServers();
    toast(`FileZilla'dan ${ok}/${servers.length} sunucu içe aktarıldı.`);
  } catch (e) {
    toast("İçe aktarma hatası: " + e.message, true);
  } finally {
    showLoading(false);
  }
}
