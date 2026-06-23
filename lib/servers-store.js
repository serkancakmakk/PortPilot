const path = require("path");
const fs = require("fs");

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

function readServers() {
  try {
    return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8"));
  } catch (_) {
    return [];
  }
}

function writeServers(arr) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(arr, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { DATA_DIR, SERVERS_FILE, readServers, writeServers };
