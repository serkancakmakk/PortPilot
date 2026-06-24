// Transfer kuyruğu: yükleme işlemlerini sıraya alıp tek tek çalıştırır (üst üste
// binmeyi önler), küçük bir panelde gösterir. "Duraklat" sıradakileri bekletir
// (çalışan iş biter); "Devam Et" kaldığı yerden sürdürür.
// Not: Bu kuyruk-seviyesi duraklatmadır; tek bir dosyanın baytları kaldığı yerden
// sürdürülmez (çalışan iş, abort edilmediği sürece tamamlanır).
import { $ } from "./dom.js";

let _id = 0;
const jobs = [];          // { id, label, run, status: queued|running|done|error, error }
let running = false;
let paused = false;

function panel() { return $("tq-panel"); }

export function enqueueTransfer(label, run) {
  const job = { id: ++_id, label: label || "Aktarım", run, status: "queued" };
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
  try {
    await job.run();
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = (e && e.message) || String(e);
  }
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
      return `<div class="tq-row ${cls}"><span class="tq-ico">${ico}</span><span class="tq-label">${escapeHtml(j.label)}</span>${sub}</div>`;
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
