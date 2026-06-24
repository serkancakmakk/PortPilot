const express = require("express");
const path = require("path");
const fs = require("fs");
const { getSession, hasExec } = require("../lib/sessions");
const { resolveRemote, shQuote, runPool } = require("../lib/shell-utils");
const {
  upload,
  UPLOAD_CONCURRENCY,
  CONFLICT_MODES,
  uniqueRemoteName,
  resolveConflict,
  cleanupTemps,
} = require("../lib/uploads");

const router = express.Router();

// ---- Dizin listele ----
router.get("/api/list", async (req, res) => {
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
router.get("/api/download", async (req, res) => {
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

// ---- Klasörü .tar.gz olarak indir ----
router.get("/api/download-folder", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!req.query.path)
    return res.status(400).json({ error: "Klasör yolu gerekli." });
  if (!hasExec(s))
    return res.status(400).json({
      error: "Klasör indirme yalnızca SFTP'de desteklenir. Tek tek dosya indirin.",
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
      stream.stderr.resume();
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    },
  );
});

// ---- Birden çok öğeyi tek .tar.gz olarak indir ----
router.get("/api/download-multi", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.query.dir || "/");
  let names = req.query.name;
  if (!names) return res.status(400).json({ error: "Öğe seçilmedi." });
  if (!Array.isArray(names)) names = [names];
  names = names.filter((n) => n && !n.includes("/"));
  if (!names.length) return res.status(400).json({ error: "Geçersiz seçim." });
  if (!hasExec(s))
    return res.status(400).json({
      error: "Toplu indirme yalnızca SFTP'de desteklenir. Tek tek dosya indirin.",
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

// ---- Disk doluluk oranı ----
router.get("/api/disk", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const dir = resolveRemote("/", req.query.path || "/");
  if (!hasExec(s)) return res.json({ available: false });
  s.fs.exec.exec("df -Pk " + shQuote(dir), (err, stream) => {
    if (err) return res.json({ available: false });
    let out = "";
    stream.on("data", (d) => { out += d; });
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

// ---- Sunucu istatistikleri (dashboard) ----
const STATS_CMD = [
  'echo "##HOST##"; hostname 2>/dev/null',
  'echo "##OS##"; (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -sr',
  'echo "##KERNEL##"; uname -r 2>/dev/null',
  'echo "##UPTIME##"; cat /proc/uptime 2>/dev/null',
  'echo "##LOAD##"; cat /proc/loadavg 2>/dev/null',
  'echo "##CPUN##"; nproc 2>/dev/null',
  'echo "##CPUNAME##"; grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2',
  'echo "##MEM##"; cat /proc/meminfo 2>/dev/null',
  'echo "##DISK##"; df -Pk / 2>/dev/null',
].join("; ");

function section(out, name) {
  const re = new RegExp("##" + name + "##\\n([\\s\\S]*?)(?=##[A-Z]+##|$)");
  const m = out.match(re);
  return m ? m[1].trim() : "";
}

router.get("/api/stats", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return res.json({ available: false });
  s.fs.exec.exec(STATS_CMD, (err, stream) => {
    if (err) return res.json({ available: false });
    let out = "";
    stream.on("data", (d) => { out += d; });
    stream.stderr.on("data", () => {});
    stream.on("close", () => {
      try {
        const meminfo = section(out, "MEM");
        const memKB = (key) => {
          const m = meminfo.match(new RegExp(key + ":\\s+(\\d+)"));
          return m ? Number(m[1]) * 1024 : 0;
        };
        const memTotal = memKB("MemTotal");
        const memAvail = memKB("MemAvailable") || memKB("MemFree");
        const memUsed = memTotal ? memTotal - memAvail : 0;

        const uptimeSec = Math.floor(Number((section(out, "UPTIME").split(/\s+/)[0]) || 0));
        const loadParts = section(out, "LOAD").split(/\s+/);
        const cpuCount = Number(section(out, "CPUN")) || 1;

        const diskLines = section(out, "DISK").trim().split("\n");
        let disk = null;
        if (diskLines.length >= 2) {
          const p = diskLines[diskLines.length - 1].trim().split(/\s+/);
          const totalK = Number(p[1]), usedK = Number(p[2]), availK = Number(p[3]);
          if (totalK) disk = {
            total: totalK * 1024, used: usedK * 1024, avail: availK * 1024,
            percent: Math.round((usedK / totalK) * 100),
          };
        }

        res.json({
          available: true,
          hostname: section(out, "HOST"),
          os: section(out, "OS"),
          kernel: section(out, "KERNEL"),
          cpuName: section(out, "CPUNAME"),
          cpuCount,
          uptimeSec,
          load: {
            "1": Number(loadParts[0]) || 0,
            "5": Number(loadParts[1]) || 0,
            "15": Number(loadParts[2]) || 0,
            percent: Math.min(100, Math.round(((Number(loadParts[0]) || 0) / cpuCount) * 100)),
          },
          mem: { total: memTotal, used: memUsed, avail: memAvail, percent: memTotal ? Math.round((memUsed / memTotal) * 100) : 0 },
          disk,
        });
      } catch (e) {
        res.json({ available: false });
      }
    });
  });
});

// ---- Dosya içeriğini oku (düzenleme için) ----
const MAX_EDIT_SIZE = 5 * 1024 * 1024;
router.get("/api/read", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const file = resolveRemote("/", req.query.path);
  if (!req.query.path)
    return res.status(400).json({ error: "Dosya yolu gerekli." });
  try {
    let size = 0;
    try {
      size = await s.fs.statSize(file);
    } catch (_) {}
    if (size > MAX_EDIT_SIZE)
      return res.status(413).json({
        error: "Dosya 5 MB'tan büyük, düzenleyici açamaz. İndirerek açın.",
      });
    const buf = await s.fs.readFile(file);
    const sample = buf.subarray(0, 8000);
    if (sample.includes(0))
      return res.status(415).json({
        error: "Bu bir metin dosyası değil (ikili içerik). İndirerek açın.",
      });
    res.json({ path: file, content: buf.toString("utf8"), size: buf.length });
  } catch (e) {
    res.status(400).json({ error: "Okunamadı: " + e.message });
  }
});

// ---- Dosya içeriğini kaydet ----
router.post("/api/save", async (req, res) => {
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
router.post("/api/upload", upload.array("files"), async (req, res) => {
  const s = getSession(req, res);
  if (!s) {
    cleanupTemps(req.files);
    return;
  }
  const dir = resolveRemote("/", req.body.path || "/");
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "Dosya seçilmedi." });

  let rels = req.body.paths;
  if (rels === undefined) rels = [];
  else if (!Array.isArray(rels)) rels = [rels];

  let mtimes = req.body.mtimes;
  if (mtimes === undefined) mtimes = [];
  else if (!Array.isArray(mtimes)) mtimes = [mtimes];

  const jobs = files.map((f, i) => {
    const rel = (rels[i] || f.originalname || "").replace(/\\/g, "/");
    const safe = rel
      .split("/")
      .filter((p) => p && p !== "." && p !== "..")
      .join("/");
    const srcMtime = parseInt(mtimes[i], 10);
    return {
      file: f,
      dest: resolveRemote(dir, safe || f.originalname),
      srcMtime: Number.isFinite(srcMtime) ? srcMtime : 0,
    };
  });

  const conflict = CONFLICT_MODES.includes(req.body.conflict)
    ? req.body.conflict
    : "overwrite";
  let concurrency = parseInt(req.body.concurrency, 10);
  if (!Number.isFinite(concurrency)) concurrency = UPLOAD_CONCURRENCY;
  concurrency = Math.min(8, Math.max(1, concurrency));

  let skipped = 0, renamed = 0;

  // İlerlemeyi NDJSON olarak akıt. İstemci kapansa bile yükleme sunucuda sürer.
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  let clientGone = false;
  res.on("error", () => {});                    // EPIPE vb. sustur
  req.on("aborted", () => { clientGone = true; }); // istemci kapandı; yükleme yine de bitirilir
  const send = (o) => {
    if (clientGone) return;
    try { res.write(JSON.stringify(o) + "\n"); } catch (_) { clientGone = true; }
  };

  const total = jobs.length;
  let done = 0, lastSent = 0;
  const step = Math.max(1, Math.floor(total / 100));
  send({ total });

  try {
    // 1) Gerekli tüm üst klasörleri sıralı oluştur
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
      } catch (_) {}
    }

    // 2) Dosyaları sınırlı eşzamanlılıkla yükle (ilerleme akışıyla)
    const errors = await runPool(jobs, concurrency, async (j) => {
      try {
        let dest = j.dest;
        const action = await resolveConflict(s, dest, conflict, j.file.size, j.srcMtime);
        if (action === "skip") { skipped++; return; }
        if (action === "rename") { dest = await uniqueRemoteName(s, dest); renamed++; }
        const rs = fs.createReadStream(j.file.path);
        try {
          await s.fs.uploadStream(rs, dest);
        } finally {
          try { rs.destroy(); } catch (_) {}
        }
      } finally {
        done++;
        if (done - lastSent >= step || done === total) { lastSent = done; send({ done }); }
      }
    });

    const uploaded = jobs.length - errors.length - skipped;
    if (errors.length) {
      const first = errors[0];
      send({
        error: `${errors.length} dosya yüklenemedi (ör. ${path.posix.basename(first.item.dest)}: ${first.error.message})`,
        count: uploaded, skipped, renamed, failed: errors.length,
      });
    } else {
      send({ ok: true, count: uploaded, skipped, renamed });
    }
    res.end();
  } catch (err) {
    send({ error: "Yükleme hatası: " + err.message });
    res.end();
  } finally {
    cleanupTemps(files);
  }
});

// ---- Yerel klasörü diskten okuyup yeniden yükle (masaüstü/Electron) ----
// Sunucu masaüstünde kullanıcıyla aynı makinede çalıştığından, kayıtlı bir yerel
// yolu fs ile gezip SFTP'ye gönderir; kullanıcının yeniden klasör seçmesine gerek kalmaz.
router.post("/api/upload-local", express.json(), async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;

  // Tek yol (localPath) ya da çoklu yol (localPaths) kabul et.
  let localPaths = req.body.localPaths;
  if (!Array.isArray(localPaths)) localPaths = [];
  if (req.body.localPath && typeof req.body.localPath === "string")
    localPaths = [req.body.localPath, ...localPaths];
  localPaths = localPaths.filter((p) => typeof p === "string" && p);
  if (!localPaths.length)
    return res.status(400).json({ error: "Yerel yol belirtilmedi." });

  const dir = resolveRemote("/", req.body.path || "/");

  // Seçilen her yolu (klasör veya dosya) gezerek tüm dosyaları topla.
  const collected = [];
  const walk = (absDir, relDir) => {
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      const abs = path.join(absDir, ent.name);
      const rel = relDir ? relDir + "/" + ent.name : ent.name;
      if (ent.isDirectory()) walk(abs, rel);
      else if (ent.isFile()) {
        let st; try { st = fs.statSync(abs); } catch (_) { continue; }
        collected.push({ abs, rel, size: st.size, mtime: Math.floor(st.mtimeMs) });
      }
    }
  };
  for (const lp of localPaths) {
    let stat;
    try { stat = fs.statSync(lp); } catch (_) { continue; }
    const baseName = path.basename(lp);
    if (stat.isDirectory()) walk(lp, baseName);
    else collected.push({ abs: lp, rel: baseName, size: stat.size, mtime: Math.floor(stat.mtimeMs) });
  }

  if (!collected.length) return res.status(400).json({ error: "Gönderilecek dosya bulunamadı." });

  const jobs = collected.map((c) => ({
    abs: c.abs,
    dest: resolveRemote(dir, c.rel),
    srcMtime: c.mtime,
    size: c.size,
  }));

  const conflict = CONFLICT_MODES.includes(req.body.conflict) ? req.body.conflict : "overwrite";
  let concurrency = parseInt(req.body.concurrency, 10);
  if (!Number.isFinite(concurrency)) concurrency = UPLOAD_CONCURRENCY;
  concurrency = Math.min(8, Math.max(1, concurrency));

  let skipped = 0, renamed = 0;

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  let clientGone = false;
  res.on("error", () => {});
  req.on("aborted", () => { clientGone = true; });
  const send = (o) => {
    if (clientGone) return;
    try { res.write(JSON.stringify(o) + "\n"); } catch (_) { clientGone = true; }
  };

  const total = jobs.length;
  let done = 0, lastSent = 0;
  const step = Math.max(1, Math.floor(total / 100));
  send({ total });

  try {
    // 1) Gerekli üst klasörleri oluştur
    const dirsNeeded = new Set();
    for (const j of jobs) {
      let d = path.posix.dirname(j.dest);
      while (d && d.length > dir.length && !dirsNeeded.has(d)) {
        dirsNeeded.add(d);
        d = path.posix.dirname(d);
      }
    }
    for (const d of [...dirsNeeded].sort((a, b) => a.length - b.length)) {
      try { await s.fs.mkdir(d); } catch (_) {}
    }

    // 2) Dosyaları yükle
    const errors = await runPool(jobs, concurrency, async (j) => {
      try {
        let dest = j.dest;
        const action = await resolveConflict(s, dest, conflict, j.size, j.srcMtime);
        if (action === "skip") { skipped++; return; }
        if (action === "rename") { dest = await uniqueRemoteName(s, dest); renamed++; }
        const rs = fs.createReadStream(j.abs);
        try {
          await s.fs.uploadStream(rs, dest);
        } finally {
          try { rs.destroy(); } catch (_) {}
        }
      } finally {
        done++;
        if (done - lastSent >= step || done === total) { lastSent = done; send({ done }); }
      }
    });

    const uploaded = jobs.length - errors.length - skipped;
    if (errors.length) {
      const first = errors[0];
      send({
        error: `${errors.length} dosya yüklenemedi (ör. ${path.posix.basename(first.item.dest)}: ${first.error.message})`,
        count: uploaded, skipped, renamed, failed: errors.length,
      });
    } else {
      send({ ok: true, count: uploaded, skipped, renamed });
    }
    res.end();
  } catch (err) {
    send({ error: "Yükleme hatası: " + err.message });
    res.end();
  }
});

// ---- Yeni klasör ----
router.post("/api/mkdir", async (req, res) => {
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
router.post("/api/rename", async (req, res) => {
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
// İlerlemeli (akıtmalı) silme: NDJSON satırları → {total} ... {done} ... {ok}/{error}
router.post("/api/delete-stream", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const target = resolveRemote("/", req.body.path);
  const type = req.body.type;
  if (!req.body.path) return res.status(400).json({ error: "Yol gerekli." });

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (o) => { try { res.write(JSON.stringify(o) + "\n"); } catch (_) {} };

  try {
    // Tek dosya ya da akış desteklemeyen (FTP) bağlantı → tek adımda sil
    if (type !== "dir" || typeof s.fs.removeTree !== "function") {
      await (type === "dir" ? s.fs.removeDir(target) : s.fs.removeFile(target));
      send({ ok: true });
      return res.end();
    }
    // Paralel silme + ilerleme akışı
    let total = 0, done = 0, lastSent = 0, step = 1;
    await s.fs.removeTree(target, {
      concurrency: 16,
      onTotal: (t) => { total = t; step = Math.max(1, Math.floor(t / 100)); send({ total }); },
      onProgress: () => {
        done++;
        if (done - lastSent >= step) { lastSent = done; send({ done }); }
      },
    });
    send({ done: total, ok: true, total });
    res.end();
  } catch (err) {
    send({ error: (type === "dir" ? "Klasör silinemedi: " : "Silinemedi: ") + err.message });
    res.end();
  }
});

router.post("/api/delete", async (req, res) => {
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
    res.status(400).json({
      error: (type === "dir" ? "Klasör silinemedi: " : "Silinemedi: ") + err.message,
    });
  }
});

module.exports = router;
