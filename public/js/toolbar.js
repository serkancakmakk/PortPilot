import { $, toast, showLoading } from "./dom.js";
import { icon } from "./icons.js";
import { api } from "./api.js";
import { cwd, history, session, currentItems, selectedItem, showHidden, viewMode, fileFilter, uploadPrefs, setShowHidden, setViewMode, setFileFilter, setHistory, setUploadPrefs } from "./state.js";
import { navigate, renderList, applyFileView, syncCheckState, checkedItems, downloadItem, triggerDownload, fmtSize } from "./explorer.js";
import { promptDialog } from "./dialog.js";

export async function newFolder() {
  const name = await promptDialog("Yeni klasör adı:", { title: "Yeni Klasör", okText: "Oluştur" });
  if (!name) return;
  try {
    await api("mkdir", { method: "POST", json: { path: cwd, name } });
    toast("Klasör oluşturuldu");
    navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
}

function updateHiddenBtn() {
  const b = $("btn-hidden");
  if (b) b.classList.toggle("active", !showHidden);
}

function applyViewButton() {
  $("btn-view").innerHTML =
    viewMode === "grid"
      ? `<span class="nav-ico-wrap">${icon("list")}</span> <span class="btn-label">Liste</span>`
      : `<span class="nav-ico-wrap">${icon("grid")}</span> <span class="btn-label">Simge</span>`;
}

export function initToolbar() {
  $("btn-back").addEventListener("click", () => {
    if (history.length) { const h = [...history]; const prev = h.pop(); setHistory(h); navigate(prev, false); }
  });
  $("btn-up").addEventListener("click", () => {
    if (cwd === "/") return;
    navigate(cwd.replace(/\/[^/]+\/?$/, "") || "/");
  });
  $("btn-refresh").addEventListener("click", () => navigate(cwd, false));
  $("btn-newfolder").addEventListener("click", newFolder);

  // Sık kullanılanlar: bu klasörü ekle/çıkar
  if ($("btn-fav")) {
    $("btn-fav").addEventListener("click", () =>
      import("./sidebar.js").then((m) => m.toggleFavorite(cwd)));
  }

  // Görünüm değiştir
  applyViewButton();
  $("btn-view").addEventListener("click", () => {
    setViewMode(viewMode === "grid" ? "list" : "grid");
    localStorage.setItem("viewMode", viewMode);
    applyViewButton();
    renderList(currentItems);
  });

  // Gizli dosyalar
  if ($("btn-hidden")) {
    $("btn-hidden").addEventListener("click", () => {
      setShowHidden(!showHidden);
      localStorage.setItem("showHidden", showHidden ? "1" : "0");
      updateHiddenBtn();
      applyFileView();
    });
    updateHiddenBtn();
  }

  // Arama kutusu
  if ($("file-search")) {
    $("file-search").addEventListener("input", (e) => {
      setFileFilter(e.target.value);
      applyFileView();
    });
    $("file-search").addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.target.value = ""; setFileFilter(""); applyFileView(); }
    });
  }

  // Tümünü seç
  $("check-all").addEventListener("change", (e) => {
    $("file-area").querySelectorAll(".row-check").forEach((cb) => {
      cb.checked = e.target.checked;
      const entry = cb.closest("tr, .tile");
      if (entry) entry.classList.toggle("checked", cb.checked);
    });
    syncCheckState();
  });

  // İndir
  $("btn-download").addEventListener("click", () => {
    const checked = checkedItems();
    if (checked.length > 1) {
      toast(checked.length + " öğe arşivleniyor, indirme başlıyor...");
      const params = checked.map((i) => "name=" + encodeURIComponent(i.name)).join("&");
      triggerDownload("/api/download-multi?session=" + encodeURIComponent(session) + "&dir=" + encodeURIComponent(cwd) + "&" + params);
      return;
    }
    const item = checked[0] || selectedItem;
    if (!item) { toast("Önce indirmek istediğin dosya/klasörü seç (kutucuk).", true); return; }
    downloadItem(item);
  });

  // Yükle
  $("btn-upload").addEventListener("click", () => $("file-input").click());
  $("dropzone").addEventListener("click", (e) => {
    if (e.target.closest("#dz-files, #dz-folder")) return;
    $("file-input").click();
  });
  if ($("dz-files")) $("dz-files").addEventListener("click", () => $("file-input").click());
  // Masaüstünde "Klasör Seç" uygulama içi gezgini açar (çoklu seçim + sürükle-bırak);
  // tarayıcıda klasik klasör seçiciye düşer.
  const pickFolder = () => {
    if (window.desktop && window.desktop.listDir)
      import("./local-explorer.js").then((m) => m.openLocalExplorer());
    else $("folder-input").click();
  };
  if ($("dz-folder")) $("dz-folder").addEventListener("click", pickFolder);

  $("file-input").addEventListener("change", (e) => {
    const entries = Array.from(e.target.files).map((f) => ({ file: f, rel: f.webkitRelativePath || f.name }));
    import("./upload.js").then((m) => m.uploadEntries(entries));
  });
  if ($("folder-input")) {
    if ($("btn-upload-folder")) $("btn-upload-folder").addEventListener("click", pickFolder);
    $("folder-input").addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      import("./recent-local.js").then((m) => m.rememberLocalFolder(files));
      const entries = files.map((f) => ({ file: f, rel: f.webkitRelativePath || f.name }));
      import("./upload.js").then((m) => m.uploadEntries(entries));
      $("folder-input").value = "";
    });
  }
}
