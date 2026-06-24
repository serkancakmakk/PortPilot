// "Neler yeni?" — uygulama açılınca sürüm değiştiyse sürüm notlarını gösterir.
// Ayrıca sidebar'daki "Sürüm notları"ndan elle de açılabilir.
import { $, escapeHtml } from "./dom.js";

const SEEN_KEY = "seenVersion";

async function getVersion() {
  try {
    if (window.desktop && window.desktop.version) {
      const v = await window.desktop.version();
      if (v) return v;
    }
  } catch (_) {}
  try {
    const r = await fetch("/api/version");
    if (r.ok) return (await r.json()).version || "";
  } catch (_) {}
  return "";
}

// CHANGELOG markdown → basit, güvenli HTML (## başlık, **kalın**, - madde).
function mdToHtml(md) {
  const lines = (md || "").split("\n");
  let html = "", inList = false;
  const close = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (let raw of lines) {
    const line = raw.replace(/\r$/, "");
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
      close();
      html += `<h4>${inline(m[1])}</h4>`;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(m[1])}</li>`;
    } else if (line.trim() === "") {
      close();
    } else {
      close();
      html += `<p>${inline(line)}</p>`;
    }
  }
  close();
  return html;
}
function inline(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export async function showWhatsNew() {
  let data;
  try { data = await (await fetch("/api/changelog")).json(); } catch (_) { data = null; }
  if (!data || !data.markdown) return;
  let ov = $("whatsnew");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "whatsnew";
    ov.className = "sr-overlay";
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="sr-box wn-box">
    <div class="sr-head"><b>🎉 Neler yeni? ${data.version ? "· v" + escapeHtml(data.version) : ""}</b><button type="button" class="sr-close" title="Kapat">✕</button></div>
    <div class="sr-list wn-body">${mdToHtml(data.markdown)}</div>
  </div>`;
  ov.hidden = false;
  const close = () => { ov.hidden = true; };
  ov.querySelector(".sr-close").onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
}

export async function initWhatsNew() {
  const link = $("btn-whatsnew");
  if (link) link.addEventListener("click", showWhatsNew);

  const version = await getVersion();
  if (!version) return;
  const seen = localStorage.getItem(SEEN_KEY);
  localStorage.setItem(SEEN_KEY, version);
  // İlk kurulumda da, sürüm değiştiğinde de göster (boş seen = ilk açılış).
  if (seen !== version) showWhatsNew();
}
