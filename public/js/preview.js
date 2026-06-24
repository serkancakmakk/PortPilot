// Dosya önizleme: resim ve PDF'i indirmeden pencere içinde gösterir.
import { $, escapeHtml, toast } from "./dom.js";
import { session } from "./state.js";

const IMG = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
const PDF = ["pdf"];

function ext(name) { return name.includes(".") ? name.split(".").pop().toLowerCase() : ""; }

export function isPreviewable(name) {
  const e = ext(name);
  return IMG.includes(e) || PDF.includes(e);
}

export async function previewFile(item, full) {
  const e = ext(item.name);
  let url;
  try {
    const res = await fetch("/api/download?path=" + encodeURIComponent(full), {
      headers: session ? { "x-session": session } : {},
    });
    if (!res.ok) throw new Error("Önizleme alınamadı (HTTP " + res.status + ")");
    url = URL.createObjectURL(await res.blob());
  } catch (err) { toast(err.message || "Önizleme başarısız", true); return; }

  let ov = $("preview");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "preview";
    ov.className = "sr-overlay";
    document.body.appendChild(ov);
  }
  const inner = IMG.includes(e)
    ? `<img src="${url}" class="pv-img" alt="" />`
    : `<iframe src="${url}" class="pv-frame" title="önizleme"></iframe>`;
  ov.innerHTML = `<div class="sr-box pv-box">
    <div class="sr-head"><b>${escapeHtml(item.name)}</b>
      <span style="flex:1"></span>
      <a href="${url}" download="${escapeHtml(item.name)}" class="btn btn-sm tbtn">İndir</a>
      <button type="button" class="sr-close" title="Kapat">✕</button>
    </div>
    <div class="pv-body">${inner}</div>
  </div>`;
  ov.hidden = false;
  const close = () => { ov.hidden = true; try { URL.revokeObjectURL(url); } catch (_) {} };
  ov.querySelector(".sr-close").onclick = close;
  ov.onclick = (ev) => { if (ev.target === ov) close(); };
}
