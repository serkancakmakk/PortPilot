const express = require("express");
const { readServers, writeServers } = require("../lib/servers-store");

const router = express.Router();

router.get("/api/servers", (req, res) => {
  res.json({ servers: readServers() });
});

router.post("/api/servers", (req, res) => {
  const b = req.body || {};
  if (!b.host || !b.username)
    return res.status(400).json({ error: "host ve username gerekli." });
  const servers = readServers();
  const protocol = (b.protocol || "sftp").toLowerCase();
  const server = {
    id: b.id || Date.now().toString(36),
    name: b.name || `${b.username}@${b.host}`,
    host: b.host,
    port: b.port || (protocol === "sftp" ? 22 : 21),
    username: b.username,
    protocol: ["sftp", "ftp", "ftps"].includes(protocol) ? protocol : "sftp",
    auth: b.auth === "key" ? "key" : "password",
    password: b.password || "",
    privateKey: b.privateKey || "",
    passphrase: b.passphrase || "",
    group: (b.group || "").toString().trim(),
  };
  // Atlama sunucusu (jump) — yalnızca SFTP ve host+kullanıcı doluysa
  if (server.protocol === "sftp" && b.jump && b.jump.host && b.jump.username) {
    server.jump = {
      host: b.jump.host,
      port: Number(b.jump.port) || 22,
      username: b.jump.username,
      password: b.jump.password || "",
      privateKey: b.jump.privateKey || "",
      passphrase: b.jump.passphrase || "",
    };
  }
  const idx = servers.findIndex(
    (s) =>
      s.host === server.host &&
      s.username === server.username &&
      String(s.port) === String(server.port),
  );
  if (idx >= 0) {
    server.id = servers[idx].id;
    servers[idx] = server;
  } else {
    servers.push(server);
  }
  if (!writeServers(servers))
    return res.status(500).json({ error: "Kaydedilemedi." });
  res.json({ ok: true, servers });
});

router.delete("/api/servers/:id", (req, res) => {
  const servers = readServers().filter((s) => s.id !== req.params.id);
  if (!writeServers(servers))
    return res.status(500).json({ error: "Silinemedi." });
  res.json({ ok: true, servers });
});

// Toplu silme: { ids: [...] } | { group: "..." } | { all: true }
router.post("/api/servers/bulk-delete", (req, res) => {
  const b = req.body || {};
  let servers = readServers();
  if (b.all) {
    servers = [];
  } else if (Array.isArray(b.ids) && b.ids.length) {
    const del = new Set(b.ids.map(String));
    servers = servers.filter((s) => !del.has(String(s.id)));
  } else if (typeof b.group === "string") {
    const g = b.group.trim();
    servers = servers.filter((s) => (s.group || "").trim() !== g);
  } else {
    return res.status(400).json({ error: "Silinecek öğe belirtilmedi." });
  }
  if (!writeServers(servers))
    return res.status(500).json({ error: "Silinemedi." });
  res.json({ ok: true, servers });
});

module.exports = router;
