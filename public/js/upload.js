import { $, showLoading, toast } from "./dom.js";
import { session, cwd, uploadPrefs, setUploadPrefs, pushTransfer } from "./state.js";
import { navigate, fmtSize } from "./explorer.js";

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
  const cum = entries.map(({ file }) => (acc += (file && file.size) || 0));
  const names = entries.map(({ rel, file }) => (rel || (file && file.name) || "dosya").split("/").pop());
  _progState = { total: entries.length, cum, totalBytes: acc || 1, names };
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

function askUploadOptions(entries) {
  return new Promise((resolve) => {
    const dlg = $("upload-options");
    if (!dlg) return resolve({ conflict: "overwrite", concurrency: 4, remember: false });
    let bytes = 0;
    for (const e of entries) bytes += (e.file && e.file.size) || 0;
    $("uo-summary").textContent = `${entries.length} dosya (${fmtSize(bytes)}) → ${cwd}`;
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

// Faz 2: sunucu → uzak yazma ilerlemesi (gerçek dosya sayısı)
function setWriteProgress(done, total) {
  const box = $("upload-progress");
  if (!box) return;
  box.hidden = false;
  const bar = $("upload-progress-bar");
  const label = $("upload-progress-label");
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (bar) { bar.classList.remove("writing"); bar.style.width = pct + "%"; }
  if (label) label.textContent = `Sunucuya yazılıyor… ${done}/${total} · ${Math.max(0, total - done)} kaldı · %${pct}`;
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
    label.textContent = pct >= 100
      ? `Sunucuya yazılıyor… (${total}/${total} dosya)`
      : `${done}/${total} · ${cur} · ${remaining} kaldı · %${pct}`;
  } else {
    label.textContent = `Yükleniyor… %${pct}`;
  }
}

// ---- Sürükle-bırak ----
export function initDragDrop() {
  if ($("upload-cancel")) $("upload-cancel").addEventListener("click", cancelUpload);

  let dragDepth = 0;
  const explorerActive = () => !$("explorer").hidden && $("editor").hidden;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

  window.addEventListener("dragenter", (e) => {
    if (!explorerActive()) return;
    e.preventDefault();
    dragDepth++;
    if (hasFiles(e)) { $("drop-hint").hidden = false; $("dropzone").classList.add("dragging"); }
  });
  window.addEventListener("dragover", (e) => {
    if (!explorerActive()) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "copy"; } catch (_) {}
  });
  window.addEventListener("dragleave", (e) => {
    if (!explorerActive()) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) { $("drop-hint").hidden = true; $("dropzone").classList.remove("dragging"); }
  });
  window.addEventListener("drop", async (e) => {
    if (!explorerActive()) return;
    e.preventDefault();
    dragDepth = 0;
    $("drop-hint").hidden = true;
    $("dropzone").classList.remove("dragging");
    const dt = e.dataTransfer;
    if (!dt) return;

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
        if (entries.length) return uploadEntries(entries);
        if (hasDir) return toast("Klasör boş görünüyor ya da okunamadı.", true);
      } catch (err) {
        setUploadProgress(null);
        return toast("Klasör okunamadı: " + ((err && err.message) || err), true);
      }
    }
    const files = dt.files;
    if (files && files.length)
      uploadEntries(Array.from(files).map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })));
    else toast("Sürüklenen öğede yüklenebilir dosya yok.", true);
  });
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
