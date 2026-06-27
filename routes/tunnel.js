const express = require("express");
const { getSession, hasExec } = require("../lib/sessions");
const { logFromSession } = require("../lib/audit");
const tunnels = require("../lib/tunnels");

const router = express.Router();

function token(req) { return req.get("x-session") || req.query.session; }

// ---- Aktif tünelleri listele ----
router.get("/api/tunnel/list", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  res.json({ available: hasExec(s), items: tunnels.listFor(token(req)) });
});

// ---- Yeni tünel aç ----
// body: { localPort?, remoteHost?, remotePort }
router.post("/api/tunnel/open", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s))
    return res.status(400).json({ error: "Tünel yalnızca SFTP (SSH) bağlantılarında çalışır." });
  try {
    // Bağlantının canlı olduğundan emin ol (gerekirse yeniden bağlan)
    if (s.fs.ensureLive) await s.fs.ensureLive();
    const r = await tunnels.open(token(req), () => s.fs.exec, {
      localPort: req.body.localPort,
      remoteHost: req.body.remoteHost,
      remotePort: req.body.remotePort,
    });
    try {
      logFromSession(s, "tunnel-open",
        `localhost:${r.localPort} → ${req.body.remoteHost || "127.0.0.1"}:${req.body.remotePort}`);
    } catch (_) {}
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Tünel kapat ----
router.post("/api/tunnel/close", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const ok = tunnels.closeTunnel(token(req), String(req.body.id || ""));
  res.json({ ok });
});

module.exports = router;
