// Bu sunucuyu kullanırken kullanıcının KENDİ BİLGİSAYARINDA gittiği son yerel yol.
// Sunucu (host) bazlı; prefs.json'da kalıcı. Panelde gösterilir, tıklanınca yerel
// dosya gezgini o yolda açılır. "Klasör Seç" de bu yolu başlangıç olarak kullanır.
import { $ } from "./dom.js";
import { applyIcons } from "./icons.js";
import { connections, activeConnId } from "./state.js";

const KEY = "lastLocalPaths";

function isDesktopApp() {
  return !!(window.desktop && window.desktop.isDesktop && window.desktop.listDir);
}

let cachedHome = ""; // kullanıcının bilgisayarındaki ev klasörü (kayıt yoksa varsayılan)

function activeHost() {
  const c = connections.find((x) => x.id === activeConnId);
  return (c && c.info && c.info.host) || "";
}

// Depolama biçimi: { [host]: localPath }
function loadAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (_) {
    return {};
  }
}

function saveAll(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (_) {}
  try {
    fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastLocalPaths: obj }),
    }).catch(() => {});
  } catch (_) {}
}

// Yerel gezgin bir klasöre girdiğinde (listDir) çağrılır.
export function recordLocalPath(path) {
  if (!isDesktopApp()) return;
  const host = activeHost();
  if (!host || !path) return;
  const all = loadAll();
  if (all[host] === path) return;
  all[host] = path;
  saveAll(all);
  renderLocalLast();
}

// "Klasör Seç" gezgini bu yolda açsın diye başlangıç yolunu verir.
export function getLocalPathForHost() {
  const host = activeHost();
  return (host && loadAll()[host]) || "";
}

export function renderLocalLast() {
  const box = $("local-last");
  const body = $("local-last-body");
  if (!box || !body) return;
  // Kayıtlı yol yoksa kullanıcının bilgisayarındaki ana dizini (ev) göster.
  const path = isDesktopApp() ? (getLocalPathForHost() || cachedHome) : "";
  // Gezgin açıkken kalabalık olmasın.
  const lx = $("local-explorer");
  if (!path || (lx && !lx.hidden)) { box.hidden = true; return; }
  box.hidden = false;
  body.innerHTML = "";

  const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
  const row = document.createElement("div");
  row.className = "local-last-item";
  row.title = "Yerel gezgini burada aç: " + path;

  const main = document.createElement("div");
  main.className = "ll-main";
  main.innerHTML = '<span class="nav-ico-wrap" data-icon="folder"></span><span class="ll-text"><span class="ll-name"></span><span class="ll-path"></span></span>';
  main.querySelector(".ll-name").textContent = name;
  main.querySelector(".ll-path").textContent = path;

  const openInExplorer = () => import("./local-explorer.js").then((m) => m.openLocalExplorer(path));
  main.addEventListener("click", openInExplorer);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm tbtn primary ll-open";
  btn.innerHTML = '<span class="nav-ico-wrap" data-icon="folder"></span> Aç';
  btn.addEventListener("click", openInExplorer);

  row.appendChild(main);
  row.appendChild(btn);
  body.appendChild(row);
  applyIcons(body);
}

async function loadFromServer() {
  try {
    const res = await fetch("/api/prefs");
    if (!res.ok) return;
    const data = await res.json();
    const obj = data && data.prefs && data.prefs.lastLocalPaths;
    if (obj && typeof obj === "object") {
      try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (_) {}
      renderLocalLast();
    }
  } catch (_) {}
}

export function initLocalLast() {
  // Ev klasörünü bir kez al (kayıt yoksa varsayılan olarak gösterilecek).
  if (isDesktopApp() && window.desktop.homeDir) {
    window.desktop.homeDir().then((h) => { cachedHome = h || ""; renderLocalLast(); }).catch(() => {});
  }
  renderLocalLast();
  loadFromServer();
}
