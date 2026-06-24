const path = require("path");
const fs = require("fs");
const { DATA_DIR } = require("./servers-store");

// ---- İşlem / bağlantı günlüğü (audit trail) ----
// Hangi sunucuya ne zaman bağlanıldı, hangi dosya silindi/taşındı/yeniden adlandırıldı
// gibi olayları kalıcı bir JSON dosyasında (audit.json) saklar. En yeni MAX kayıt tutulur.
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const MAX = 1000;

function read() {
  try {
    const arr = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function write(arr) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(arr, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

// Tek bir olayı ekle. En iyi çaba; hata olsa da çağıranı etkilemez.
function logAudit(entry) {
  try {
    const arr = read();
    arr.push({
      time: Date.now(),
      action: String(entry.action || ""),
      host: entry.host || "",
      user: entry.user || "",
      detail: entry.detail || "",
    });
    if (arr.length > MAX) arr.splice(0, arr.length - MAX);
    write(arr);
  } catch (_) {}
}

// Oturum nesnesinden (s.info) host/kullanıcı çıkarıp logla.
function logFromSession(s, action, detail) {
  const info = (s && s.info) || {};
  logAudit({ action, host: info.host || "", user: info.username || "", detail: detail || "" });
}

function readAudit(limit) {
  const arr = read();
  const n = Number.isFinite(limit) ? Math.max(1, Math.min(MAX, limit)) : MAX;
  return arr.slice(-n).reverse(); // en yeni önce
}

function clearAudit() {
  return write([]);
}

module.exports = { AUDIT_FILE, logAudit, logFromSession, readAudit, clearAudit };
