import { $, showLoading, toast } from "./dom.js";
import { session, cwd, uploadPrefs, setUploadPrefs, pushTransfer } from "./state.js";
import { navigate, fmtSize } from "./explorer.js";

// Uygulama içi yerel gezginden sürüklenen öğeler bu DataTransfer türüyle gelir.
const LOCAL_DT_TYPE = "application/x-portpilot-local";

export async function uploadEntries(entries) {
  entries = (entries || []).filter((e) => e && e.file);
  if (!entries.length) { toast("Yüklenecek dosya bulunamadı.", true); return; }

  const opts = uploadPrefs || (await askUploadOptions(entries));
  if (!opts) { $("file-input").value = ""; return; }
  if (opts.remember) setUploadPrefs({ conflict: opts.conflict, concurrency: opts.concurrency });

  const fd = new FormData();
  fd.append("path", cwd);
  fd.append("conflict", opts.conflict);
  fd.append("concurrency", String(opts.concurrency));
  for (const { file, rel } of entries) {
    fd.append("files", file);
    fd.append("paths", rel || file.name);
    fd.append("mtimes", String(file.lastModified || 0));
  }
  const targetDir = cwd;
  // Dosya sayısı/boyutları + adları (kalan dosya + hangi dosya gösterimi için)
  let acc = 0;
  const cum = entries.map(({ file }) => (
    acc += (file && file.size) || 0));
  const names = entries.map(({ rel, file }) => (rel || (file && file.name) || "dosya").split("/").pop());
  const now = Date.now();
  _progState = {
    total: entries.length, cum, totalBytes: acc || 1, names,
    t0: now, lastT: now, lastLoaded: 0, speed: 0,
  };
  setUploadProgress(0);
  try {
    const r = await uploadWithProgress(fd);
    setUploadProgress(null);
    const parts = [];
    if (r.count) parts.push(`${r.count} yüklendi`);
    if (r.renamed) parts.push(`${r.renamed} yeniden adlandırıldı`);
    if (r.skipped) parts.push(`${r.skipped} atlandı`);
    if (r.failed) {
      parts.push(`${r.failed} başarısız`);
      toast(parts.join(", ") + (r.error ? ` — ${r.error}` : ""), true);
    } else {
      toast(parts.join(", ") || "Yükleme tamam");
    }
    if (r.count) pushTransfer({ type: "upload", label: `${r.count} dosya → ${targetDir}`, bytes: acc, time: Date.now() });
    if (cwd === targetDir) navigate(cwd, false);
  } catch (e) {
    setUploadProgress(null);
    toast(e.message, true);
  } finally {
    $("file-input").value = "";
  }
}

export function askUploadOptions(entries, summaryText) {
  return new Promise((resolve) => {
    const dlg = $("upload-options");
    if (!dlg) return resolve({ conflict: "overwrite", concurrency: 4, remember: false });
    let bytes = 0;
    for (const e of entries) bytes += (e.file && e.file.size) || 0;
    $("uo-summary").textContent = summaryText
      || `${entries.length} dosya (${fmtSize(bytes)}) → ${cwd}`;
    $("uo-remember").checked = false;
    dlg.hidden = false;
    const cleanup = () => {
      dlg.hidden = true;
      $("uo-start").removeEventListener("click", onStart);
      $("uo-cancel").removeEventListener("click", onCancel);
    };
    const onStart = () => {
      const conflict = (dlg.querySelector('input[name="uo-conflict"]:checked') || {}).value || "overwrite";
      const concurrency = parseInt($("uo-concurrency").value, 10) || 4;
      const remember = $("uo-remember").checked;
      cleanup();
      resolve({ conflict, concurrency, remember });
    };
    const onCancel = () => { cleanup(); resolve(null); };
    $("uo-start").addEventListener("click", onStart);
    $("uo-cancel").addEventListener("click", onCancel);
  });
}

let _activeXhr = null;

export function cancelUpload() {
  if (_activeXhr) { try { _activeXhr.abort(); } catch (_) {} }
}

// Süreyi okunabilir biçime çevir: "8 sn", "1 dk 5 sn", "2 sa 3 dk".
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "";
  sec = Math.round(sec);
  if (sec < 60) return `${sec} sn`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m} dk ${s} sn` : `${m} dk`;
  const h = Math.floor(m / 60);
  return `${h} sa ${m % 60} dk`;
}

// İstatistik satırını (boyut · hız · ETA · yüzde …) HTML olarak yaz.
function setStats(items) {
  const el = $("upload-progress-stats");
  if (!el) return;
  el.innerHTML = (items || [])
    .filter(Boolean)
    .map((t) => `<span class="ups-item"><span class="ups-strong">${t}</span></span>`)
    .join("");
}

// Faz 2: sunucu → uzak yazma ilerlemesi (gerçek dosya sayısı)
function setWriteProgress(done, total) {
  const box = $("upload-progress");
  if (!box) return;
  box.hidden = false;
  const bar = $("upload-progress-bar");
  const label = $("upload-progress-label");
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (bar) { bar.classList.remove("writing"); bar.style.width = pct + "%"; }
  if (label) label.textContent = "Sunucuya yazılıyor…";
  setStats([
    `${done}/${total} dosya`,
    `${Math.max(0, total - done)} kaldı`,
    `%${pct}`,
  ]);
}

function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    _activeXhr = xhr;
    xhr.open("POST", "/api/upload");
    if (session) xhr.setRequestHeader("x-session", session);

    // Faz 1: tarayıcı → sunucu (byte gönderimi)
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setUploadProgress(ev.loaded / ev.total); };

    // Faz 2: sunucu → uzak (NDJSON akışı; satır satır işle)
    let total = 0, seen = 0, finalObj = null;
    const consume = () => {
      const lines = (xhr.responseText || "").split("\n");
      for (; seen < lines.length - 1; seen++) {
        const line = lines[seen].trim();
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (_) { continue; }
        if (o.total != null) total = o.total;
        if (o.done != null) setWriteProgress(o.done, total);
        if (o.ok || o.error) finalObj = o;
      }
    };
    xhr.onprogress = consume;
    xhr.onload = () => {
      _activeXhr = null;
      consume();
      if (!finalObj) {
        try { finalObj = JSON.parse((xhr.responseText || "").trim().split("\n").pop()); } catch (_) {}
      }
      if (xhr.status === 401) { import("./connections.js").then((m) => m.logout()); return reject(new Error("Oturum doldu, yeniden bağlanın.")); }
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error((finalObj && finalObj.error) || "Yükleme hatası (" + xhr.status + ")"));
      resolve(finalObj || {});
    };
    xhr.onerror = () => { _activeXhr = null; reject(new Error("Sunucuya ulaşılamadı.")); };
    xhr.onabort = () => { _activeXhr = null; reject(new Error("Yükleme iptal edildi.")); };
    xhr.send(formData);
  });
}

let _progState = null;

function setUploadProgress(frac) {
  const box = $("upload-progress");
  // %100'e ulaşınca / iş bitince göstergeyi kapat
  if (frac === null) {
    _progState = null;
    setStats([]);
    if (box) box.hidden = true; else showLoading(false);
    return;
  }
  if (!box) { showLoading(true); return; }
  box.hidden = false;
  const pct = Math.round((frac || 0) * 100);
  const bar = $("upload-progress-bar");
  const label = $("upload-progress-label");
  if (bar) {
    bar.style.width = pct + "%";
    // Byte transferi bitti ama sunucu hâlâ yazıyor → hareketli belirsiz çubuk
    bar.classList.toggle("writing", pct >= 100);
  }
  if (!label) return;

  if (_progState) {
    const { total, cum, totalBytes, names } = _progState;
    const loaded = (frac || 0) * totalBytes;
    let done = 0;
    for (const c of cum) { if (loaded >= c - 1) done++; else break; }
    const remaining = Math.max(0, total - done);
    const cur = names[Math.min(done, total - 1)] || "";

    if (pct >= 100) {
      // Byte gönderimi bitti; sunucu uzak tarafa yazana kadar bekleniyor.
      label.textContent = "Sunucuya yazılıyor…";
      setStats([`${total}/${total} dosya`, fmtSize(totalBytes), `%100`]);
      return;
    }

    // Hız (üstel hareketli ortalama) ve tahmini kalan süre.
    const now = Date.now();
    const dt = (now - _progState.lastT) / 1000;
    if (dt >= 0.3) {
      const inst = (loaded - _progState.lastLoaded) / dt;
      _progState.speed = _progState.speed ? _progState.speed * 0.7 + inst * 0.3 : inst;
      _progState.lastT = now;
      _progState.lastLoaded = loaded;
    }
    const speed = _progState.speed;
    const eta = speed > 0 ? (totalBytes - loaded) / speed : Infinity;

    label.textContent = total > 1
      ? `${done + 1 > total ? total : done + 1}/${total} · ${cur}`
      : (cur || "Yükleniyor…");
    setStats([
      total > 1 ? `${remaining} dosya kaldı` : null,
      `${fmtSize(loaded)} / ${fmtSize(totalBytes)}`,
      speed > 0 ? `${fmtSize(speed)}/sn` : null,
      isFinite(eta) ? `~${fmtTime(eta)} kaldı` : null,
      `%${pct}`,
    ]);
  } else {
    label.textContent = "Yükleniyor…";
    setStats([`%${pct}`]);
  }
}

// ---- Sürükle-bırak ----
export function initDragDrop() {
  if ($("upload-cancel")) $("upload-cancel").addEventListener("click", cancelUpload);

  let dragDepth = 0;
  const explorerActive = () => !$("explorer").hidden && $("editor").hidden;
  const hasFiles = (e) => {
    const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
    return types.includes("Files") || types.includes(LOCAL_DT_TYPE);
  };

  window.addEventListener("dragenter", (e) => {
    if (!explorerActive()) return;
    e.preventDefault();
    dragDepth++;
    if (hasFiles(e)) { $("drop-hint").hidden = false; if ($("dropzone")) $("dropzone").classList.add("dragging"); }
  });
  window.addEventListener("dragover", (e) => {
    if (!explorerActive()) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "copy"; } catch (_) {}
  });
  window.addEventListener("dragleave", (e) => {
    if (!explorerActive()) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) { $("drop-hint").hidden = true; if ($("dropzone")) $("dropzone").classList.remove("dragging"); }
  });
  window.addEventListener("drop", async (e) => {
    if (!explorerActive()) return;
    e.preventDefault();
    dragDepth = 0;
    $("drop-hint").hidden = true;
    if ($("dropzone")) $("dropzone").classList.remove("dragging");
    const dt = e.dataTransfer;
    if (!dt) return;

    // Uygulama içi yerel gezginden sürüklenen öğeler ({ paths, folders } taşır).
    const localData = dt.getData && dt.getData(LOCAL_DT_TYPE);
    if (localData) {
      let payload = null;
      try { payload = JSON.parse(localData); } catch (_) {}
      // Geriye dönük uyum: eski biçim düz dizi olabilir.
      const paths = Array.isArray(payload) ? payload : (payload && payload.paths) || [];
      const folders = (payload && payload.folders) || [];
      if (paths.length) import("./transfer-queue.js").then((tq) =>
        tq.enqueueTransfer(`${paths.length} öğe yükle`, () =>
          import("./local-explorer.js").then((m) => m.uploadLocalPaths(paths, folders))));
      return;
    }

    const items = dt.items ? Array.from(dt.items) : [];
    // Masaüstünde sürüklenen klasörlerin diskteki yolunu hatırla. DataTransferItem
    // yalnızca bu olay sırasında geçerli; yolları SENKRON topla, sonra kaydet.
    if (window.desktop && window.desktop.getFilePath) {
      const dirPaths = [];
      for (const it of items) {
        if (it.kind !== "file" || typeof it.webkitGetAsEntry !== "function") continue;
        const entry = it.webkitGetAsEntry();
        if (!entry || !entry.isDirectory) continue;
        const f = it.getAsFile && it.getAsFile();
        const abs = f && window.desktop.getFilePath(f);
        if (abs) dirPaths.push(abs);
      }
      if (dirPaths.length) import("./recent-local.js").then((m) => m.rememberLocalPaths(dirPaths));
    }
    const roots = items
      .filter((it) => it.kind === "file" && typeof it.webkitGetAsEntry === "function")
      .map((it) => it.webkitGetAsEntry())
      .filter(Boolean);
    const hasDir = roots.some((r) => r && r.isDirectory);

    if (roots.length) {
      setUploadProgress(0);
      try {
        const entries = [];
        for (const root of roots) await walkEntry(root, "", entries);
        setUploadProgress(null);
        if (entries.length) return queueEntries(`Klasör yükle (${entries.length} dosya)`, entries);
        if (hasDir) return toast("Klasör boş görünüyor ya da okunamadı.", true);
      } catch (err) {
        setUploadProgress(null);
        return toast("Klasör okunamadı: " + ((err && err.message) || err), true);
      }
    }
    const files = dt.files;
    if (files && files.length)
      queueEntries(`${files.length} dosya yükle`, Array.from(files).map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })));
    else toast("Sürüklenen öğede yüklenebilir dosya yok.", true);
  });
}

// uploadEntries'i transfer kuyruğuna ekler (sıraya alır, üst üste binmez).
function queueEntries(label, entries) {
  if (!entries || !entries.length) return;
  import("./transfer-queue.js").then((tq) => tq.enqueueTransfer(label, () => uploadEntries(entries)));
}

function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const read = () => reader.readEntries((batch) => {
      if (!batch.length) resolve(all);
      else { all.push(...batch); read(); }
    }, reject);
    read();
  });
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, rel: prefix + entry.name });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const children = await readAllEntries(reader);
    const dirPrefix = prefix + entry.name + "/";
    for (const child of children) await walkEntry(child, dirPrefix, out);
  }
}
