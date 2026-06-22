const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { Client } = require("ssh2");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage() });

// token -> { conn, sftp, info, lastUsed }
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 dk boşta kalma

// Boşta kalan oturumları temizle
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL) {
      try { s.conn.end(); } catch (_) {}
      sessions.delete(token);
    }
  }
}, 60 * 1000).unref();

function getSession(req, res) {
  const token = req.get("x-session") || req.query.session;
  const s = token && sessions.get(token);
  if (!s) {
    res.status(401).json({ error: "Oturum bulunamadı veya süresi doldu. Yeniden bağlanın." });
    return null;
  }
  s.lastUsed = Date.now();
  return s;
}

// POSIX yol birleştirme/normalleştirme (uzak sunucu Unix kabul edilir)
function resolveRemote(base, target) {
  const joined = target && target.startsWith("/")
    ? target
    : path.posix.join(base || "/", target || "");
  return path.posix.normalize(joined) || "/";
}

// ---- Bağlantı ----
app.post("/api/connect", (req, res) => {
  const { host, port, username, password, privateKey, passphrase } = req.body || {};
  if (!host || !username) {
    return res.status(400).json({ error: "Sunucu adresi ve kullanıcı adı zorunlu." });
  }

  const conn = new Client();
  let settled = false;
  const fail = (msg) => {
    if (settled) return;
    settled = true;
    try { conn.end(); } catch (_) {}
    res.status(400).json({ error: msg });
  };

  conn.on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) return fail("SFTP başlatılamadı: " + err.message);
      sftp.realpath(".", (e, home) => {
        const token = crypto.randomBytes(24).toString("hex");
        sessions.set(token, {
          conn, sftp,
          info: { host, port: port || 22, username },
          lastUsed: Date.now(),
        });
        settled = true;
        res.json({ session: token, home: e ? "/" : home, info: { host, username, port: Number(port) || 22 } });
      });
    });
  });

  conn.on("error", (err) => fail("Bağlantı hatası: " + err.message));

  const cfg = {
    host,
    port: Number(port) || 22,
    username,
    readyTimeout: 20000,
  };
  if (privateKey && privateKey.trim()) {
    cfg.privateKey = privateKey;
    if (passphrase) cfg.passphrase = passphrase;
  } else {
    cfg.password = password || "";
  }

  try {
    conn.connect(cfg);
  } catch (e) {
    fail("Bağlantı kurulamadı: " + e.message);
  }
});

app.post("/api/disconnect", (req, res) => {
  const token = req.get("x-session");
  const s = token && sessions.get(token);
  if (s) {
    try { s.conn.end(); } catch (_) {}
    sessions.delete(token);
  }
  res.json({ ok: true });
});

// ---- Dizin listele ----
app.get("/api/list", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.query.path || "/");
  s.sftp.readdir(dir, (err, list) => {
    if (err) return res.status(400).json({ error: "Klasör okunamadı: " + err.message });
    const items = list.map((it) => {
      const attrs = it.attrs;
      const isDir = (attrs.mode & 0o170000) === 0o040000;
      const isLink = (attrs.mode & 0o170000) === 0o120000;
      return {
        name: it.filename,
        type: isDir ? "dir" : isLink ? "link" : "file",
        size: attrs.size,
        mtime: attrs.mtime * 1000,
        mode: attrs.mode & 0o777,
      };
    }).sort((a, b) => {
      if ((a.type === "dir") !== (b.type === "dir")) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "tr");
    });
    res.json({ path: dir, items });
  });
});

// ---- İndir ----
app.get("/api/download", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.query.path);
  if (!req.query.path) return res.status(400).json({ error: "Dosya yolu gerekli." });
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(path.posix.basename(file))}"`
  );
  const stream = s.sftp.createReadStream(file);
  stream.on("error", (err) => {
    if (!res.headersSent) res.status(400).json({ error: "İndirilemedi: " + err.message });
    else res.destroy();
  });
  stream.pipe(res);
});

function shQuote(p) { return "'" + String(p).replace(/'/g, "'\\''") + "'"; }

// ---- Docker yönetimi ----
function dockerExec(s, cmd, cb) {
  s.conn.exec(cmd, (err, stream) => {
    if (err) return cb(err);
    let out = "", errout = "";
    stream.on("data", (d) => { out += d; });
    stream.stderr.on("data", (d) => { errout += d; });
    stream.on("close", (code) => cb(null, { code, out, errout }));
  });
}
function parseJsonLines(out) {
  return out.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
    .filter(Boolean);
}
// Docker'dan gelen kimlikler için güvenli desen (komut enjeksiyonunu önle)
const SAFE_ID = /^[a-zA-Z0-9_.:\/@\-]+$/;
function dockerUnavailable(r) {
  const t = (r.errout + r.out).toLowerCase();
  return r.code !== 0 && (t.includes("command not found") || t.includes("not found") ||
    t.includes("cannot connect") || t.includes("permission denied") || t.includes("docker daemon"));
}

// Konteyner listesi
app.get("/api/docker/ps", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker ps -a --no-trunc --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r)) return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const containers = parseJsonLines(r.out).map((c) => ({
      id: c.ID, name: c.Names, image: c.Image, status: c.Status,
      state: c.State || (/^up/i.test(c.Status) ? "running" : "exited"),
      ports: c.Ports || "", created: c.CreatedAt || c.RunningFor || "",
    }));
    res.json({ available: true, containers });
  });
});

// Görüntü (image) listesi
app.get("/api/docker/images", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker images --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r)) return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const images = parseJsonLines(r.out).map((i) => ({
      id: i.ID, repo: i.Repository, tag: i.Tag, size: i.Size, created: i.CreatedSince || i.CreatedAt || "",
    }));
    res.json({ available: true, images });
  });
});

// Konteyner logları
app.get("/api/docker/logs", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const id = req.query.id;
  if (!id || !SAFE_ID.test(id)) return res.status(400).json({ error: "Geçersiz kimlik." });
  dockerExec(s, `docker logs --tail 400 --timestamps ${shQuote(id)} 2>&1`, (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ logs: r.out || "(log yok)" });
  });
});

// Eylem: start/stop/restart/rm/pause/unpause/kill/rmi
const CONTAINER_ACTIONS = { start: "start", stop: "stop", restart: "restart", pause: "pause", unpause: "unpause", kill: "kill", rm: "rm -f" };
app.post("/api/docker/action", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { type, id, action } = req.body || {};
  if (!id || !SAFE_ID.test(id)) return res.status(400).json({ error: "Geçersiz kimlik." });
  let cmd;
  if (type === "image") {
    if (action !== "rmi") return res.status(400).json({ error: "Geçersiz işlem." });
    cmd = `docker rmi ${shQuote(id)}`;
  } else {
    const sub = CONTAINER_ACTIONS[action];
    if (!sub) return res.status(400).json({ error: "Geçersiz işlem." });
    cmd = `docker ${sub} ${shQuote(id)}`;
  }
  dockerExec(s, cmd + " 2>&1", (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    if (r.code !== 0) return res.status(400).json({ error: (r.out || r.errout || "İşlem başarısız").trim() });
    res.json({ ok: true, output: r.out.trim() });
  });
});

// ---- Klasörü .tar.gz olarak indir ----
app.get("/api/download-folder", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!req.query.path) return res.status(400).json({ error: "Klasör yolu gerekli." });
  const dir = resolveRemote("/", req.query.path);
  const parent = path.posix.dirname(dir);
  const base = path.posix.basename(dir) || "kok";
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(base)}.tar.gz"`);
  s.conn.exec(`tar czf - -C ${shQuote(parent)} ${shQuote(base)}`, (err, stream) => {
    if (err) {
      if (!res.headersSent) res.status(400).json({ error: "İndirilemedi: " + err.message });
      return;
    }
    stream.stderr.resume(); // tar uyarılarını yut
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
});

// ---- Birden çok öğeyi tek .tar.gz olarak indir ----
app.get("/api/download-multi", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.query.dir || "/");
  let names = req.query.name;
  if (!names) return res.status(400).json({ error: "Öğe seçilmedi." });
  if (!Array.isArray(names)) names = [names];
  names = names.filter((n) => n && !n.includes("/")); // güvenlik
  if (!names.length) return res.status(400).json({ error: "Geçersiz seçim." });
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="secilenler.tar.gz"`);
  const args = names.map(shQuote).join(" ");
  s.conn.exec(`tar czf - -C ${shQuote(dir)} ${args}`, (err, stream) => {
    if (err) {
      if (!res.headersSent) res.status(400).json({ error: "İndirilemedi: " + err.message });
      return;
    }
    stream.stderr.resume();
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
});

// ---- Disk doluluk oranı (df komutuyla) ----
app.get("/api/disk", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.query.path || "/");
  s.conn.exec("df -Pk " + shQuote(dir), (err, stream) => {
    if (err) return res.json({ available: false });
    let out = "";
    stream.on("data", (d) => { out += d; });
    stream.stderr.on("data", () => {});
    stream.on("close", () => {
      const lines = out.trim().split("\n");
      if (lines.length < 2) return res.json({ available: false });
      const p = lines[lines.length - 1].trim().split(/\s+/);
      const totalK = Number(p[1]), usedK = Number(p[2]), availK = Number(p[3]);
      if (!totalK || isNaN(totalK)) return res.json({ available: false });
      res.json({
        available: true,
        total: totalK * 1024,
        used: usedK * 1024,
        avail: availK * 1024,
        percent: Math.round((usedK / totalK) * 100),
      });
    });
  });
});

// ---- Dosya içeriğini oku (düzenleme için) ----
const MAX_EDIT_SIZE = 5 * 1024 * 1024; // 5 MB
app.get("/api/read", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.query.path);
  if (!req.query.path) return res.status(400).json({ error: "Dosya yolu gerekli." });
  s.sftp.stat(file, (err, st) => {
    if (err) return res.status(400).json({ error: "Dosya bulunamadı: " + err.message });
    if (st.size > MAX_EDIT_SIZE) {
      return res.status(413).json({ error: "Dosya 5 MB'tan büyük, düzenleyici açamaz. İndirerek açın." });
    }
    s.sftp.readFile(file, (e, buf) => {
      if (e) return res.status(400).json({ error: "Okunamadı: " + e.message });
      // İkili (binary) dosya mı? NUL baytı içeriyorsa metin olarak açma
      const sample = buf.subarray(0, 8000);
      if (sample.includes(0)) {
        return res.status(415).json({ error: "Bu bir metin dosyası değil (ikili içerik). İndirerek açın." });
      }
      res.json({ path: file, content: buf.toString("utf8"), size: st.size });
    });
  });
});

// ---- Dosya içeriğini kaydet ----
app.post("/api/save", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.body.path);
  if (!req.body.path) return res.status(400).json({ error: "Dosya yolu gerekli." });
  if (typeof req.body.content !== "string") return res.status(400).json({ error: "İçerik geçersiz." });
  s.sftp.writeFile(file, Buffer.from(req.body.content, "utf8"), (err) => {
    if (err) return res.status(400).json({ error: "Kaydedilemedi: " + err.message });
    res.json({ ok: true });
  });
});

// ---- Yükle ----
app.post("/api/upload", upload.array("files"), (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.body.path || "/");
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "Dosya seçilmedi." });

  let pending = files.length;
  let failed = null;
  files.forEach((f) => {
    const dest = path.posix.join(dir, f.originalname);
    const ws = s.sftp.createWriteStream(dest);
    ws.on("error", (err) => { failed = failed || err.message; done(); });
    ws.on("close", done);
    ws.end(f.buffer);
  });
  function done() {
    if (--pending === 0) {
      if (failed) res.status(400).json({ error: "Yükleme hatası: " + failed });
      else res.json({ ok: true, count: files.length });
    }
  }
});

// ---- Yeni klasör ----
app.post("/api/mkdir", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.body.path);
  const name = req.body.name;
  if (!name) return res.status(400).json({ error: "Klasör adı gerekli." });
  s.sftp.mkdir(path.posix.join(dir, name), (err) => {
    if (err) return res.status(400).json({ error: "Klasör oluşturulamadı: " + err.message });
    res.json({ ok: true });
  });
});

// ---- Yeniden adlandır / taşı ----
app.post("/api/rename", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const from = resolveRemote("/", req.body.from);
  const to = resolveRemote("/", req.body.to);
  if (!req.body.from || !req.body.to) return res.status(400).json({ error: "Kaynak ve hedef gerekli." });
  s.sftp.rename(from, to, (err) => {
    if (err) return res.status(400).json({ error: "İşlem başarısız: " + err.message });
    res.json({ ok: true });
  });
});

// ---- Sil ----
app.post("/api/delete", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const target = resolveRemote("/", req.body.path);
  const type = req.body.type;
  if (!req.body.path) return res.status(400).json({ error: "Yol gerekli." });

  if (type === "dir") {
    rmdirRecursive(s.sftp, target, (err) => {
      if (err) return res.status(400).json({ error: "Klasör silinemedi: " + err.message });
      res.json({ ok: true });
    });
  } else {
    s.sftp.unlink(target, (err) => {
      if (err) return res.status(400).json({ error: "Silinemedi: " + err.message });
      res.json({ ok: true });
    });
  }
});

// Klasörü içeriğiyle birlikte özyinelemeli sil
function rmdirRecursive(sftp, dir, cb) {
  sftp.readdir(dir, (err, list) => {
    if (err) return cb(err);
    let pending = list.length;
    if (pending === 0) return sftp.rmdir(dir, cb);
    let done = false;
    const finish = (e) => {
      if (done) return;
      if (e) { done = true; return cb(e); }
      if (--pending === 0) { done = true; sftp.rmdir(dir, cb); }
    };
    list.forEach((it) => {
      const full = path.posix.join(dir, it.filename);
      const isDir = (it.attrs.mode & 0o170000) === 0o040000;
      if (isDir) rmdirRecursive(sftp, full, finish);
      else sftp.unlink(full, finish);
    });
  });
}

// ---- Kayıtlı sunucular (servers.json dosyasında kalıcı) ----
const SERVERS_FILE = path.join(__dirname, "servers.json");
function readServers() {
  try { return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8")); }
  catch (_) { return []; }
}
function writeServers(arr) {
  try { fs.writeFileSync(SERVERS_FILE, JSON.stringify(arr, null, 2)); return true; }
  catch (_) { return false; }
}

app.get("/api/servers", (req, res) => {
  res.json({ servers: readServers() });
});

app.post("/api/servers", (req, res) => {
  const b = req.body || {};
  if (!b.host || !b.username) return res.status(400).json({ error: "host ve username gerekli." });
  const servers = readServers();
  const server = {
    id: b.id || Date.now().toString(36),
    name: b.name || `${b.username}@${b.host}`,
    host: b.host, port: b.port || 22, username: b.username,
    auth: b.auth === "key" ? "key" : "password",
    password: b.password || "",
    privateKey: b.privateKey || "",
    passphrase: b.passphrase || "",
  };
  const idx = servers.findIndex(
    (s) => s.host === server.host && s.username === server.username && String(s.port) === String(server.port)
  );
  if (idx >= 0) { server.id = servers[idx].id; servers[idx] = server; }
  else servers.push(server);
  if (!writeServers(servers)) return res.status(500).json({ error: "Kaydedilemedi." });
  res.json({ ok: true, servers });
});

app.delete("/api/servers/:id", (req, res) => {
  const servers = readServers().filter((s) => s.id !== req.params.id);
  if (!writeServers(servers)) return res.status(500).json({ error: "Silinemedi." });
  res.json({ ok: true, servers });
});

app.get("/api/health", (req, res) => res.json({ ok: true, sessions: sessions.size }));

app.listen(PORT, () => {
  console.log(`\n  SFTP Explorer çalışıyor →  http://localhost:${PORT}\n`);
});
