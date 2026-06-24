import { applyIcons } from "./icons.js";
import { setLogoutFn } from "./api.js";
import { logout, closeConnection, renderTabs, activateConn, persistConns } from "./connections.js";
import { renderSavedServers } from "./servers.js";
import { setConnections, loadFavoritesFromServer } from "./state.js";
import { renderFavorites } from "./sidebar.js";
import { initLogin } from "./login.js";
import { initEditor, closeEditor } from "./editor.js";
import { initDocker } from "./docker.js";
import { initDashboard } from "./dashboard.js";
import { initTerminal } from "./terminal.js";
import { initDownloads } from "./downloads.js";
import { initDesktop } from "./updater.js";
import { initToolbar } from "./toolbar.js";
import { initDragDrop } from "./upload.js";
import { initRecentLocal } from "./recent-local.js";
import { initLocalExplorer } from "./local-explorer.js";
import { hideMenu, showAreaMenu } from "./context-menu.js";
import { navigate } from "./explorer.js";
import { cwd, activeConnId } from "./state.js";
import { $, showLoading } from "./dom.js";

// Refresh sonrası açık oturumları sunucudan doğrulayıp geri yükle
async function restoreSessions() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("openConns") || "null"); } catch (_) {}
  if (!saved || !Array.isArray(saved.conns) || !saved.conns.length) return false;
  showLoading(true);
  const valid = [];
  for (const c of saved.conns) {
    try {
      const r = await fetch("/api/disk?path=" + encodeURIComponent(c.homePath || "/"),
        { headers: { "x-session": c.session } });
      if (r.ok) valid.push({ ...c, history: [] });
    } catch (_) {}
  }
  showLoading(false);
  if (!valid.length) { localStorage.removeItem("openConns"); return false; }
  setConnections(valid);
  const act = valid.find((c) => c.id === saved.activeId) || valid[0];
  activateConn(act.id);
  return true;
}

// API modülüne logout fonksiyonunu ver (döngüsel import önlemek için geç bağlama)
setLogoutFn(logout);

document.addEventListener("DOMContentLoaded", () => {
  applyIcons();
  initLogin();
  initEditor();
  initDocker();
  initDashboard();
  initTerminal();
  initDownloads();
  initDesktop();
  initToolbar();
  initDragDrop();
  initRecentLocal();
  initLocalExplorer();

  // Küçük ekran: sidebar aç/kapa (off-canvas)
  const sb = document.querySelector(".sidebar");
  const bd = $("sidebar-backdrop");
  const openSidebar = (on) => {
    if (sb) sb.classList.toggle("open", on);
    if (bd) bd.hidden = !on;
  };
  if ($("btn-sidebar")) $("btn-sidebar").addEventListener("click", () => openSidebar(!sb.classList.contains("open")));
  if (bd) bd.addEventListener("click", () => openSidebar(false));
  if (sb) sb.addEventListener("click", (e) => { if (e.target.closest("a, #btn-disconnect")) openSidebar(false); });

  // Panel (dashboard) açıkken gezinme/işlem → dosya görünümüne geç
  const toFiles = () => import("./dashboard.js").then((m) => m.showFilesView());
  ["breadcrumb", "quick-links", "favorites", "btn-back", "btn-up", "btn-refresh",
   "btn-newfolder", "btn-download", "btn-upload", "btn-upload-folder",
   "btn-hidden", "btn-view", "btn-fav", "file-search"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("click", toFiles);
  });

  // Refresh/kapatma öncesi açık oturumları kaydet
  window.addEventListener("beforeunload", () => persistConns());

  // Sağ tık menüsü
  $("file-area").addEventListener("contextmenu", showAreaMenu);
  document.addEventListener("click", hideMenu);
  document.addEventListener("scroll", hideMenu, true);

  // Klavye kısayolları
  document.addEventListener("keydown", (e) => {
    if (!$("editor").hidden) {
      if (e.key === "Escape") closeEditor();
      return;
    }
    if ($("explorer").hidden) return;
    if (e.key === "F5") { e.preventDefault(); navigate(cwd, false); }
    if (e.key === "Backspace" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      $("btn-up").click();
    }
  });

  // Bağlantı kes butonu
  $("btn-disconnect").addEventListener("click", () => {
    if (activeConnId) closeConnection(activeConnId);
  });

  // Favorileri sunucudan (kalıcı) yükle; gelince listeyi tazele
  loadFavoritesFromServer().then(() => renderFavorites());

  // Başlangıçta kayıtlı sunucuları yükle + refresh sonrası oturumları geri yükle
  renderSavedServers();
  restoreSessions();
});
