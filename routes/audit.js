const express = require("express");
const { readAudit, clearAudit } = require("../lib/audit");

const router = express.Router();

// ---- İşlem / bağlantı günlüğü ----
router.get("/api/audit", (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit)) limit = 300;
  res.json({ items: readAudit(limit) });
});

router.post("/api/audit/clear", (req, res) => {
  if (!clearAudit()) return res.status(500).json({ error: "Günlük temizlenemedi." });
  res.json({ ok: true });
});

module.exports = router;
