const express = require("express");
const { readPrefs, writePrefs } = require("../lib/prefs-store");
const { DEFAULT_IDLE_TIMEOUT_MIN, MAX_IDLE_TIMEOUT_MIN } = require("../lib/sessions");

const router = express.Router();

function cleanSessionPrefs(input) {
  const src = input && typeof input === "object" ? input : {};
  const n = Number(src.idleTimeoutMin);
  const idleTimeoutMin = Number.isFinite(n)
    ? Math.max(0, Math.min(MAX_IDLE_TIMEOUT_MIN, Math.round(n)))
    : DEFAULT_IDLE_TIMEOUT_MIN;
  const mode = src.autoConnectMode === "first" ? "first" : "last";
  const lastConnectedServerId = src.lastConnectedServerId == null
    ? ""
    : String(src.lastConnectedServerId).slice(0, 120);
  return {
    idleTimeoutMin,
    restoreOpenSessions: src.restoreOpenSessions !== false,
    autoConnectSavedServer: src.autoConnectSavedServer === true,
    autoConnectMode: mode,
    lastConnectedServerId,
  };
}

// Tüm tercihleri döndür (oturum gerekmez — cihaz/kurulum geneli)
router.get("/api/prefs", (req, res) => {
  const prefs = readPrefs();
  res.json({ prefs: { ...prefs, session: cleanSessionPrefs(prefs.session) } });
});

// Gelen anahtarları mevcut tercihlerle birleştir (tek anahtar güncelleme için)
router.patch("/api/prefs", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const prefs = Object.assign(readPrefs(), body);
  if (body.session && typeof body.session === "object") {
    prefs.session = cleanSessionPrefs({ ...(readPrefs().session || {}), ...body.session });
  }
  if (!writePrefs(prefs))
    return res.status(500).json({ error: "Tercihler kaydedilemedi." });
  res.json({ ok: true, prefs: { ...prefs, session: cleanSessionPrefs(prefs.session) } });
});

module.exports = router;
