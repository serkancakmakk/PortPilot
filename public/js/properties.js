import { $, escapeHtml, toast, showLoading } from "./dom.js";
import { api } from "./api.js";
import { fmtSize, fmtDate } from "./explorer.js";

// Sağ tık → "Özellikler": sahip/grup/izin/boyut/tarih; klasörde özyinelemeli boyut.
export async function showProperties(item, full) {
  showLoading(true);
  let data;
  try {
    data = await api("properties?path=" + encodeURIComponent(full));
  } catch (e) {
    toast(e.message, true);
    return;
  } finally {
    showLoading(false);
  }
  renderDialog(item, data);
}

function row(label, value) {
  if (value == null || value === "") return "";
  return `<div class="props-row"><span class="props-key">${escapeHtml(label)}</span><span class="props-val">${escapeHtml(String(value))}</span></div>`;
}

function renderDialog(item, d) {
  const kind = d.isDir ? "Klasör" : d.isLink ? "Sembolik bağlantı" : (item.type === "file" ? "Dosya" : (d.kind || "Dosya"));
  const ico = d.isDir ? "📁" : d.isLink ? "🔗" : "📄";

  let sizeStr = "";
  if (d.isDir) {
    if (typeof d.totalSize === "number") {
      sizeStr = fmtSize(d.totalSize) + ` (${d.totalSize.toLocaleString("tr-TR")} bayt)`;
      if (typeof d.itemCount === "number") sizeStr += ` · ${d.itemCount.toLocaleString("tr-TR")} öğe`;
    }
  } else if (typeof d.size === "number") {
    sizeStr = fmtSize(d.size) + ` (${d.size.toLocaleString("tr-TR")} bayt)`;
  }

  let perms = "";
  if (d.permsOctal || d.permsText) {
    perms = [d.permsOctal, d.permsText].filter(Boolean).join("  ");
  }

  const rows = [
    row("Tür", kind),
    row("Konum", d.path),
    sizeStr ? row("Boyut", sizeStr) : "",
    d.linkTarget ? row("Hedef", d.linkTarget) : "",
    (d.owner || d.group) ? row("Sahip", [d.owner, d.group].filter(Boolean).join(" : ")) : "",
    perms ? row("İzinler", perms) : "",
    d.mtime ? row("Değiştirilme", fmtDate(d.mtime)) : "",
    d.links ? row("Bağlantı sayısı", d.links) : "",
  ].join("");

  let host = $("props-overlay");
  if (!host) {
    host = document.createElement("div");
    host.id = "props-overlay";
    host.className = "app-dialog-overlay";
    document.body.appendChild(host);
  }
  host.innerHTML = `
    <div class="app-dialog props-dialog" role="dialog" aria-modal="true">
      <div class="app-dialog-title"><span class="ad-ico">${ico}</span>${escapeHtml(d.name || item.name)}</div>
      <div class="props-body">${rows || '<div class="props-row">Bilgi alınamadı.</div>'}</div>
      ${d.limited ? '<div class="props-note">Bu bağlantıda (FTP) ayrıntılı bilgi alınamaz.</div>' : ""}
      <div class="app-dialog-actions">
        <button type="button" class="ad-btn primary props-close">Kapat</button>
      </div>
    </div>`;
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add("show"));

  const close = () => {
    host.classList.remove("show");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => { host.hidden = true; host.innerHTML = ""; }, 140);
  };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); } };
  host.querySelector(".props-close").onclick = close;
  host.addEventListener("mousedown", (e) => { if (e.target === host) close(); });
  document.addEventListener("keydown", onKey, true);
  setTimeout(() => host.querySelector(".props-close").focus(), 40);
}
