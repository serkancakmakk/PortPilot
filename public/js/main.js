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
import { initLang } from "./i18n.js";
import { initEditExternal, stopAllEdits } from "./edit-external.js";
import { initCommandPalette } from "./command-palette.js";
import { initAudit } from "./audit.js";
import { initDualPane } from "./dual-pane.js";
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
  initLang();
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
  initAudit();
  initDualPane();
  initWhatsNew();
  initTransferQueue();
  initEditExternal();
  initCommandPalette();

  // Dış düzenleme sunucuya senkronlandığında, o klasör görüntüleniyorsa listeyi tazele
  document.addEventListener("external-edit-synced", (e) => {
    const dir = e.detail && e.detail.remoteDir;
    if (dir && (cwd === dir || (cwd || "/") === (dir || "/"))) {
      import("./explorer.js").then((m) => m.navigate(cwd));
    }
  });

  // Sidebar aç/kapa: masaüstünde daraltma (kalıcı), küçük ekranda off-canvas
  const sb = document.querySelector(".sidebar");
  const bd = $("sidebar-backdrop");
  const explorer = $("explorer");
  const COLLAPSE_KEY = "sidebarCollapsed";
  const isDesktop = () => window.matchMedia("(min-width: 993px)").matches;

  const openSidebar = (on) => {
    if (sb) sb.classList.toggle("open", on);
    if (bd) bd.hidden = !on;
  };
  const setCollapsed = (on) => {
    if (explorer) explorer.classList.toggle("sidebar-collapsed", on);
    try { localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0"); } catch (_) {}
  };
  const toggleCollapsed = () => setCollapsed(!explorer.classList.contains("sidebar-collapsed"));

  // Açılışta masaüstü daraltma durumunu geri yükle
  if (explorer && localStorage.getItem(COLLAPSE_KEY) === "1") explorer.classList.add("sidebar-collapsed");

  // Toolbar düğmesi: masaüstünde daralt/genişlet, küçük ekranda off-canvas aç/kapat
  if ($("btn-sidebar")) $("btn-sidebar").addEventListener("click", () => {
    if (isDesktop()) toggleCollapsed();
    else openSidebar(!sb.classList.contains("open"));
  });
  // Sidebar içindeki daralt düğmesi (yalnızca masaüstünde mantıklı)
  if ($("btn-sidebar-collapse")) $("btn-sidebar-collapse").addEventListener("click", () => {
    if (isDesktop()) setCollapsed(true);
    else openSidebar(false);
  });
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
    stopAllEdits();
    if (activeConnId) closeConnection(activeConnId);
  });

  // Favorileri sunucudan (kalıcı) yükle; gelince listeyi tazele
  loadFavoritesFromServer().then(() => renderFavorites());

  // Başlangıçta kayıtlı sunucuları yükle + refresh sonrası oturumları geri yükle
  renderSavedServers();
  restoreSessions();
});
