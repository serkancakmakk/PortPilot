import { $, escapeHtml, toast } from "./dom.js";
import { api } from "./api.js";
import { icon } from "./icons.js";
import { connections, activeConnId, cwd, transferLog } from "./state.js";
import { fmtSize } from "./explorer.js";

let _timer = null;

function fmtUptime(sec) {
  if (!sec || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} gün ${h} saat`;
  if (h > 0) return `${h} saat ${m} dk`;
  if (m > 0) return `${m} dk`;
  return `${Math.floor(sec)} sn`;
}

function barClass(pct) {
  if (pct >= 90) return "bg-danger";
  if (pct >= 75) return "bg-warning";
  return "bg-success";
}

// Yüzde göstergeli kart (RAM / Disk / CPU yükü)
function gaugeCard(iconName, title, pct, primary, secondary) {
  return `
    <div class="col-12 col-md-4">
      <div class="card dash-card h-100">
        <div class="card-body">
          <div class="dash-card-head">
            <span class="dash-ico">${icon(iconName, "nav-ico")}</span>
            <span class="dash-card-title">${escapeHtml(title)}</span>
            <span class="dash-pct">%${pct}</span>
          </div>
          <div class="progress dash-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar ${barClass(pct)}" style="width:${pct}%"></div>
          </div>
          <div class="dash-card-foot">
            <span>${escapeHtml(primary)}</span>
            <span class="text-muted">${escapeHtml(secondary || "")}</span>
          </div>
        </div>
      </div>
    </div>`;
}

// Bilgi satırı kartı
function infoCard(iconName, title, rows) {
  const body = rows
    .map(([k, v]) => `<div class="dash-row"><span class="text-muted">${escapeHtml(k)}</span><span class="dash-val">${escapeHtml(v)}</span></div>`)
    .join("");
  return `
    <div class="col-12 col-md-6">
      <div class="card dash-card h-100">
        <div class="card-body">
          <div class="dash-card-head">
            <span class="dash-ico">${icon(iconName, "nav-ico")}</span>
            <span class="dash-card-title">${escapeHtml(title)}</span>
          </div>
          <div class="dash-rows">${body}</div>
        </div>
      </div>
    </div>`;
}

// Oturum transfer geçmişi kartı
function transferCard() {
  const rows = transferLog.length
    ? transferLog.slice(0, 8).map((t) => {
        const time = new Date(t.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
        const dir = t.type === "upload" ? "▲ Yükleme" : "▼ İndirme";
        const size = t.bytes ? " · " + fmtSize(t.bytes) : "";
        return `<div class="dash-row"><span class="text-muted">${dir} · ${time}</span><span class="dash-val">${escapeHtml(t.label)}${size}</span></div>`;
      }).join("")
    : `<div class="dash-row"><span class="text-muted">Bu oturumda henüz transfer yok</span><span></span></div>`;
  return `
    <div class="col-12">
      <div class="card dash-card">
        <div class="card-body">
          <div class="dash-card-head">
            <span class="dash-ico">${icon("activity", "nav-ico")}</span>
            <span class="dash-card-title">Transfer Geçmişi (bu oturum)</span>
            <span class="dash-pct" style="font-size:13px;color:var(--muted)">${transferLog.length || ""}</span>
          </div>
          <div class="dash-rows">${rows}</div>
        </div>
      </div>
    </div>`;
}

export async function loadDashboard() {
  const body = $("dash-body");
  const conn = connections.find((c) => c.id === activeConnId);
  if (!body) return;
  if (!body.dataset.loaded) body.innerHTML = `<div class="dash-msg">Yükleniyor…</div>`;
  $("dash-status").textContent = "";

  let s;
  try {
    s = await api("stats");
  } catch (e) {
    body.innerHTML = `<div class="dash-msg">İstatistikler alınamadı: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const i = conn && conn.info ? conn.info : {};
  const connRows = [
    ["Sunucu", i.host || "—"],
    ["Kullanıcı", i.username || "—"],
    ["Protokol", (i.protocol || "").toUpperCase() + (i.port ? " · " + i.port : "")],
    ["Bağlı süre", conn && conn.connectedAt ? fmtUptime(Math.floor((Date.now() - conn.connectedAt) / 1000)) : "—"],
    ["Geçerli klasör", cwd || "/"],
  ];

  if (!s || !s.available) {
    body.dataset.loaded = "1";
    body.innerHTML = `
      <div class="row g-3 mb-1">
        ${infoCard("server", "Bağlantı", connRows)}
      </div>
      <div class="row g-3">${transferCard()}</div>
      <div class="dash-msg mt-3">Bu bağlantıda canlı sistem istatistikleri yok (komut çalıştırma kapalı veya FTP bağlantısı).</div>`;
    return;
  }

  const cards = [
    gaugeCard("cpu", "CPU Yükü", s.load.percent,
      `${s.load["1"].toFixed(2)} / ${s.cpuCount} çekirdek`,
      `5dk ${s.load["5"].toFixed(2)} · 15dk ${s.load["15"].toFixed(2)}`),
    gaugeCard("activity", "Bellek (RAM)", s.mem.percent,
      `${fmtSize(s.mem.used)} / ${fmtSize(s.mem.total)}`,
      `${fmtSize(s.mem.avail)} boş`),
    s.disk
      ? gaugeCard("hard-drive", "Disk (/)", s.disk.percent,
          `${fmtSize(s.disk.used)} / ${fmtSize(s.disk.total)}`,
          `${fmtSize(s.disk.avail)} boş`)
      : "",
  ].join("");

  const sysRows = [
    ["İşletim sistemi", s.os || "—"],
    ["Çekirdek", s.kernel || "—"],
    ["İşlemci", (s.cpuName || "—").trim() + (s.cpuCount ? ` (${s.cpuCount}×)` : "")],
    ["Çalışma süresi", fmtUptime(s.uptimeSec)],
    ["Ana makine adı", s.hostname || "—"],
  ];

  body.dataset.loaded = "1";
  body.innerHTML = `
    <div class="row g-3 mb-1">${cards}</div>
    <div class="row g-3 mb-1">
      ${infoCard("server", "Bağlantı", connRows)}
      ${infoCard("settings", "Sistem", sysRows)}
    </div>
    <div class="row g-3">${transferCard()}</div>`;
  $("dash-status").textContent = "Güncellendi · " + new Date().toLocaleTimeString("tr-TR");
}

// Ana bölümde paneli göster (dosya görünümünü gizle)
function setDashboardView(on) {
  if ($("dash-view")) $("dash-view").hidden = !on;
  if ($("file-area")) $("file-area").hidden = on;
  if ($("statusbar")) $("statusbar").hidden = on;
}

export function openDashboard() {
  setDashboardView(true);
  $("dash-body").dataset.loaded = "";
  loadDashboard();
  clearInterval(_timer);
  _timer = setInterval(() => { if ($("dash-view") && !$("dash-view").hidden) loadDashboard(); }, 5000);
}

// Dosya görünümüne dön (panel açıksa kapat)
export function showFilesView() {
  if (!$("dash-view") || $("dash-view").hidden) return;
  setDashboardView(false);
  clearInterval(_timer);
  _timer = null;
}

export function initDashboard() {
  const btn = $("btn-dashboard");
  if (btn) btn.addEventListener("click", openDashboard);
  $("dash-files").addEventListener("click", showFilesView);
  $("dash-refresh").addEventListener("click", () => loadDashboard());
}
