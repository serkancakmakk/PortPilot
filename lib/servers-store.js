const path = require("path");
const fs = require("fs");

// ---- Hassas alanların şifrelenmesi (OS anahtarlığı / Electron safeStorage) ----
// Parola/özel anahtar/passphrase düz metin yerine işletim sisteminin anahtarlığından
// türetilen anahtarla şifrelenir. Yalnızca masaüstünde (Electron) ve anahtarlık
// kullanılabilirse devreye girer; aksi halde (tarayıcı/node modu) düz metin kalır.
const SENSITIVE = ["password", "privateKey", "passphrase"];
const ENC_PREFIX = "safe:1:";

let _safe = null;
try {
  const e = require("electron"); // node modunda string döner → safeStorage olmaz
  if (e && e.safeStorage) _safe = e.safeStorage;
} catch (_) {}

function encAvailable() {
  try { return !!(_safe && _safe.isEncryptionAvailable()); } catch (_) { return false; }
}

function encField(v) {
  if (typeof v !== "string" || !v) return v;
  if (v.startsWith(ENC_PREFIX)) return v; // zaten şifreli
  if (!encAvailable()) return v;          // anahtarlık yok → düz metin
  try { return ENC_PREFIX + _safe.encryptString(v).toString("base64"); } catch (_) { return v; }
}

function decField(v) {
  if (typeof v !== "string" || !v.startsWith(ENC_PREFIX)) return v;
  if (!encAvailable()) return ""; // şifreliyiz ama çözemiyoruz → boş (kullanıcı yeniden girer)
  try { return _safe.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), "base64")); }
  catch (_) { return ""; }
}

function mapSensitive(arr, fn) {
  return (Array.isArray(arr) ? arr : []).map((s) => {
    if (!s || typeof s !== "object") return s;
    const out = { ...s };
    for (const k of SENSITIVE) if (k in out) out[k] = fn(out[k]);
    return out;
  });
}

// ---- Kayıtlı sunucular (servers.json dosyasında kalıcı) ----
// Masaüstü (Electron) uygulamasında __dirname salt-okunur asar arşivinin içindedir;
// bu yüzden yazılabilir bir veri klasörü (PORTPILOT_DATA_DIR) varsa onu kullan.
const DATA_DIR = process.env.PORTPILOT_DATA_DIR || path.join(__dirname, "..");
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");

// Eski sürümlerden kalan servers.json varsa yeni konuma bir kez taşı/kopyala
(function migrateServers() {
  const legacyDir = path.join(__dirname, "..");
  if (DATA_DIR === legacyDir) return;
  try {
    if (fs.existsSync(SERVERS_FILE)) return;
    const legacy = path.join(legacyDir, "servers.json");
    if (fs.existsSync(legacy)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (_) {}
      fs.copyFileSync(legacy, SERVERS_FILE);
    }
  } catch (_) {}
})();

// Dosyaya yazılı (muhtemelen şifreli) ham kayıtları döndürür.
function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8"));
  } catch (_) {
    return [];
  }
}

function readServers() {
  const raw = readRaw();
  // Geriye dönük migrasyon: anahtarlık varsa ve düz metin hassas alan kaldıysa
  // dosyayı bir kez şifreliye çevir (sessizce, en iyi çaba).
  if (encAvailable()) {
    const hasPlain = raw.some(
      (s) => s && SENSITIVE.some((k) => typeof s[k] === "string" && s[k] && !s[k].startsWith(ENC_PREFIX))
    );
    if (hasPlain) { try { writeRaw(mapSensitive(raw, encField)); } catch (_) {} }
  }
  return mapSensitive(raw, decField); // UI'a/çağırana düz metin ver
}

function writeRaw(arr) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(arr, null, 2));
}

function writeServers(arr) {
  try {
    writeRaw(mapSensitive(arr, encField)); // diske şifreli yaz
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { DATA_DIR, SERVERS_FILE, readServers, writeServers };
