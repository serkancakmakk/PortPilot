const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { connectRemote } = require("./lib/remote-fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Yüklemeler diske (geçici klasöre) akıtılır; tüm dosyalar RAM'e doldurulmaz.
// Böylece büyük dosyalar ve klasörler bellek şişirmeden yüklenir.
const UPLOAD_TMP = path.join(os.tmpdir(), "portpilot-uploads");
try {
  fs.mkdirSync(UPLOAD_TMP, { recursive: true });
} catch (_) {}
const upload = multer({ dest: UPLOAD_TMP });

// Aynı anda kaç dosya yüklensin (SFTP'de gerçek paralellik, FTP'de güvenli sıra)
const UPLOAD_CONCURRENCY = 4;

// Bir listeyi sınırlı eşzamanlılıkla işler; toplanan hataları döndürür.
async function runPool(items, limit, worker) {
  const errors = [];
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          await worker(items[idx]);
        } catch (e) {
          errors.push({ item: items[idx], error: e });
        }
      }
    },
  );
  await Promise.all(workers);
  return errors;
}

// token -> { fs, info, lastUsed }  (fs: protokolden bağımsız uzak dosya sistemi)
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 dk boşta kalma

// Boşta kalan oturumları temizle
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL) {
      try {
        s.fs.end();
      } catch (_) {}
      sessions.delete(token);
    }
  }
}, 60 * 1000).unref();

function getSession(req, res) {
  const token = req.get("x-session") || req.query.session;
  const s = token && sessions.get(token);
  if (!s) {
    res
      .status(401)
      .json({
        error: "Oturum bulunamadı veya süresi doldu. Yeniden bağlanın.",
      });
    return null;
  }
  s.lastUsed = Date.now();
  return s;
}

// POSIX yol birleştirme/normalleştirme (uzak sunucu Unix kabul edilir)
function resolveRemote(base, target) {
  const joined =
    target && target.startsWith("/")
      ? target
      : path.posix.join(base || "/", target || "");
  return path.posix.normalize(joined) || "/";
}

// ---- Bağlantı ----
const PROTOCOLS = { sftp: 22, ftp: 21, ftps: 21 };
app.post("/api/connect", async (req, res) => {
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
    res.json({
      session: token,
      home: home || "/",
      info: { host, username, port: portNum, protocol },
    });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bağlanılamadı." });
  }
});

app.post("/api/disconnect", (req, res) => {
  const token = req.get("x-session");
  const s = token && sessions.get(token);
  if (s) {
    try {
      s.fs.end();
    } catch (_) {}
    sessions.delete(token);
  }
  res.json({ ok: true });
});

// ---- Dizin listele ----
app.get("/api/list", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.query.path || "/");
  try {
    const items = (await s.fs.list(dir)).sort((a, b) => {
      if ((a.type === "dir") !== (b.type === "dir"))
        return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "tr");
    });
    res.json({ path: dir, items });
  } catch (err) {
    res.status(400).json({ error: "Klasör okunamadı: " + err.message });
  }
});

// ---- İndir ----
app.get("/api/download", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.query.path);
  if (!req.query.path)
    return res.status(400).json({ error: "Dosya yolu gerekli." });
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(path.posix.basename(file))}"`,
  );
  try {
    await s.fs.downloadTo(res, file);
  } catch (err) {
    if (!res.headersSent)
      res.status(400).json({ error: "İndirilemedi: " + err.message });
    else res.destroy();
  }
});

function shQuote(p) {
  return "'" + String(p).replace(/'/g, "'\\''") + "'";
}

// ---- Docker yönetimi ----
// FTP/FTPS oturumlarında komut çalıştırma (SSH exec) yoktur
function hasExec(s) {
  return !!(s.fs && s.fs.exec);
}
function dockerExec(s, cmd, cb) {
  if (!hasExec(s))
    return cb(new Error("Bu protokolde (FTP) komut çalıştırılamaz."));
  s.fs.exec.exec(cmd, (err, stream) => {
    if (err) return cb(err);
    let out = "",
      errout = "";
    stream.on("data", (d) => {
      out += d;
    });
    stream.stderr.on("data", (d) => {
      errout += d;
    });
    stream.on("close", (code) => cb(null, { code, out, errout }));
  });
}
function parseJsonLines(out) {
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}
// Docker'dan gelen kimlikler için güvenli desen (komut enjeksiyonunu önle)
const SAFE_ID = /^[a-zA-Z0-9_.:\/@\-]+$/;
function dockerUnavailable(r) {
  const t = (r.errout + r.out).toLowerCase();
  return (
    r.code !== 0 &&
    (t.includes("command not found") ||
      t.includes("not found") ||
      t.includes("cannot connect") ||
      t.includes("permission denied") ||
      t.includes("docker daemon"))
  );
}

// Konteyner listesi
app.get("/api/docker/ps", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker ps -a --no-trunc --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({
        available: false,
        error: (r.errout || "Docker bulunamadı").trim(),
      });
    const containers = parseJsonLines(r.out).map((c) => ({
      id: c.ID,
      name: c.Names,
      image: c.Image,
      status: c.Status,
      state: c.State || (/^up/i.test(c.Status) ? "running" : "exited"),
      ports: c.Ports || "",
      created: c.CreatedAt || c.RunningFor || "",
    }));
    res.json({ available: true, containers });
  });
});

// Konteyner canlı kaynak kullanımı (CPU / RAM / ağ / disk I/O)
app.get("/api/docker/stats", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(
    s,
    "docker stats --no-stream --no-trunc --format '{{json .}}'",
    (err, r) => {
      if (err) return res.json({ available: false, error: err.message });
      if (dockerUnavailable(r))
        return res.json({
          available: false,
          error: (r.errout || "Docker bulunamadı").trim(),
        });
      const stats = parseJsonLines(r.out).map((x) => ({
        id: x.ID,
        name: x.Name,
        cpu: x.CPUPerc || "",
        mem: x.MemUsage || "",
        memPerc: x.MemPerc || "",
        netIO: x.NetIO || "",
        blockIO: x.BlockIO || "",
        pids: x.PIDs || "",
      }));
      res.json({ available: true, stats });
    },
  );
});

// Boşta/eski konteynerler: docker inspect ile detaylı bilgi + son hareket zamanı
app.get("/api/docker/idle", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  // Tüm konteynerleri tek seferde incele (boşsa xargs -r çalıştırmaz)
  const cmd =
    "docker ps -aq --no-trunc | xargs -r docker inspect --format '{{json .}}'";
  dockerExec(s, cmd, (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({
        available: false,
        error: (r.errout || "Docker bulunamadı").trim(),
      });
    const now = Date.now();
    // Docker "hiç" zamanı 0001-01-01 → geçersiz say
    const parseTs = (v) => {
      const t = Date.parse(v);
      return Number.isFinite(t) && t > 0 ? t : 0;
    };
    const containers = parseJsonLines(r.out).map((c) => {
      const st = c.State || {};
      const cfg = c.Config || {};
      const running = !!st.Running;
      const created = parseTs(c.Created);
      const startedAt = parseTs(st.StartedAt);
      const finishedAt = parseTs(st.FinishedAt);
      // Son hareket: çalışıyorsa başlatma; durduysa bitiş; hiç çalışmadıysa oluşturma
      const lastActivity = running
        ? startedAt || created
        : finishedAt || created;
      return {
        id: (c.Id || "").slice(0, 12),
        name: (c.Name || "").replace(/^\//, ""),
        image: cfg.Image || "",
        running,
        status: st.Status || (running ? "running" : "exited"),
        created,
        startedAt,
        finishedAt,
        restartCount: c.RestartCount || 0,
        cmd: Array.isArray(cfg.Cmd) ? cfg.Cmd.join(" ") : "",
        lastActivity,
        idleMs: lastActivity ? now - lastActivity : 0,
      };
    });
    // En uzun süredir hareketsiz olan en üstte
    containers.sort((a, b) => b.idleMs - a.idleMs);
    res.json({ available: true, containers, now });
  });
});

// Temizlik (prune): durmuş konteynerler veya artık (dangling) imajlar
const PRUNE_CMDS = {
  containers: "docker container prune -f",
  images: "docker image prune -f",
};
app.post("/api/docker/prune", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const cmd = PRUNE_CMDS[req.body && req.body.what];
  if (!cmd) return res.status(400).json({ error: "Geçersiz temizlik türü." });
  dockerExec(s, cmd + " 2>&1", (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    if (r.code !== 0)
      return res.status(400).json({ error: (r.out || "Temizlik başarısız").trim() });
    res.json({ ok: true, output: (r.out || "").trim() });
  });
});

// Görüntü (image) listesi
app.get("/api/docker/images", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker images --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({
        available: false,
        error: (r.errout || "Docker bulunamadı").trim(),
      });
    const images = parseJsonLines(r.out).map((i) => ({
      id: i.ID,
      repo: i.Repository,
      tag: i.Tag,
      size: i.Size,
      created: i.CreatedSince || i.CreatedAt || "",
    }));
    res.json({ available: true, images });
  });
});

// Konteyner logları
app.get("/api/docker/logs", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const id = req.query.id;
  if (!id || !SAFE_ID.test(id))
    return res.status(400).json({ error: "Geçersiz kimlik." });
  dockerExec(
    s,
    `docker logs --tail 400 --timestamps ${shQuote(id)} 2>&1`,
    (err, r) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ logs: r.out || "(log yok)" });
    },
  );
});

// Eylem: start/stop/restart/rm/pause/unpause/kill/rmi
const CONTAINER_ACTIONS = {
  start: "start",
  stop: "stop",
  restart: "restart",
  pause: "pause",
  unpause: "unpause",
  kill: "kill",
  rm: "rm -f",
};
app.post("/api/docker/action", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { type, id, action } = req.body || {};
  if (!id || !SAFE_ID.test(id))
    return res.status(400).json({ error: "Geçersiz kimlik." });
  let cmd;
  if (type === "image") {
    if (action !== "rmi")
      return res.status(400).json({ error: "Geçersiz işlem." });
    cmd = `docker rmi ${shQuote(id)}`;
  } else {
    const sub = CONTAINER_ACTIONS[action];
    if (!sub) return res.status(400).json({ error: "Geçersiz işlem." });
    cmd = `docker ${sub} ${shQuote(id)}`;
  }
  dockerExec(s, cmd + " 2>&1", (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    if (r.code !== 0)
      return res
        .status(400)
        .json({ error: (r.out || r.errout || "İşlem başarısız").trim() });
    res.json({ ok: true, output: r.out.trim() });
  });
});

// ---- Klasörü .tar.gz olarak indir ----
app.get("/api/download-folder", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!req.query.path)
    return res.status(400).json({ error: "Klasör yolu gerekli." });
  if (!hasExec(s))
    return res
      .status(400)
      .json({
        error:
          "Klasör indirme yalnızca SFTP'de desteklenir. Tek tek dosya indirin.",
      });
  const dir = resolveRemote("/", req.query.path);
  const parent = path.posix.dirname(dir);
  const base = path.posix.basename(dir) || "kok";
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(base)}.tar.gz"`,
  );
  s.fs.exec.exec(
    `tar czf - -C ${shQuote(parent)} ${shQuote(base)}`,
    (err, stream) => {
      if (err) {
        if (!res.headersSent)
          res.status(400).json({ error: "İndirilemedi: " + err.message });
        return;
      }
      stream.stderr.resume(); // tar uyarılarını yut
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    },
  );
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
  if (!hasExec(s))
    return res
      .status(400)
      .json({
        error:
          "Toplu indirme yalnızca SFTP'de desteklenir. Tek tek dosya indirin.",
      });
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="secilenler.tar.gz"`,
  );
  const args = names.map(shQuote).join(" ");
  s.fs.exec.exec(`tar czf - -C ${shQuote(dir)} ${args}`, (err, stream) => {
    if (err) {
      if (!res.headersSent)
        res.status(400).json({ error: "İndirilemedi: " + err.message });
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
  if (!hasExec(s)) return res.json({ available: false });
  s.fs.exec.exec("df -Pk " + shQuote(dir), (err, stream) => {
    if (err) return res.json({ available: false });
    let out = "";
    stream.on("data", (d) => {
      out += d;
    });
    stream.stderr.on("data", () => {});
    stream.on("close", () => {
      const lines = out.trim().split("\n");
      if (lines.length < 2) return res.json({ available: false });
      const p = lines[lines.length - 1].trim().split(/\s+/);
      const totalK = Number(p[1]),
        usedK = Number(p[2]),
        availK = Number(p[3]);
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
app.get("/api/read", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.query.path);
  if (!req.query.path)
    return res.status(400).json({ error: "Dosya yolu gerekli." });
  try {
    let size = 0;
    try {
      size = await s.fs.statSize(file);
    } catch (_) {
      size = 0;
    }
    if (size > MAX_EDIT_SIZE) {
      return res
        .status(413)
        .json({
          error: "Dosya 5 MB'tan büyük, düzenleyici açamaz. İndirerek açın.",
        });
    }
    const buf = await s.fs.readFile(file);
    // İkili (binary) dosya mı? NUL baytı içeriyorsa metin olarak açma
    const sample = buf.subarray(0, 8000);
    if (sample.includes(0)) {
      return res
        .status(415)
        .json({
          error: "Bu bir metin dosyası değil (ikili içerik). İndirerek açın.",
        });
    }
    res.json({ path: file, content: buf.toString("utf8"), size: buf.length });
  } catch (e) {
    res.status(400).json({ error: "Okunamadı: " + e.message });
  }
});

// ---- Dosya içeriğini kaydet ----
app.post("/api/save", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.body.path);
  if (!req.body.path)
    return res.status(400).json({ error: "Dosya yolu gerekli." });
  if (typeof req.body.content !== "string")
    return res.status(400).json({ error: "İçerik geçersiz." });
  try {
    await s.fs.writeFile(file, Buffer.from(req.body.content, "utf8"));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Kaydedilemedi: " + err.message });
  }
});

// ---- Yükle (paralel + klasör/iç içe yol desteği) ----
// Klasör yüklemede istemci her dosya için bir göreli yol ("paths") gönderir
// (ör. "proje/src/index.js"). Yoksa dosya adı (originalname) kullanılır.
app.post("/api/upload", upload.array("files"), async (req, res) => {
  const s = getSession(req, res);
  if (!s) {
    cleanupTemps(req.files);
    return;
  }
  const dir = resolveRemote("/", req.body.path || "/");
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "Dosya seçilmedi." });

  // Göreli yollar: multer dosya sırasını korur, paths alanı da aynı sırada gelir.
  let rels = req.body.paths;
  if (rels === undefined) rels = [];
  else if (!Array.isArray(rels)) rels = [rels];

  // Her dosyanın hedef (uzak) yolunu hesapla. Yol kaçışlarını temizle.
  const jobs = files.map((f, i) => {
    const rel = (rels[i] || f.originalname || "").replace(/\\/g, "/");
    const safe = rel
      .split("/")
      .filter((p) => p && p !== "." && p !== "..")
      .join("/");
    return { file: f, dest: resolveRemote(dir, safe || f.originalname) };
  });

  // Çakışma davranışı (FileZilla tarzı): overwrite | skip | rename
  const conflict = ["overwrite", "skip", "rename"].includes(req.body.conflict)
    ? req.body.conflict
    : "overwrite";
  // Eşzamanlılık: istemci 1..8 arası seçebilir
  let concurrency = parseInt(req.body.concurrency, 10);
  if (!Number.isFinite(concurrency)) concurrency = UPLOAD_CONCURRENCY;
  concurrency = Math.min(8, Math.max(1, concurrency));

  let skipped = 0,
    renamed = 0;

  try {
    // 1) Gerekli tüm üst klasörleri önce oluştur (yarış durumunu önlemek için sıralı).
    const dirsNeeded = new Set();
    for (const j of jobs) {
      let d = path.posix.dirname(j.dest);
      while (d && d.length > dir.length && !dirsNeeded.has(d)) {
        dirsNeeded.add(d);
        d = path.posix.dirname(d);
      }
    }
    const sortedDirs = [...dirsNeeded].sort((a, b) => a.length - b.length);
    for (const d of sortedDirs) {
      try {
        await s.fs.mkdir(d);
      } catch (_) {
        /* zaten var olabilir */
      }
    }

    // 2) Dosyaları sınırlı eşzamanlılıkla, akış olarak yükle (çakışma kuralına göre).
    const errors = await runPool(jobs, concurrency, async (j) => {
      let dest = j.dest;
      if (conflict !== "overwrite" && (await remoteExists(s, dest))) {
        if (conflict === "skip") {
          skipped++;
          return;
        }
        if (conflict === "rename") {
          dest = await uniqueRemoteName(s, dest);
          renamed++;
        }
      }
      const rs = fs.createReadStream(j.file.path);
      try {
        await s.fs.uploadStream(rs, dest);
      } finally {
        try {
          rs.destroy();
        } catch (_) {}
      }
    });

    const uploaded = jobs.length - errors.length - skipped;
    if (errors.length) {
      const first = errors[0];
      return res.status(400).json({
        error: `${errors.length} dosya yüklenemedi (ör. ${path.posix.basename(first.item.dest)}: ${first.error.message})`,
        count: uploaded,
        skipped,
        renamed,
        failed: errors.length,
      });
    }
    res.json({ ok: true, count: uploaded, skipped, renamed });
  } catch (err) {
    res.status(400).json({ error: "Yükleme hatası: " + err.message });
  } finally {
    cleanupTemps(files);
  }
});

// Uzak yolda dosya/klasör var mı?
async function remoteExists(s, p) {
  try {
    await s.fs.statSize(p);
    return true;
  } catch (_) {
    return false;
  }
}

// Çakışmayan bir ad bul: "dosya.txt" → "dosya (1).txt" → "dosya (2).txt" ...
async function uniqueRemoteName(s, dest) {
  const dir = path.posix.dirname(dest);
  const base = path.posix.basename(dest);
  const ext = path.posix.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let n = 1; n < 1000; n++) {
    const cand = path.posix.join(dir, `${stem} (${n})${ext}`);
    if (!(await remoteExists(s, cand))) return cand;
  }
  return dest; // makul sınır aşıldı → üzerine yaz
}

// Geçici yüklenen dosyaları diskten temizle.
function cleanupTemps(files) {
  for (const f of files || []) {
    fs.unlink(f.path, () => {});
  }
}

// ---- Yeni klasör ----
app.post("/api/mkdir", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.body.path);
  const name = req.body.name;
  if (!name) return res.status(400).json({ error: "Klasör adı gerekli." });
  try {
    await s.fs.mkdir(path.posix.join(dir, name));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Klasör oluşturulamadı: " + err.message });
  }
});

// ---- Yeniden adlandır / taşı ----
app.post("/api/rename", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const from = resolveRemote("/", req.body.from);
  const to = resolveRemote("/", req.body.to);
  if (!req.body.from || !req.body.to)
    return res.status(400).json({ error: "Kaynak ve hedef gerekli." });
  try {
    await s.fs.rename(from, to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "İşlem başarısız: " + err.message });
  }
});

// ---- Sil ----
app.post("/api/delete", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const target = resolveRemote("/", req.body.path);
  const type = req.body.type;
  if (!req.body.path) return res.status(400).json({ error: "Yol gerekli." });
  try {
    if (type === "dir") await s.fs.removeDir(target);
    else await s.fs.removeFile(target);
    res.json({ ok: true });
  } catch (err) {
    res
      .status(400)
      .json({
        error:
          (type === "dir" ? "Klasör silinemedi: " : "Silinemedi: ") +
          err.message,
      });
  }
});

// ---- Kayıtlı sunucular (servers.json dosyasında kalıcı) ----
// Masaüstü (Electron) uygulamasında __dirname salt-okunur asar arşivinin içindedir;
// bu yüzden yazılabilir bir veri klasörü (PORTPILOT_DATA_DIR) varsa onu kullan.
const DATA_DIR = process.env.PORTPILOT_DATA_DIR || __dirname;
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");
// Eski sürümlerden kalan servers.json varsa yeni konuma bir kez taşı/kopyala
(function migrateServers() {
  if (DATA_DIR === __dirname) return;
  try {
    if (fs.existsSync(SERVERS_FILE)) return;
    const legacy = path.join(__dirname, "servers.json");
    if (fs.existsSync(legacy)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (_) {}
      fs.copyFileSync(legacy, SERVERS_FILE);
    }
  } catch (_) {}
})();
function readServers() {
  try {
    return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8"));
  } catch (_) {
    return [];
  }
}
function writeServers(arr) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(arr, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

app.get("/api/servers", (req, res) => {
  res.json({ servers: readServers() });
});

app.post("/api/servers", (req, res) => {
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
  const idx = servers.findIndex(
    (s) =>
      s.host === server.host &&
      s.username === server.username &&
      String(s.port) === String(server.port),
  );
  if (idx >= 0) {
    server.id = servers[idx].id;
    servers[idx] = server;
  } else servers.push(server);
  if (!writeServers(servers))
    return res.status(500).json({ error: "Kaydedilemedi." });
  res.json({ ok: true, servers });
});

app.delete("/api/servers/:id", (req, res) => {
  const servers = readServers().filter((s) => s.id !== req.params.id);
  if (!writeServers(servers))
    return res.status(500).json({ error: "Silinemedi." });
  res.json({ ok: true, servers });
});

// Toplu silme: { ids: [...] }  veya  { group: "Grup adı" }  veya  { all: true }
app.post("/api/servers/bulk-delete", (req, res) => {
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

// ---- Masaüstü uygulaması indirmeleri (dist/ klasöründeki kurulum dosyaları) ----
const DIST_DIR = path.join(__dirname, "dist");
const APP_EXTS = [".dmg", ".appimage", ".deb", ".rpm", ".pacman", ".exe", ".zip"];

function platformOf(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".dmg") || n.includes("-mac"))
    return { os: "mac", label: "macOS", icon: "🍎" };
  if (n.endsWith(".exe")) return { os: "win", label: "Windows", icon: "🪟" };
  if (n.endsWith(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm") || n.endsWith(".pacman"))
    return { os: "linux", label: "Linux", icon: "🐧" };
  return { os: "other", label: "Diğer", icon: "💻" };
}
function archOf(name) {
  const n = name.toLowerCase();
  if (n.includes("arm64") || n.includes("aarch64")) return "arm64";
  // electron-builder arm64'ü adda belirtir; x64 sürümlerde ek olmaz → varsayılan x64
  return "x64";
}

app.get("/api/downloads", (req, res) => {
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
      try {
        size = fs.statSync(path.join(DIST_DIR, f)).size;
      } catch (_) {}
      const p = platformOf(f);
      return {
        name: f,
        size,
        os: p.os,
        label: p.label,
        icon: p.icon,
        arch: archOf(f),
        url: "/download-app/" + encodeURIComponent(f),
      };
    })
    .filter((it) => it.size > 1024 * 100) // bozuk/boş dosyaları gizle
    .sort((a, b) => a.os.localeCompare(b.os) || a.name.localeCompare(b.name));
  res.json({ available: items.length > 0, items });
});

app.get("/download-app/:name", (req, res) => {
  const name = path.basename(req.params.name || ""); // yol kaçışını engelle
  if (!APP_EXTS.includes(path.extname(name).toLowerCase())) {
    return res.status(400).json({ error: "Geçersiz dosya." });
  }
  const file = path.join(DIST_DIR, name);
  if (!fs.existsSync(file))
    return res.status(404).json({ error: "Dosya bulunamadı." });
  res.download(file, name);
});

app.get("/api/health", (req, res) =>
  res.json({ ok: true, sessions: sessions.size }),
);

// Doğrudan `node server.js` ile çalıştırıldığında dinle.
// Electron (electron/main.js) içinden require edildiğinde otomatik dinleme yapma;
// orada uygulama kendi portunu seçip startServer() çağırır.
function startServer(port = PORT) {
  return new Promise((resolve) => {
    const srv = app.listen(port, () => {
      const real = srv.address().port;
      console.log(`\n  PortPilot çalışıyor →  http://localhost:${real}\n`);
      resolve({ server: srv, port: real });
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
