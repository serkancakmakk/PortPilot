const express = require("express");
const path = require("path");
const fs = require("fs");
const { sessions } = require("../lib/sessions");

const router = express.Router();

const DIST_DIR = path.join(__dirname, "..", "dist");
const APP_EXTS = [".dmg", ".appimage", ".deb", ".rpm", ".pacman", ".exe", ".zip"];

function platformOf(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".dmg") || n.includes("-mac")) return { os: "mac", label: "macOS", icon: "🍎" };
  if (n.endsWith(".exe")) return { os: "win", label: "Windows", icon: "🪟" };
  if (n.endsWith(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm") || n.endsWith(".pacman"))
    return { os: "linux", label: "Linux", icon: "🐧" };
  return { os: "other", label: "Diğer", icon: "💻" };
}

function archOf(name) {
  const n = name.toLowerCase();
  if (n.includes("arm64") || n.includes("aarch64")) return "arm64";
  return "x64";
}

router.get("/api/downloads", (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(DIST_DIR);
  } catch (_) {
    return res.json({ available: false, items: [] });
  }
  const items = files
    .filter((f) => APP_EXTS.includes(path.extname(f).toLowerCase()))
    .map((f) => {
      let size = 0;
      try { size = fs.statSync(path.join(DIST_DIR, f)).size; } catch (_) {}
      const p = platformOf(f);
      return { name: f, size, os: p.os, label: p.label, icon: p.icon, arch: archOf(f), url: "/download-app/" + encodeURIComponent(f) };
    })
    .filter((it) => it.size > 1024 * 100)
    .sort((a, b) => a.os.localeCompare(b.os) || a.name.localeCompare(b.name));
  res.json({ available: items.length > 0, items });
});

router.get("/download-app/:name", (req, res) => {
  const name = path.basename(req.params.name || "");
  if (!APP_EXTS.includes(path.extname(name).toLowerCase()))
    return res.status(400).json({ error: "Geçersiz dosya." });
  const file = path.join(DIST_DIR, name);
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "Dosya bulunamadı." });
  res.download(file, name);
});

router.get("/api/health", (req, res) =>
  res.json({ ok: true, sessions: sessions.size }),
);

module.exports = router;
