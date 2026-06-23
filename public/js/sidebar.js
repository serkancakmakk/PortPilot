import { $, escapeHtml } from "./dom.js";
import { icon } from "./icons.js";
import { homePath, cwd, diskInfo, connections, activeConnId, favorites, setFavorites } from "./state.js";
import { navigate } from "./explorer.js";

// ---- Sık kullanılanlar (favoriler) ----
function activeHost() {
  const c = connections.find((x) => x.id === activeConnId);
  return (c && c.info && c.info.host) || "";
}

export function isFavorite(path) {
  const host = activeHost();
  return favorites.some((f) => f.host === host && f.path === path);
}

export function toggleFavorite(path) {
  const host = activeHost();
  const exists = favorites.some((f) => f.host === host && f.path === path);
  if (exists) {
    setFavorites(favorites.filter((f) => !(f.host === host && f.path === path)));
  } else {
    const name = path === "/" ? "/" : path.split("/").filter(Boolean).pop() || path;
    setFavorites([...favorites, { host, path, name }]);
  }
  renderFavorites();
  updateFavButton();
}

export function updateFavButton() {
  const btn = $("btn-fav");
  if (!btn) return;
  const on = isFavorite(cwd);
  btn.classList.toggle("active", on);
  btn.title = on ? "Sık kullanılanlardan çıkar" : "Bu klasörü sık kullanılanlara ekle";
}

export function renderFavorites() {
  const wrap = $("favorites-wrap");
  const nav = $("favorites");
  if (!wrap || !nav) return;
  const host = activeHost();
  const list = favorites.filter((f) => f.host === host);
  wrap.hidden = false; // bölüm her zaman görünür (keşfedilebilirlik)
  nav.innerHTML = "";
  if (!list.length) {
    nav.innerHTML = `<div class="fav-empty">Bir klasördeyken araç çubuğundaki ★ ile ekle</div>`;
    highlightQuick();
    return;
  }
  list.forEach((f) => {
    const a = document.createElement("a");
    a.dataset.path = f.path;
    a.innerHTML =
      `<span class="q-ico">${icon("folder")}</span> <span class="fav-name">${escapeHtml(f.name)}</span>` +
      `<button type="button" class="fav-del" title="Kaldır" aria-label="Kaldır">${icon("x")}</button>`;
    a.querySelector(".fav-del").onclick = (e) => { e.stopPropagation(); toggleFavorite(f.path); };
    a.onclick = () => navigate(f.path);
    nav.appendChild(a);
  });
  highlightQuick();
}

export function renderQuickLinks() {
  const links = [
    { icon: "home",     label: "Ana Dizin", path: homePath },
    { icon: "server",   label: "Kök (/)",   path: "/" },
    { icon: "box",      label: "/var",       path: "/var" },
    { icon: "settings", label: "/etc",       path: "/etc" },
    { icon: "folder",   label: "/tmp",       path: "/tmp" },
  ];
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

export function highlightQuick() {
  document.querySelectorAll("#quick-links a, #favorites a").forEach((a) => {
    a.classList.toggle("active", a.dataset.path === cwd);
  });
  updateFavButton();
}

export function renderSideDisk() {
  const box = $("side-disk");
  if (!diskInfo || !diskInfo.available) { box.innerHTML = ""; return; }
  const d = diskInfo;
  const cls = d.percent >= 90 ? "full" : d.percent >= 75 ? "warn" : "";
  box.innerHTML =
    `<div class="sd-title">${icon("hard-drive")} Disk Kullanımı</div>` +
    `<div class="sd-bar"><div class="sd-fill ${cls}" style="width:${d.percent}%"></div></div>` +
    `<div class="sd-text">${fmtSize(d.used)} / ${fmtSize(d.total)} • %${d.percent} dolu<br>${fmtSize(d.avail)} boş</div>`;
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1, n = bytes;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
}
