const path = require("path");
const fs = require("fs");
const { DATA_DIR } = require("./servers-store");

// ---- Kullanıcı tercihleri (prefs.json dosyasında kalıcı) ----
// Favoriler gibi tercihler eskiden tarayıcı localStorage'ında tutuluyordu; ancak
// Electron her açılışta rastgele bir port seçtiğinden (origin değişir) ve güncelleme
// localStorage'ı sıfırlayabildiğinden veriler kayboluyordu. Bunları kayıtlı
// sunucularla aynı yazılabilir veri klasöründe (PORTPILOT_DATA_DIR) saklıyoruz.
const PREFS_FILE = path.join(DATA_DIR, "prefs.json");

function readPrefs() {
  try {
    const obj = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
    return obj && typeof obj === "object" ? obj : {};
  } catch (_) {
    return {};
  }
}

function writePrefs(obj) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(obj, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { PREFS_FILE, readPrefs, writePrefs };
