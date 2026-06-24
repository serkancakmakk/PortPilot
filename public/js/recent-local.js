// Bilgisayardaki son kullanılan klasörler (yalnızca masaüstü/Electron uygulamada).
// Tarayıcı, seçilen klasörün diskteki mutlak yolunu vermez; Electron'da
// window.desktop.getFilePath (webUtils) ile alıp localStorage'da saklarız.
import { $, toast } from "./dom.js";
import { applyIcons } from "./icons.js";
import { cwd, session, connections, activeConnId } from "./state.js";
import { navigate } from "./explorer.js";

const RECENT_LOCAL_KEY = "recentLocalFolders";
const MAX_ITEMS = 8; // sunucu (host) başına

function isDesktopApp() {
  return !!(window.desktop && window.desktop.isDesktop && window.desktop.getFilePath);
}

// Son klasörler artık sunucu (host) bazlı: her bağlantının kendi listesi olur.
function activeHost() {
  const c = connections.find((x) => x.id === activeConnId);
  return (c && c.info && c.info.host) || "";
}

// Tüm host'ların kayıtları (depolama biçimi: [{ host, path, name }]).
function loadAll() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_LOCAL_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function saveAll(all) {
  // localStorage yalnızca anlık önbellek; kalıcı kaynak sunucudaki prefs.json
  // (Electron her açılışta rastgele port seçtiğinden localStorage origin'i değişir).
  try { localStorage.setItem(RECENT_LOCAL_KEY, JSON.stringify(all)); } catch (_) {}
  try {
    fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recentLocalFolders: all }),
    }).catch(() => {});
  } catch (_) {}
}

// Yalnızca aktif sunucuya ait kayıtlar.
function currentList() {
  const host = activeHost();
  return loadAll().filter((it) => it.host === host);
}

// Mutlak bir yolu aktif sunucunun listesine (en başa) ekler.
function addRecent(root) {
  if (!root) return;
  const host = activeHost();
  const name = root.split(/[\\/]/).filter(Boolean).pop() || root;
  let all = loadAll().filter((it) => !(it.host === host && it.path === root));
  all.unshift({ host, path: root, name });
  // Bu host'un kayıtlarını MAX_ITEMS ile sınırla (diğer host'lara dokunma).
  const hostItems = all.filter((it) => it.host === host);
  if (hostItems.length > MAX_ITEMS) {
    const drop = new Set(hostItems.slice(MAX_ITEMS).map((x) => x.path));
    all = all.filter((it) => !(it.host === host && drop.has(it.path)));
  }
  saveAll(all);
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
  // Uygulama içi gezgin açıkken kalabalık olmasın diye paneli gösterme.
  const lx = $("local-explorer");
  if (lx && !lx.hidden) {
    box.hidden = true;
    return;
  }
  const list = currentList();
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
    let list = data && data.prefs && data.prefs.recentLocalFolders;
    if (Array.isArray(list)) {
      // Eski (host'suz) kayıtları geriye dönük uyumluluk için host alanıyla normalize et.
      list = list.map((it) => (it && typeof it === "object" ? { host: it.host || "", path: it.path, name: it.name } : null)).filter(Boolean);
      try { localStorage.setItem(RECENT_LOCAL_KEY, JSON.stringify(list)); } catch (_) {}
      renderRecentLocal();
    } else {
      const cached = loadAll();
      if (cached.length) saveAll(cached); // önbellekteki eskileri sunucuya taşı
    }
  } catch (_) {}
}

export function initRecentLocal() {
  const clear = $("recent-local-clear");
  if (clear) {
    clear.addEventListener("click", () => {
      // Yalnızca aktif sunucunun listesini temizle (diğer sunucular korunur).
      const host = activeHost();
      saveAll(loadAll().filter((it) => it.host !== host));
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
