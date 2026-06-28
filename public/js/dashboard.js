import { $, escapeHtml, toast } from "./dom.js";
import { api } from "./api.js";
import { icon } from "./icons.js";
import { connections, activeConnId, cwd, transferLog } from "./state.js";
import { fmtSize } from "./explorer.js";
import { t } from "./i18n.js";

let _timer = null;

// ---- Sağlık geçmişi (sparkline için halka tampon) ----
const HIST_MAX = 60; // ~5 dk (5 sn'de bir örnek)
const history = { cpu: [], mem: [], disk: [] };
let histKey = ""; // aktif bağlantı değişince geçmişi sıfırla
function pushHistory(key, vals) {
  if (key !== histKey) { history.cpu = []; history.mem = []; history.disk = []; histKey = key; }
  for (const k of ["cpu", "mem", "disk"]) {
    const v = vals[k];
    if (v == null || Number.isNaN(v)) continue;
    history[k].push(v);
    if (history[k].length > HIST_MAX) history[k].shift();
  }
}

// Bir canvas'a yüzde geçmişini sparkline olarak çiz
function drawSparkline(canvas, data, color) {
  if (!canvas || !data.length) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 200, h = canvas.clientHeight || 34;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const n = data.length;
  const x = (i) => (n <= 1 ? w : (i / (n - 1)) * w);
  const y = (v) => h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
  ctx.beginPath();
  ctx.moveTo(x(0), h);
  data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(n - 1), h);
  ctx.closePath();
  ctx.fillStyle = color + "22";
  ctx.fill();
  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}

// ---- Eşik bildirimleri (disk/RAM/CPU kritik) ----
const NOTIFY_THRESHOLD = 90;       // %90 ve üzeri
const NOTIFY_COOLDOWN = 5 * 60000; // aynı metrik için 5 dk'da bir
const lastNotified = {};
function maybeRequestNotifyPerm() {
  try {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  } catch (_) {}
}
function checkThresholds(host, vals, labels) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = Date.now();
  for (const k of ["cpu", "mem", "disk"]) {
    const v = vals[k];
    if (v == null) continue;
    if (v >= NOTIFY_THRESHOLD) {
      if (!lastNotified[k + host] || now - lastNotified[k + host] > NOTIFY_COOLDOWN) {
        lastNotified[k + host] = now;
        try { new Notification(`PortPilot · ${host}`, { body: `${labels[k]} %${v} — kritik seviye`, tag: "pp-" + k }); } catch (_) {}
      }
    } else if (v < NOTIFY_THRESHOLD - 5) {
      delete lastNotified[k + host]; // histerezis: belirgin düşünce yeniden uyar
    }
  }
}

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

// Yüzde göstergeli kart (RAM / Disk / CPU yükü) — metric: cpu|mem|disk (sparkline için)
function gaugeCard(iconName, title, pct, primary, secondary, metric) {
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
          ${metric ? `<canvas class="dash-spark" data-metric="${metric}" height="34"></canvas>` : ""}
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
            <span class="dash-card-title">${escapeHtml(t("dash.transfers"))}</span>
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
    ...(i.via ? [["Atlama sunucusu", "🛡️ " + i.via]] : []),
    ["Bağlı süre", conn && conn.connectedAt ? fmtUptime(Math.floor((Date.now() - conn.connectedAt) / 1000)) : "—"],
    ["Geçerli klasör", cwd || "/"],
  ];

  if (!s || !s.available) {
    body.dataset.loaded = "1";
    body.innerHTML = `
      <div class="row g-3 mb-1">
        ${infoCard("server", t("dash.connection"), connRows)}
      </div>
      <div class="row g-3">${transferCard()}</div>
      <div class="dash-msg mt-3">Bu bağlantıda canlı sistem istatistikleri yok (komut çalıştırma kapalı veya FTP bağlantısı).</div>`;
    return;
  }

  // Geçmişe örnek ekle (sparkline + eşik bildirimi)
  const vals = {
    cpu: s.load && s.load.percent != null ? s.load.percent : null,
    mem: s.mem && s.mem.percent != null ? s.mem.percent : null,
    disk: s.disk && s.disk.percent != null ? s.disk.percent : null,
  };
  pushHistory(i.host || histKey || "?", vals);
  checkThresholds(i.host || "sunucu", vals, { cpu: "CPU yükü", mem: "Bellek (RAM)", disk: "Disk" });

  const cards = [
    gaugeCard("cpu", t("dash.cpu"), s.load.percent,
      `${s.load["1"].toFixed(2)} / ${s.cpuCount} çekirdek`,
      `5dk ${s.load["5"].toFixed(2)} · 15dk ${s.load["15"].toFixed(2)}`, "cpu"),
    gaugeCard("activity", t("dash.ram"), s.mem.percent,
      `${fmtSize(s.mem.used)} / ${fmtSize(s.mem.total)}`,
      `${fmtSize(s.mem.avail)} boş`, "mem"),
    s.disk
      ? gaugeCard("hard-drive", t("dash.disk"), s.disk.percent,
          `${fmtSize(s.disk.used)} / ${fmtSize(s.disk.total)}`,
          `${fmtSize(s.disk.avail)} boş`, "disk")
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
      ${infoCard("server", t("dash.connection"), connRows)}
      ${infoCard("settings", t("dash.system"), sysRows)}
    </div>
    <div class="row g-3">${transferCard()}</div>`;

  // Sparkline'ları çiz (metrik renkleri durum çubuklarıyla uyumlu)
  const colors = { cpu: "#2563eb", mem: "#7c3aed", disk: "#0d9488" };
  body.querySelectorAll(".dash-spark").forEach((cv) => {
    const m = cv.dataset.metric;
    drawSparkline(cv, history[m] || [], colors[m] || "#2563eb");
  });

  $("dash-status").textContent = "Güncellendi · " + new Date().toLocaleTimeString("tr-TR");
}

// Ana bölümde paneli göster (dosya görünümünü gizle)
function setDashboardView(on) {
  if ($("dash-view")) $("dash-view").hidden = !on;
  // Dosya alanı artık ".panes" sarmalayıcısının içinde (çift panel için). Yalnızca
  // #file-area'yı gizlersek boş kalan .panes (flex:1) paneli sıkıştırıp kestirir;
  // bu yüzden tüm sarmalayıcıyı gizle.
  if ($("panes")) $("panes").hidden = on;
  if ($("statusbar")) $("statusbar").hidden = on;
}

export function openDashboard() {
  setDashboardView(true);
  maybeRequestNotifyPerm();
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
