// Transfer kuyruğu: aktarımları "şerit" (lane) bazında yönetir ve küçük bir
// panelde gösterir.
//   • AYNI sunucuya giden işler sırayla çalışır (tek bağlantıyı boğmamak için).
//   • FARKLI sunuculara giden işler AYNI ANDA çalışır (birbirini beklemez).
// Şerit anahtarı, iş kuyruğa eklenirken sabitlenen bağlantı kimliğidir; böylece
// sekme değişse bile iş, başlatıldığı sunucuya gider.
// "Duraklat" sıradakileri bekletir (çalışan işler biter); "Devam Et" sürdürür.
// Not: Bu kuyruk-seviyesi duraklatmadır; tek bir dosyanın baytları kaldığı
// yerden sürdürülmez (çalışan iş, abort edilmediği sürece tamamlanır).
import { $ } from "./dom.js";

let _id = 0;
// { id, label, run, lane, laneLabel, status: queued|running|done|error, error, progress, detail, cancel }
const jobs = [];
const runningLanes = new Set();   // o an iş yürüten şeritler
let paused = false;

function panel() { return $("tq-panel"); }

// opts: { lane, laneLabel } — lane verilmezse tüm işler tek şeritte (sırayla) akar.
export function enqueueTransfer(label, run, opts = {}) {
  const job = {
    id: ++_id,
    label: label || "Aktarım",
    run,
    lane: opts.lane || "default",
    laneLabel: opts.laneLabel || "",
    status: "queued",
    progress: null,
    detail: "",
    cancel: null,
  };
  jobs.push(job);
  render();
  pump();
  return job.id;
}

// Boşta olan HER şeritte sıradaki işi başlat (şeritler birbirini beklemez).
function pump() {
  if (paused) return;
  for (const job of jobs) {
    if (job.status !== "queued") continue;
    if (runningLanes.has(job.lane)) continue;
    start(job);
  }
}

async function start(job) {
  runningLanes.add(job.lane);
  job.status = "running";
  render();
  // İşe ilerleme bildirici geçir: frac (0..1; belirsizse null) + kısa açıklama.
  // İş bunu çağırmasa da sorun değil; satır belirsiz (hareketli) çubuk gösterir.
  const report = {
    lane: job.lane,
    set(frac, detail) {
      job.progress = (frac == null || isNaN(frac)) ? null : Math.max(0, Math.min(1, frac));
      if (detail != null) job.detail = detail;
      scheduleRender();
    },
    // İş, kendini durdurabiliyorsa (XHR/fetch abort) bunu bildirir; satırdaki
    // ✕ düğmesi bu geri çağırmayı tetikler.
    setCancel(fn) { job.cancel = fn; },
  };
  try {
    await job.run(report);
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = (e && e.message) || String(e);
  }
  job.progress = null;
  job.detail = "";
  job.cancel = null;
  runningLanes.delete(job.lane);
  render();
  pump(); // aynı şeritteki sıradaki iş
}

// Sıradaki işi kuyruktan düşürür; çalışan işi (destekliyorsa) durdurur.
export function cancelJob(id) {
  const job = jobs.find((j) => j.id === Number(id));
  if (!job) return;
  if (job.status === "queued") {
    job.status = "error";
    job.error = "İptal edildi";
    render();
    return;
  }
  if (job.status === "running" && job.cancel) { try { job.cancel(); } catch (_) {} }
}

function counts() {
  const q = jobs.filter((j) => j.status === "queued").length;
  const run = jobs.filter((j) => j.status === "running").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const err = jobs.filter((j) => j.status === "error").length;
  return { q, run, done, err };
}

// İlerleme olayları sık gelebilir; render'ı kareye (rAF) sıkıştırarak birleştir.
let _raf = 0;
function scheduleRender() {
  if (_raf) return;
  const raf = (typeof requestAnimationFrame === "function")
    ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
  _raf = raf(() => { _raf = 0; render(); });
}

function render() {
  const p = panel();
  if (!p) return;
  if (!jobs.length) { p.hidden = true; return; }
  p.hidden = false;

  const c = counts();
  const cEl = $("tq-counts");
  if (cEl) cEl.textContent =
    `${c.run ? c.run + " etkin · " : ""}${c.q} sırada · ${c.done} bitti${c.err ? " · " + c.err + " hata" : ""}`;

  const pauseBtn = $("tq-pause");
  if (pauseBtn) pauseBtn.textContent = paused ? "Devam Et" : "Duraklat";

  const list = $("tq-list");
  if (list) {
    list.innerHTML = jobs.slice(-20).map((j) => {
      const ico = j.status === "running" ? "⏳" : j.status === "done" ? "✅" : j.status === "error" ? "⚠️" : "•";
      const cls = j.status;
      const sub = j.status === "error" ? `<div class="tq-err">${escapeHtml(j.error || "")}</div>` : "";
      // İşler paralel akabildiği için satır hangi sunucuya gittiğini yazar.
      const lane = j.laneLabel ? `<span class="tq-lane">${escapeHtml(j.laneLabel)}</span>` : "";
      const x = (j.status === "running" || j.status === "queued")
        ? `<button type="button" class="tq-x" data-cancel="${j.id}" title="İptal">✕</button>` : "";
      // Çalışan iş: yüzde (biliniyorsa) + mini ilerleme çubuğu + kısa açıklama.
      let pct = "";
      let bar = "";
      let detail = "";
      if (j.status === "running") {
        if (j.progress != null) {
          const p100 = Math.round(j.progress * 100);
          pct = `<span class="tq-pct">%${p100}</span>`;
          bar = `<div class="tq-bar"><div class="tq-bar-fill" style="width:${p100}%"></div></div>`;
        } else {
          // İlerleme bilinmiyor → hareketli (belirsiz) çubuk
          bar = `<div class="tq-bar"><div class="tq-bar-fill indet"></div></div>`;
        }
        if (j.detail) detail = `<div class="tq-detail">${escapeHtml(j.detail)}</div>`;
      }
      return `<div class="tq-row ${cls}"><span class="tq-ico">${ico}</span>` +
        `<span class="tq-label">${escapeHtml(j.label)}</span>${lane}${pct}${x}${sub}${bar}${detail}</div>`;
    }).join("");
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function pauseQueue() { paused = true; render(); }
export function resumeQueue() { paused = false; render(); pump(); }
export function togglePause() { paused ? resumeQueue() : pauseQueue(); }
export function clearFinished() {
  for (let i = jobs.length - 1; i >= 0; i--)
    if (jobs[i].status === "done" || jobs[i].status === "error") jobs.splice(i, 1);
  render();
}

export function initTransferQueue() {
  if ($("tq-pause")) $("tq-pause").addEventListener("click", togglePause);
  if ($("tq-clear")) $("tq-clear").addEventListener("click", clearFinished);
  if ($("tq-hide")) $("tq-hide").addEventListener("click", () => { const p = panel(); if (p) p.hidden = true; });
  const list = $("tq-list");
  if (list) list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (btn) cancelJob(btn.dataset.cancel);
  });
  render();
}
