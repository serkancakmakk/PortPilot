const express = require("express");
const crypto = require("crypto");
const { readPrefs, writePrefs } = require("../lib/prefs-store");

const router = express.Router();

// ---- Uygulama kilidi (master parola) ----
// Parola düz metin saklanmaz; scrypt ile (rastgele tuz) hash'lenir ve prefs.json'da
// { appLock: { salt, hash, autoLockMin } } olarak tutulur. Kilit, yerel arayüze
// erişim için bir kapıdır (cihaz/kurulum geneli; oturum gerekmez).

function hashPw(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

function getLock() {
  const p = readPrefs();
  return p.appLock && typeof p.appLock === "object" ? p.appLock : null;
}

function saveLock(lock) {
  const prefs = readPrefs();
  if (lock) prefs.appLock = lock;
  else delete prefs.appLock;
  return writePrefs(prefs);
}

// Sabit-zamanlı karşılaştırma (timing sızıntısını önle)
function verifyPw(lock, password) {
  if (!lock || !lock.salt || !lock.hash) return false;
  const calc = hashPw(password, lock.salt);
  const a = Buffer.from(calc, "hex");
  const b = Buffer.from(lock.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Kilit etkin mi?
router.get("/api/lock/status", (_req, res) => {
  const lock = getLock();
  res.json({ enabled: !!lock, autoLockMin: (lock && lock.autoLockMin) || 0 });
});

// Parolayı doğrula (kilidi aç)
router.post("/api/lock/verify", (req, res) => {
  const lock = getLock();
  if (!lock) return res.json({ ok: true }); // kilit yoksa zaten açık
  const ok = verifyPw(lock, req.body && req.body.password);
  res.json({ ok });
});

// Kilit kur veya parolayı değiştir.
// İlk kez kuruyorsa current gerekmez; etkinse mevcut parola (current) doğru olmalı.
router.post("/api/lock/set", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const next = String(body.password || "");
  if (next.length < 4) return res.status(400).json({ error: "Parola en az 4 karakter olmalı." });
  const lock = getLock();
  if (lock && !verifyPw(lock, body.current))
    return res.status(403).json({ error: "Mevcut parola yanlış." });
  const salt = crypto.randomBytes(16).toString("hex");
  const autoLockMin = Number.isFinite(+body.autoLockMin) ? Math.max(0, Math.min(240, +body.autoLockMin)) : (lock && lock.autoLockMin) || 0;
  if (!saveLock({ salt, hash: hashPw(next, salt), autoLockMin }))
    return res.status(500).json({ error: "Kilit kaydedilemedi." });
  res.json({ ok: true });
});

// Otomatik kilit süresini güncelle (parola değiştirmeden)
router.post("/api/lock/autolock", (req, res) => {
  const lock = getLock();
  if (!lock) return res.status(400).json({ error: "Önce kilit kurun." });
  const min = Number.isFinite(+(req.body && req.body.autoLockMin)) ? Math.max(0, Math.min(240, +req.body.autoLockMin)) : 0;
  if (!saveLock({ ...lock, autoLockMin: min }))
    return res.status(500).json({ error: "Kaydedilemedi." });
  res.json({ ok: true, autoLockMin: min });
});

// Kilidi kaldır (mevcut parola doğrulanmalı)
router.post("/api/lock/disable", (req, res) => {
  const lock = getLock();
  if (!lock) return res.json({ ok: true });
  if (!verifyPw(lock, req.body && req.body.current))
    return res.status(403).json({ error: "Parola yanlış." });
  if (!saveLock(null)) return res.status(500).json({ error: "Kaldırılamadı." });
  res.json({ ok: true });
});

module.exports = router;
