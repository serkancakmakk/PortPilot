// Bilgisayardaki son kullanılan klasörler (yalnızca masaüstü/Electron uygulamada).
// Tarayıcı, seçilen klasörün diskteki mutlak yolunu vermez; Electron'da
// window.desktop.getFilePath (webUtils) ile alıp localStorage'da saklarız.
import { $, toast } from "./dom.js";
import { applyIcons } from "./icons.js";
import { cwd, session } from "./state.js";
import { navigate } from "./explorer.js";

const RECENT_LOCAL_KEY = "recentLocalFolders";
const MAX_ITEMS = 8;

function isDesktopApp() {
  return !!(window.desktop && window.desktop.isDesktop && window.desktop.getFilePath);
}

function loadRecentLocal() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_LOCAL_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveRecentLocal(list) {
  const trimmed = list.slice(0, MAX_ITEMS);
  // localStorage yalnızca anlık önbellek; kalıcı kaynak sunucudaki prefs.json
  // (Electron her açılışta rastgele port seçtiğinden localStorage origin'i değişir
  // ve liste kaybolur). Bu yüzden sunucuya da yazıyoruz.
  try { localStorage.setItem(RECENT_LOCAL_KEY, JSON.stringify(trimmed)); } catch (_) {}
  try {
    fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recentLocalFolders: trimmed }),
    }).catch(() => {});
  } catch (_) {}
}

// Mutlak bir yolu (en başa) listeye ekler.
function addRecent(root) {
  if (!root) return;
  const name = root.split(/[\\/]/).filter(Boolean).pop() || root;
  const list = loadRecentLocal().filter((it) => it.path !== root);
  list.unshift({ path: root, name });
  saveRecentLocal(list);
  renderRecentLocal();
}

// "Klasör Seç" ile seçilen dosyalardan klasörün diskteki kök yolunu bulup ekler.
export function rememberLocalFolder(files) {
  if (!isDesktopApp() || !files || !files.length) return;
  const first = files[0];
  const rel = first.webkitRelativePath || "";
  const abs = window.desktop.getFilePath(first);
  if (!abs) return;
  // abs, rel ile biter; rel'i atıp en üst klasör adını ekleyerek kökü buluruz.
  let root;
  if (rel) {
    const parent = abs.slice(0, abs.length - rel.length); // ayraçla biter
    const topName = rel.split(/[\\/]/)[0];
    root = parent + topName;
  } else {
    root = abs.replace(/[\\/][^\\/]*$/, ""); // tek dosyaysa üst klasör
  }
  addRecent(root);
}

// Sürükle-bırakta senkron toplanan klasör yollarını (mutlak) kaydeder.
export function rememberLocalPaths(absPaths) {
  if (!isDesktopApp() || !absPaths || !absPaths.length) return;
  for (const abs of absPaths) addRecent(abs);
}

// Kayıtlı bir yerel klasörü diskten okuyup sunucudaki güncel dizine yeniden yükler.
async function reuploadLocal(it, btn) {
  // Çakışma/eşzamanlılık seçeneklerini sor (normal yükleme gibi).
  const { askUploadOptions } = await import("./upload.js");
  const opts = await askUploadOptions([], `“${it.name}” yeniden yüklenecek → ${cwd}`);
  if (!opts) return; // iptal

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Yükleniyor…";
  try {
    const res = await fetch("/api/upload-local", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-session": session } : {}),
      },
      body: JSON.stringify({ path: cwd, localPath: it.path, conflict: opts.conflict, concurrency: opts.concurrency }),
    });
    if (!res.ok && res.status === 401) {
      import("./connections.js").then((m) => m.logout());
      throw new Error("Oturum doldu, yeniden bağlanın.");
    }

    // NDJSON akışını oku: {total}, {done}, {ok|error}
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", total = 0, last = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let o; try { o = JSON.parse(t); } catch (_) { continue; }
        if (o.total != null) total = o.total;
        if (o.done != null && total) btn.textContent = `%${Math.round((o.done / total) * 100)}`;
        if (o.ok || o.error) last = o;
      }
    }
    if (buf.trim()) { try { last = JSON.parse(buf.trim()); } catch (_) {} }

    if (last && last.error) {
      toast(last.error, true);
    } else {
      const c = (last && last.count) || 0;
      const extra = last && last.skipped ? `, ${last.skipped} atlandı` : "";
      toast(`“${it.name}” yeniden yüklendi (${c} dosya${extra})`);
      navigate(cwd); // listeyi tazele
    }
  } catch (e) {
    toast(e.message || "Yeniden yükleme başarısız", true);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

export function renderRecentLocal() {
  const box = $("recent-local");
  const listEl = $("recent-local-list");
  if (!box || !listEl) return;
  // Tarayıcıda yerel yol alınamaz → panel tümüyle gizli.
  if (!isDesktopApp()) {
    box.hidden = true;
    return;
  }
  const list = loadRecentLocal();
  box.hidden = false;
  const clearBtn = $("recent-local-clear");
  if (clearBtn) clearBtn.hidden = !list.length;
  if (!list.length) {
    listEl.innerHTML =
      '<div class="recent-local-empty">Henüz klasör seçmedin. “Klasör Seç” ile ya da sürükle-bırak ile bir klasör yükledikçe burada görünecek; tıklayınca bilgisayarında açılır, “Tekrar Yükle” ile güncel halini bu klasöre yeniden gönderirsin.</div>';
    return;
  }
  listEl.innerHTML = "";
  for (const it of list) {
    const card = document.createElement("div");
    card.className = "recent-local-item";

    const top = document.createElement("div");
    top.className = "rl-top";
    top.innerHTML = '<span class="nav-ico-wrap" data-icon="folder"></span><div class="rl-name"></div>';
    top.querySelector(".rl-name").textContent = it.name;

    const pathEl = document.createElement("div");
    pathEl.className = "rl-path";
    pathEl.textContent = it.path;
    pathEl.title = it.path;

    const actions = document.createElement("div");
    actions.className = "rl-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "rl-btn rl-open";
    openBtn.textContent = "Aç";
    openBtn.title = "Bilgisayarında aç";
    openBtn.addEventListener("click", async () => {
      const err = await window.desktop.openPath(it.path);
      if (err) toast(err, true);
    });

    const reup = document.createElement("button");
    reup.type = "button";
    reup.className = "rl-btn rl-reupload";
    reup.textContent = "Tekrar Yükle";
    reup.title = "Bu klasörün güncel halini bulunduğun dizine yeniden yükle";
    reup.addEventListener("click", () => reuploadLocal(it, reup));

    actions.appendChild(openBtn);
    actions.appendChild(reup);
    card.appendChild(top);
    card.appendChild(pathEl);
    card.appendChild(actions);
    listEl.appendChild(card);
  }
  applyIcons(listEl);
}

// Manuel girilen bir yolu doğrulayıp listeye ekler (klasör olmalı).
async function addManualPath(raw) {
  const p = (raw || "").trim();
  if (!p) return;
  if (window.desktop && window.desktop.listDir) {
    const r = await window.desktop.listDir(p).catch(() => null);
    if (!r || !r.ok) { toast("Klasör bulunamadı: " + p, true); return; }
    addRecent(r.path); // normalize edilmiş yol
  } else {
    addRecent(p);
  }
  toast("Klasör eklendi");
}

// Kalıcı kaynaktan (prefs.json) yükle. Sunucuda yoksa localStorage önbelleğindeki
// eski listeyi bir kez sunucuya taşı (migrasyon).
async function loadFromServer() {
  if (!isDesktopApp()) return;
  try {
    const res = await fetch("/api/prefs");
    if (!res.ok) return;
    const data = await res.json();
    const list = data && data.prefs && data.prefs.recentLocalFolders;
    if (Array.isArray(list)) {
      try { localStorage.setItem(RECENT_LOCAL_KEY, JSON.stringify(list)); } catch (_) {}
      renderRecentLocal();
    } else {
      const cached = loadRecentLocal();
      if (cached.length) saveRecentLocal(cached); // önbellekteki eskileri taşı
    }
  } catch (_) {}
}

export function initRecentLocal() {
  const clear = $("recent-local-clear");
  if (clear) {
    clear.addEventListener("click", () => {
      saveRecentLocal([]); // hem önbelleği hem sunucuyu temizle
      renderRecentLocal();
    });
  }
  // Manuel yol ekleme
  const addBtn = $("recent-local-add-btn");
  const input = $("recent-local-path");
  if (addBtn && input) {
    const submit = () => { addManualPath(input.value); input.value = ""; };
    addBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }
  renderRecentLocal();   // önce önbellekten anında göster
  loadFromServer();      // sonra kalıcı kaynaktan tazele
}
