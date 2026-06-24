import { $, toast } from "./dom.js";
import { icon } from "./icons.js";
import {
  session, cwd, homePath, history, connections, activeConnId,
  setSession, setCwd, setHomePath, setHistory, setConnections, setActiveConnId,
} from "./state.js";
import { renderSavedServers } from "./servers.js";
import { navigate } from "./explorer.js";
import { confirmDialog } from "./dialog.js";

export function updateConnInfo(i) {
  const proto = (i.protocol || "sftp").toUpperCase();
  $("conn-info").innerHTML =
    `<span class="dot"></span><span class="conn-proto">${proto}</span> <b>${i.username}@${i.host}</b><span class="port">:${i.port}</span>`;
  $("conn-info").title = `Bağlı: ${proto} · ${i.username}@${i.host}:${i.port}`;
}

export function renderTabs() {
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
    close.addEventListener("click", (e) => { e.stopPropagation(); closeConnection(c.id); });
    tab.appendChild(label);
    tab.appendChild(close);
    tab.addEventListener("click", () => { if (c.id !== activeConnId) activateConn(c.id); });
    bar.appendChild(tab);
  });
  const add = document.createElement("button");
  add.className = "conn-add";
  add.textContent = "+";
  add.title = "Yeni sunucuya bağlan";
  add.addEventListener("click", showAddConnection);
  bar.appendChild(add);
}

// Aktif bağlantının anlık durumunu kaydet (sekme değiştirme öncesi)
export function syncActiveConn() {
  const c = connections.find((x) => x.id === activeConnId);
  if (c) {
    c.session = session;
    c.cwd = cwd;
    c.homePath = homePath;
    c.history = history;
  }
}

// Açık bağlantıları localStorage'a yaz (refresh sonrası geri yüklemek için)
export function persistConns() {
  try {
    syncActiveConn();
    const data = {
      activeId: activeConnId,
      conns: connections.map((c) => ({
        id: c.id, session: c.session, info: c.info,
        cwd: c.cwd, homePath: c.homePath, connectedAt: c.connectedAt,
      })),
    };
    if (data.conns.length) localStorage.setItem("openConns", JSON.stringify(data));
    else localStorage.removeItem("openConns");
  } catch (_) {}
}

export function activateConn(id) {
  const c = connections.find((x) => x.id === id);
  if (!c) return;
  if (activeConnId && activeConnId !== id) syncActiveConn();
  setActiveConnId(id);
  setSession(c.session);
  setCwd(c.cwd);
  setHomePath(c.homePath);
  setHistory(c.history);
  $("login").hidden = true;
  $("explorer").hidden = false;
  updateConnInfo(c.info);
  renderTabs();
  import("./sidebar.js").then((m) => { m.renderQuickLinks(); m.renderFavorites(); });
  import("./recent-local.js").then((m) => m.renderRecentLocal()); // son klasörler host bazlı
  import("./local-last.js").then((m) => m.renderLocalLast()); // bu sunucu için son yerel konum
  navigate(cwd, false);
  persistConns();
}

export function showAddConnection() {
  const f = $("connect-form");
  f.reset();
  f.port.value = "22";
  document.querySelector('[data-auth="password"]').click();
  $("login-error").textContent = "";
  $("save-pass-row").hidden = true;
  $("login-close").hidden = connections.length === 0;
  $("login").hidden = false;
  renderSavedServers();
  setTimeout(() => f.host.focus(), 50);
}

export async function closeConnection(id, opts = {}) {
  const c = connections.find((x) => x.id === id);
  if (!c) return;
  if (opts.ask !== false &&
      !(await confirmDialog(`"${c.info.name || c.info.host}" bağlantısı kapatılsın mı?`, { title: "Bağlantıyı Kapat", okText: "Kapat", danger: true })))
    return;
  if (c.session) {
    fetch("/api/disconnect", { method: "POST", headers: { "x-session": c.session } }).catch(() => {});
  }
  setConnections(connections.filter((x) => x.id !== id));
  if (activeConnId === id) {
    setActiveConnId(null);
    if (connections.length) {
      activateConn(connections[connections.length - 1].id);
    } else {
      setSession(null); setCwd("/"); setHomePath("/"); setHistory([]);
      $("explorer").hidden = true;
      $("login-close").hidden = true;
      $("login").hidden = false;
      renderTabs();
      renderSavedServers();
    }
  } else {
    renderTabs();
  }
  persistConns();
}

export function logout() {
  if (activeConnId) {
    closeConnection(activeConnId, { ask: false });
  } else {
    setSession(null);
    $("explorer").hidden = true;
    $("login").hidden = false;
    renderSavedServers();
  }
}
