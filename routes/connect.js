const express = require("express");
const crypto = require("crypto");
const { connectRemote } = require("../lib/remote-fs");
const { sessions, closeTunnels } = require("../lib/sessions");
const { logAudit } = require("../lib/audit");

const router = express.Router();

// ---- Bağlantı ----
const PROTOCOLS = { sftp: 22, ftp: 21, ftps: 21 };

router.post("/api/connect", async (req, res) => {
  const { host, port, username, password, privateKey, passphrase } =
    req.body || {};
  const protocol = ((req.body && req.body.protocol) || "sftp").toLowerCase();
  if (!host || !username) {
    return res
      .status(400)
      .json({ error: "Sunucu adresi ve kullanıcı adı zorunlu." });
  }
  if (!(protocol in PROTOCOLS)) {
    return res.status(400).json({ error: "Geçersiz protokol." });
  }
  const portNum = Number(port) || PROTOCOLS[protocol];

  try {
    const remoteFs = await connectRemote({
      host,
      port: portNum,
      username,
      password,
      privateKey,
      passphrase,
      protocol,
    });
    let home = "/";
    try {
      home = await remoteFs.realpath(".");
    } catch (_) {
      home = "/";
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, {
      fs: remoteFs,
      info: { host, port: portNum, username, protocol },
      lastUsed: Date.now(),
    });
    logAudit({ action: "connect", host, user: username, detail: `${protocol}://${host}:${portNum}` });
    res.json({
      session: token,
      home: home || "/",
      info: { host, username, port: portNum, protocol },
    });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bağlanılamadı." });
  }
});

router.post("/api/disconnect", (req, res) => {
  const token = req.get("x-session");
  const s = token && sessions.get(token);
  if (s) {
    closeTunnels(token);
    try {
      s.fs.end();
    } catch (_) {}
    if (s.info) logAudit({ action: "disconnect", host: s.info.host, user: s.info.username });
    sessions.delete(token);
  }
  res.json({ ok: true });
});

module.exports = router;
