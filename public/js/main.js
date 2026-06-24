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
import { initLocalLast } from "./local-last.js";
import { initSystools } from "./systools.js";
import { initWhatsNew } from "./whatsnew.js";
import { initTransferQueue } from "./transfer-queue.js";
import { initLock } from "./lock.js";
import { initTheme } from "./theme.js";
import { hideMenu, showAreaMenu, renameItem, deleteItem } from "./context-menu.js";
import { navigate, joinPath } from "./explorer.js";
import { cwd, activeConnId, selectedItem } from "./state.js";
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

// Sürüm rozetini (".ver") gerçek sürümle güncelle — sabit "v1" kalmasın.
async function applyVersionBadge() {
  let v = "";
  try {
    if (window.desktop && window.desktop.version) v = await window.desktop.version();
    if (!v) {
      const r = await fetch("/api/version");
      if (r.ok) v = (await r.json()).version || "";
    }
  } catch (_) {}
  if (!v) return;
  document.querySelectorAll(".ver").forEach((el) => { el.textContent = "v" + v; });
}

document.addEventListener("DOMContentLoaded", () => {
  applyIcons();
  applyVersionBadge();
  initTheme();
  initLock();
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
  initLocalLast();
  initSystools();
  initWhatsNew();
  initTransferQueue();

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
    const typing = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
    if (e.key === "F5") { e.preventDefault(); navigate(cwd, false); }
    if (e.key === "Backspace" && !typing) {
      e.preventDefault();
      $("btn-up").click();
    }
    // F2: yeniden adlandır · Delete: sil (seçili öğe üzerinde)
    if (e.key === "F2" && !typing && selectedItem) {
      e.preventDefault();
      renameItem(selectedItem, joinPath(cwd, selectedItem.name));
    }
    if ((e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) && !typing && selectedItem) {
      e.preventDefault();
      deleteItem(selectedItem, joinPath(cwd, selectedItem.name));
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
