const express = require("express");
const { readPrefs, writePrefs } = require("../lib/prefs-store");

const router = express.Router();

// Tüm tercihleri döndür (oturum gerekmez — cihaz/kurulum geneli)
router.get("/api/prefs", (req, res) => {
  res.json({ prefs: readPrefs() });
});

// Gelen anahtarları mevcut tercihlerle birleştir (tek anahtar güncelleme için)
router.patch("/api/prefs", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const prefs = Object.assign(readPrefs(), body);
  if (!writePrefs(prefs))
    return res.status(500).json({ error: "Tercihler kaydedilemedi." });
  res.json({ ok: true, prefs });
});

module.exports = router;
