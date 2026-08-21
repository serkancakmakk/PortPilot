import { $, showLoading, toast } from "./dom.js";
import { session, cwd, uploadPrefs, setUploadPrefs, pushTransfer, transferCtx, isActiveLane } from "./state.js";
import { navigate, fmtSize } from "./explorer.js";

// Uygulama içi yerel gezginden sürüklenen öğeler bu DataTransfer türüyle gelir.
const LOCAL_DT_TYPE = "application/x-portpilot-local";

// ctx: { session, cwd, lane, laneLabel, report }
// Hedef sunucu ve klasör iş KUYRUĞA EKLENİRKEN sabitlenir; iş çalışmaya
// başladığında kullanıcı çoktan başka sekmeye geçmiş olabilir.
// Geriye dönük uyum: ikinci argüman düz bir "report" nesnesi de olabilir.
export async function uploadEntries(entries, ctx) {
  ctx = normalizeCtx(ctx);
  const tSession = ctx.session != null ? ctx.session : session;
  const targetDir = ctx.cwd != null ? ctx.cwd : cwd;
  const report = ctx.report || null;

  entries = (entries || []).filter((e) => e && e.file);
  if (!entries.length) { toast("Yüklenecek dosya bulunamadı.", true); return; }

  const opts = uploadPrefs || (await askUploadOptions(entries, null, targetDir));
  if (!opts) { $("file-input").value = ""; return; }
  if (opts.remember) setUploadPrefs({ conflict: opts.conflict, concurrency: opts.concurrency });

  const fd = new FormData();
  fd.append("path", targetDir);
  fd.append("conflict", opts.conflict);
  fd.append("concurrency", String(opts.concurrency));
  for (const { file, rel } of entries) {
    fd.append("files", file);
    fd.append("paths", rel || file.name);
    fd.append("mtimes", String(file.lastModified || 0));
  }
  // Dosya sayısı/boyutları + adları (kalan dosya + hangi dosya gösterimi için)
  let acc = 0;
  const cum = entries.map(({ file }) => (
    acc += (file && file.size) || 0));
  const names = entries.map(({ rel, file }) => (rel || (file && file.name) || "dosya").split("/").pop());
  const now = Date.now();
  const prog = {
    lane: ctx.lane || "default", report,
    total: entries.length, cum, totalBytes: acc || 1, names,
    t0: now, lastT: now, lastLoaded: 0, speed: 0,
  };
  paintBytes(prog, 0);
  try {
    const r = await uploadWithProgress(fd, tSession, prog, report);
    paintEnd(prog);
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
    // Listeyi yalnızca hâlâ o sunucunun aynı klasörüne bakıyorsak tazele.
    if (isActiveLane(prog.lane) && cwd === targetDir) navigate(cwd, false);
  } catch (e) {
    paintEnd(prog);
    toast(e.message, true);
    throw e; // kuyruk satırı "hata" olarak işaretlensin
  } finally {
    $("file-input").value = "";
  }
}

// İkinci argüman ya tam bağlam ya da yalnızca kuyruğun report nesnesi olabilir.
function normalizeCtx(ctx) {
  if (!ctx) return transferCtx();
  if (typeof ctx.set === "function") return transferCtx({ report: ctx, lane: ctx.lane });
  return ctx;
}

// Yükleme seçenekleri penceresi tektir; paralel işler sırayla sorsun.
let _dlgChain = Promise.resolve();
export function askUploadOptions(entries, summaryText, targetDir) {
  const run = () => new Promise((resolve) => {
    const dlg = $("upload-options");
    if (!dlg) return resolve({ conflict: "overwrite", concurrency: 4, remember: false });
    let bytes = 0;
    for (const e of entries) bytes += (e.file && e.file.size) || 0;
    $("uo-summary").textContent = summaryText
      || `${entries.length} dosya (${fmtSize(bytes)}) → ${targetDir != null ? targetDir : cwd}`;
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
  const next = _dlgChain.then(run, run);
  _dlgChain = next.catch(() => {});
  return next;
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

// ---- İlerleme gösterimi ----
// Aynı anda birden çok sunucuya yükleme olabilir; her şeridin son durumu burada
// tutulur. Üstteki büyük gösterge yalnızca AKTİF sekmenin işini çizer, diğerleri
// kuyruk panelindeki kendi satırlarında ilerler.
const laneProgress = new Map(); // lane -> { label, stats:[], pct, writing }

function publish(prog, view, reportArgs) {
  if (view == null) laneProgress.delete(prog.lane);
  else laneProgress.set(prog.lane, view);
  if (prog.report) {
    if (view == null) prog.report.set(null, "");
    else prog.report.set(reportArgs[0], reportArgs[1]);
  }
  renderProgressBox();
}

// Aktif sekmeye ait bir iş varsa büyük göstergeyi onunla çiz, yoksa gizle.
export function renderProgressBox() {
  const box = $("upload-progress");
  if (!box) return;
  let view = null;
  for (const [lane, v] of laneProgress) if (isActiveLane(lane)) { view = v; break; }
  if (!view) { box.hidden = true; return; }
  box.hidden = false;
  const bar = $("upload-progress-bar");
  const label = $("upload-progress-label");
  if (bar) {
    bar.style.width = Math.max(0, Math.min(100, view.pct || 0)) + "%";
    bar.classList.toggle("writing", !!view.writing);
  }
  if (label) label.textContent = view.label || "Yükleniyor…";
  setStats(view.stats || []);
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
function paintWrite(prog, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  publish(prog, {
    pct, writing: false, label: "Sunucuya yazılıyor…",
    stats: [`${done}/${total} dosya`, `${Math.max(0, total - done)} kaldı`, `%${pct}`],
  }, [total ? done / total : null, `Sunucuya yazılıyor… ${done}/${total} dosya`]);
}

// Faz 1: tarayıcı → sunucu (bayt gönderimi)
function paintBytes(prog, frac) {
  const pct = Math.round((frac || 0) * 100);
  const { total, cum, totalBytes, names } = prog;
  const loaded = (frac || 0) * totalBytes;
  let done = 0;
  for (const c of cum) { if (loaded >= c - 1) done++; else break; }
  const remaining = Math.max(0, total - done);
  const cur = names[Math.min(done, total - 1)] || "";

  if (pct >= 100) {
    // Bayt gönderimi bitti; sunucu uzak tarafa yazana kadar bekleniyor.
    publish(prog, {
      pct: 100, writing: true, label: "Sunucuya yazılıyor…",
      stats: [`${total}/${total} dosya`, fmtSize(totalBytes), "%100"],
    }, [null, "Sunucuya yazılıyor…"]);
    return;
  }

  // Hız (üstel hareketli ortalama) ve tahmini kalan süre.
  const now = Date.now();
  const dt = (now - prog.lastT) / 1000;
  if (dt >= 0.3) {
    const inst = (loaded - prog.lastLoaded) / dt;
    prog.speed = prog.speed ? prog.speed * 0.7 + inst * 0.3 : inst;
    prog.lastT = now;
    prog.lastLoaded = loaded;
  }
  const speed = prog.speed;
  const eta = speed > 0 ? (totalBytes - loaded) / speed : Infinity;
  const bits = [
    `${fmtSize(loaded)} / ${fmtSize(totalBytes)}`,
    speed > 0 ? `${fmtSize(speed)}/sn` : null,
    isFinite(eta) ? `~${fmtTime(eta)} kaldı` : null,
  ].filter(Boolean);

  publish(prog, {
    pct, writing: false,
    label: total > 1 ? `${Math.min(done + 1, total)}/${total} · ${cur}` : (cur || "Yükleniyor…"),
    stats: [
      total > 1 ? `${remaining} dosya kaldı` : null,
      ...bits,
      `%${pct}`,
    ],
  }, [frac, bits.join(" · ")]);
}

function paintEnd(prog) {
  publish(prog, null);
  if (!$("upload-progress")) showLoading(false);
}

// Her iş kendi XHR'ını taşır; tek global değişken paralel işleri karıştırırdı
// (bir iş diğerinin isteğini iptal ederdi).
const laneXhr = new Map();

// Büyük göstergedeki iptal düğmesi: ekranda görünen (aktif sekmenin) işini durdurur.
export function cancelUpload() {
  for (const [lane, xhr] of laneXhr) {
    if (!isActiveLane(lane)) continue;
    try { xhr.abort(); } catch (_) {}
  }
}

function uploadWithProgress(formData, tSession, prog, report) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    laneXhr.set(prog.lane, xhr);
    if (report && report.setCancel) report.setCancel(() => { try { xhr.abort(); } catch (_) {} });
    const finish = () => { if (laneXhr.get(prog.lane) === xhr) laneXhr.delete(prog.lane); };
    xhr.open("POST", "/api/upload");
    if (tSession) xhr.setRequestHeader("x-session", tSession);

    // Faz 1: tarayıcı → sunucu (byte gönderimi)
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) paintBytes(prog, ev.loaded / ev.total); };

    // Faz 2: sunucu → uzak (NDJSON akışı; satır satır işle)
    let total = 0, seen = 0, finalObj = null;
    const consume = () => {
      const lines = (xhr.responseText || "").split("\n");
      for (; seen < lines.length - 1; seen++) {
        const line = lines[seen].trim();
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (_) { continue; }
        if (o.total != null) total = o.total;
        if (o.done != null) paintWrite(prog, o.done, total);
        if (o.ok || o.error) finalObj = o;
      }
    };
    xhr.onprogress = consume;
    xhr.onload = () => {
      finish();
      consume();
      if (!finalObj) {
        try { finalObj = JSON.parse((xhr.responseText || "").trim().split("\n").pop()); } catch (_) {}
      }
      if (xhr.status === 401) { import("./connections.js").then((m) => m.logout()); return reject(new Error("Oturum doldu, yeniden bağlanın.")); }
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error((finalObj && finalObj.error) || "Yükleme hatası (" + xhr.status + ")"));
      resolve(finalObj || {});
    };
    xhr.onerror = () => { finish(); reject(new Error("Sunucuya ulaşılamadı.")); };
    xhr.onabort = () => { finish(); reject(new Error("Yükleme iptal edildi.")); };
    xhr.send(formData);
  });
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
      if (paths.length) {
        const ctx = transferCtx();
        import("./transfer-queue.js").then((tq) =>
          tq.enqueueTransfer(`${paths.length} öğe yükle`, (report) =>
            import("./local-explorer.js").then((m) =>
              m.uploadLocalPaths(paths, folders, false, { ...ctx, report })), ctx));
      }
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
      try {
        const entries = [];
        for (const root of roots) await walkEntry(root, "", entries);
        if (entries.length) return queueEntries(`Klasör yükle (${entries.length} dosya)`, entries);
        if (hasDir) return toast("Klasör boş görünüyor ya da okunamadı.", true);
      } catch (err) {
        return toast("Klasör okunamadı: " + ((err && err.message) || err), true);
      }
    }
    const files = dt.files;
    if (files && files.length)
      queueEntries(`${files.length} dosya yükle`, Array.from(files).map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })));
    else toast("Sürüklenen öğede yüklenebilir dosya yok.", true);
  });
}

// uploadEntries'i transfer kuyruğuna ekler. Aynı sunucuya giden işler sıraya
// girer; farklı sunuculara gidenler paralel çalışır.
function queueEntries(label, entries) {
  if (!entries || !entries.length) return;
  const ctx = transferCtx();
  import("./transfer-queue.js").then((tq) =>
    tq.enqueueTransfer(label, (report) => uploadEntries(entries, { ...ctx, report }), ctx));
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
