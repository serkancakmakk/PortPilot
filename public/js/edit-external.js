// Dış uygulamada düzenle → otomatik geri yükle (yalnızca masaüstü/Electron).
// Uzak dosyayı geçici yere indirir, işletim sisteminin varsayılan uygulamasında
// (VS Code, Sublime, Preview…) açar; dosya her kaydedildiğinde otomatik olarak
// sunucuya geri yüklenir. FileZilla'nın en sevilen özelliği.

import { api } from "./api.js";
import { toast } from "./dom.js";
import { session } from "./state.js";

// id -> { remoteDir, fileName }
const edits = new Map();
let wired = false;

export function isDesktop() {
  return !!(window.desktop && window.desktop.isDesktop && window.desktop.editStart);
}

// ndjson akışını (upload-local) tüketip hata/başarı durumunu döndür
async function consumeUpload(resp) {
  // api() JSON olmayan yanıt için ham Response döndürür
  if (!resp || typeof resp.text !== "function") return { ok: true };
  const text = await resp.text();
  let err = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { const o = JSON.parse(t); if (o.error) err = o.error; } catch (_) {}
  }
  return err ? { ok: false, error: err } : { ok: true };
}

// Bir dosyayı dış uygulamada düzenlemeye başla
export async function openExternalEdit(remotePath) {
  if (!isDesktop()) { toast("Bu özellik yalnızca masaüstü uygulamasında çalışır.", true); return; }
  if (!session) return;
  const fileName = remotePath.split("/").pop() || "dosya";
  const remoteDir = remotePath.slice(0, remotePath.length - fileName.length).replace(/\/$/, "") || "/";
  const url = `${location.origin}/api/download?session=${encodeURIComponent(session)}&path=${encodeURIComponent(remotePath)}`;
  try {
    const r = await window.desktop.editStart({ url, name: fileName });
    if (!r || !r.ok) { toast("Açılamadı: " + ((r && r.error) || "bilinmeyen hata"), true); return; }
    edits.set(r.id, { remoteDir, fileName, remotePath });
    toast(`“${fileName}” dış uygulamada açıldı — kaydettikçe otomatik yüklenecek.`);
  } catch (e) { toast(e.message, true); }
}

// Bir kayıt geldiğinde dosyayı sunucuya geri yükle
async function syncBack(id, localPath) {
  const meta = edits.get(id);
  if (!meta) return;
  try {
    const resp = await api("upload-local", {
      method: "POST",
      json: { localPath, path: meta.remoteDir, conflict: "overwrite" },
    });
    const res = await consumeUpload(resp);
    if (res.ok) {
      toast(`↑ “${meta.fileName}” sunucuya senkronlandı`);
      // Aktif klasör bu dosyanınkiyse listeyi tazele (boyut/tarih güncellensin)
      document.dispatchEvent(new CustomEvent("external-edit-synced", { detail: meta }));
    } else {
      toast(`Senkronlanamadı: ${res.error}`, true);
    }
  } catch (e) { toast("Senkronlanamadı: " + e.message, true); }
}

export function stopAllEdits() {
  edits.clear();
  if (isDesktop() && window.desktop.editStopAll) window.desktop.editStopAll();
}

export function initEditExternal() {
  if (!isDesktop() || wired) return;
  wired = true;
  window.desktop.onEditChange(({ id, localPath }) => syncBack(id, localPath));
}
