// İşlem / bağlantı günlüğü (audit trail) — sunucudaki audit.json'ı gösterir.
import { $, escapeHtml, toast, showLoading } from "./dom.js";
import { api } from "./api.js";
import { confirmDialog } from "./dialog.js";

const META = {
  connect:        { ico: "🔌", label: "Bağlandı",            cls: "ok" },
  disconnect:     { ico: "🔌", label: "Bağlantı kesildi",    cls: "" },
  delete:         { ico: "🗑", label: "Silindi",             cls: "danger" },
  rename:         { ico: "✏", label: "Yeniden adlandırıldı", cls: "" },
  "rename-batch": { ico: "✏", label: "Toplu adlandırma",     cls: "" },
  move:           { ico: "✂", label: "Taşındı",              cls: "" },
  copy:           { ico: "📋", label: "Kopyalandı",          cls: "" },
  archive:        { ico: "🗜", label: "Arşivlendi",          cls: "" },
  extract:        { ico: "📦", label: "Çıkarıldı",           cls: "" },
  transfer:       { ico: "➡", label: "Sunucuya aktarıldı",   cls: "" },
  chown:          { ico: "🔒", label: "Sahiplik değişti",    cls: "" },
};

function fmt(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function load() {
  $("audit-status").textContent = "";
  $("audit-body").innerHTML = `<div class="dk-msg">Yükleniyor…</div>`;
  let data;
  try { data = await api("audit?limit=500"); }
  catch (e) { $("audit-body").innerHTML = `<div class="dk-msg">Hata: ${escapeHtml(e.message)}</div>`; return; }
  const items = (data && data.items) || [];
  if (!items.length) {
    $("audit-body").innerHTML = `<div class="dk-msg">Henüz kayıt yok.<br><br><span class="dk-sub">Bağlantılar ve dosya işlemleri (sil/taşı/kopyala/yeniden adlandır/arşivle/aktar) burada listelenir.</span></div>`;
    return;
  }
  const rows = items.map((it) => {
    const m = META[it.action] || { ico: "•", label: it.action, cls: "" };
    return `<tr>
      <td class="aud-time">${escapeHtml(fmt(it.time))}</td>
      <td><span class="aud-act ${m.cls}">${m.ico} ${escapeHtml(m.label)}</span></td>
      <td class="aud-host">${escapeHtml(it.user ? it.user + "@" : "")}${escapeHtml(it.host || "—")}</td>
      <td class="aud-detail">${escapeHtml(it.detail || "")}</td>
    </tr>`;
  }).join("");
  $("audit-body").innerHTML = `<table class="table sys-table aud-table">
    <thead><tr><th>Zaman</th><th>İşlem</th><th>Sunucu</th><th>Ayrıntı</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  $("audit-status").textContent = items.length + " kayıt";
}

async function clearLog() {
  if (!(await confirmDialog("Tüm işlem günlüğü kalıcı olarak silinsin mi?", { title: "Günlüğü Temizle", okText: "Temizle", danger: true }))) return;
  showLoading(true);
  try { await api("audit/clear", { method: "POST" }); toast("Günlük temizlendi"); load(); }
  catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

export function initAudit() {
  const btn = $("btn-audit");
  if (btn) btn.addEventListener("click", () => { $("audit-panel").hidden = false; load(); });
  if ($("audit-close")) $("audit-close").addEventListener("click", () => { $("audit-panel").hidden = true; });
  if ($("audit-refresh")) $("audit-refresh").addEventListener("click", load);
  if ($("audit-clear")) $("audit-clear").addEventListener("click", clearLog);
}
