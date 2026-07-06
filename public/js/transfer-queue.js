// Transfer kuyruğu: yükleme işlemlerini sıraya alıp tek tek çalıştırır (üst üste
// binmeyi önler), küçük bir panelde gösterir. "Duraklat" sıradakileri bekletir
// (çalışan iş biter); "Devam Et" kaldığı yerden sürdürür.
// Not: Bu kuyruk-seviyesi duraklatmadır; tek bir dosyanın baytları kaldığı yerden
// sürdürülmez (çalışan iş, abort edilmediği sürece tamamlanır).
import { $ } from "./dom.js";

let _id = 0;
const jobs = [];          // { id, label, run, status: queued|running|done|error, error, progress, detail }
let running = false;
let paused = false;

function panel() { return $("tq-panel"); }

export function enqueueTransfer(label, run) {
  const job = { id: ++_id, label: label || "Aktarım", run, status: "queued", progress: null, detail: "" };
  jobs.push(job);
  render();
  pump();
  return job.id;
}

async function pump() {
  if (running || paused) return;
  const job = jobs.find((j) => j.status === "queued");
  if (!job) return;
  running = true;
  job.status = "running";
  render();
  // İşe ilerleme bildirici geçir: frac (0..1; belirsizse null) + kısa açıklama.
  // İş bunu çağırmasa da sorun değil; satır belirsiz (hareketli) çubuk gösterir.
  const report = {
    set(frac, detail) {
      job.progress = (frac == null || isNaN(frac)) ? null : Math.max(0, Math.min(1, frac));
      if (detail != null) job.detail = detail;
      scheduleRender();
    },
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
  running = false;
  render();
  pump(); // sıradaki
}

function counts() {
  const q = jobs.filter((j) => j.status === "queued").length;
  const run = jobs.some((j) => j.status === "running") ? 1 : 0;
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
    `${c.run ? "1 etkin · " : ""}${c.q} sırada · ${c.done} bitti${c.err ? " · " + c.err + " hata" : ""}`;

  const pauseBtn = $("tq-pause");
  if (pauseBtn) pauseBtn.textContent = paused ? "Devam Et" : "Duraklat";

  const list = $("tq-list");
  if (list) {
    list.innerHTML = jobs.slice(-20).map((j) => {
      const ico = j.status === "running" ? "⏳" : j.status === "done" ? "✅" : j.status === "error" ? "⚠️" : "•";
      const cls = j.status;
      const sub = j.status === "error" ? `<div class="tq-err">${escapeHtml(j.error || "")}</div>` : "";
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
      return `<div class="tq-row ${cls}"><span class="tq-ico">${ico}</span><span class="tq-label">${escapeHtml(j.label)}</span>${pct}${sub}${bar}${detail}</div>`;
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
  render();
}
