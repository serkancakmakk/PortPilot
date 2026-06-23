import { $, showLoading, toast, escapeHtml } from "./dom.js";
import { api } from "./api.js";

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1, n = bytes;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
}

async function detectPlatform() {
  let os = "", arch = "x64";
  const ua = navigator.userAgent || "";
  const uad = navigator.userAgentData;
  if (uad && uad.platform) {
    const p = uad.platform.toLowerCase();
    os = p.includes("mac") ? "mac" : p.includes("win") ? "win" : p.includes("linux") ? "linux" : "";
    try { const hv = await uad.getHighEntropyValues(["architecture"]); if ((hv.architecture || "").includes("arm")) arch = "arm64"; } catch (_) {}
  } else {
    os = /mac/i.test(ua) ? "mac" : /win/i.test(ua) ? "win" : /linux|x11|android/i.test(ua) ? "linux" : "";
    if (/arm64|aarch64/i.test(ua)) arch = "arm64";
  }
  return { os, arch };
}

function pickBest(items, det) {
  if (!det.os) return null;
  const cand = items.filter((i) => i.os === det.os);
  if (!cand.length) return null;
  let pool = cand.filter((i) => i.arch === det.arch);
  if (!pool.length) pool = cand;
  const rank = (i) => {
    const n = i.name.toLowerCase();
    if (n.endsWith(".dmg")) return 0;
    if (n.endsWith(".exe") && /setup/i.test(n)) return 0;
    if (n.endsWith(".appimage")) return 0;
    if (n.endsWith(".exe")) return 1;
    if (n.endsWith(".zip")) return 3;
    return 2;
  };
  return pool.slice().sort((a, b) => rank(a) - rank(b))[0];
}

function prettyName(it) {
  let archTxt = "";
  if (it.arch === "arm64") archTxt = it.os === "mac" ? "Apple Silicon / ARM64" : "ARM64";
  else if (it.arch === "x64") archTxt = it.os === "mac" ? "Intel / x64" : "64-bit (x64)";
  const ext = (it.name.split(".").pop() || "").toUpperCase();
  const isSetup = /setup/i.test(it.name);
  const kind = ext === "DMG" ? "DMG kurulum"
    : ext === "EXE" ? (isSetup ? "Kurulumlu (Setup)" : "Taşınabilir (portable)")
    : ext === "APPIMAGE" ? "AppImage (taşınabilir)"
    : ext === "DEB" ? "DEB paketi"
    : ext === "ZIP" ? "ZIP arşivi"
    : ext;
  return archTxt ? `${kind} — ${archTxt}` : kind;
}

export async function openDownloads() {
  $("downloads").hidden = false;
  const body = $("dl-body");
  body.innerHTML = `<div class="dl-msg">Yükleniyor…</div>`;
  let data;
  try { data = await api("downloads"); }
  catch (e) { body.innerHTML = `<div class="dl-msg">Hata: ${escapeHtml(e.message)}</div>`; return; }
  if (!data.available || !data.items.length) {
    body.innerHTML = `<div class="dl-msg">Henüz hazır kurulum dosyası yok.<br><br>Bilgisayarında <code>npm run dist</code> komutunu çalıştırınca üretilen dosyalar <code>dist/</code> klasörüne düşer ve burada listelenir.</div>`;
    return;
  }
  const det = await detectPlatform();
  const best = pickBest(data.items, det);
  let html = "";
  if (best) {
    html += `<a class="dl-rec" href="${best.url}" download>
      <span class="dl-rec-ic">${best.icon}</span>
      <span class="dl-rec-info">
        <span class="dl-rec-top">Senin sistemin için önerilen</span>
        <span class="dl-rec-name">${escapeHtml(best.label)} — ${escapeHtml(prettyName(best))}</span>
        <span class="dl-rec-meta">${escapeHtml(best.name)} • ${fmtSize(best.size)}</span>
      </span>
      <span class="dl-rec-btn">⬇ İndir</span>
    </a><div class="dl-allhead">Tüm sürümler</div>`;
  }
  const groups = {};
  data.items.forEach((it) => {
    (groups[it.label] = groups[it.label] || { icon: it.icon, items: [] }).items.push(it);
  });
  html += Object.keys(groups).map((label) => {
    const g = groups[label];
    const rows = g.items.map((it) => `<a class="dl-item${best && it.name === best.name ? " current" : ""}" href="${it.url}" download>
      <span class="dl-ic">⬇</span>
      <span class="dl-info"><span class="dl-name">${escapeHtml(prettyName(it))}</span><span class="dl-meta">${escapeHtml(it.name)} • ${fmtSize(it.size)}</span></span>
    </a>`).join("");
    return `<div class="dl-group"><div class="dl-head">${g.icon} ${escapeHtml(label)}</div>${rows}</div>`;
  }).join("");
  body.innerHTML = html;
}

export function initDownloads() {
  $("open-downloads").addEventListener("click", openDownloads);
  $("downloads-close").addEventListener("click", () => { $("downloads").hidden = true; });
}
