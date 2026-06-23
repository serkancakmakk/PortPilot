"use strict";

// Uzak dosya sistemi için tek tip (protokolden bağımsız) arayüz.
// SFTP (ssh2) ve FTP/FTPS (basic-ftp) aynı yöntemlerle kullanılır:
//   list, realpath, statSize, readFile, writeFile, downloadTo,
//   uploadFrom, mkdir, rename, removeFile, removeDir, end
// SFTP adaptöründe ayrıca .exec (ssh2 conn) bulunur; FTP'de null'dır.

const path = require("path");
const { Readable, Writable } = require("stream");
const { Client: SSHClient } = require("ssh2");
const ftp = require("basic-ftp");

// ---------------- SFTP (SSH) ----------------
function connectSFTP(cfg) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (_) {}
      reject(new Error(msg));
    };
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) return fail("SFTP başlatılamadı: " + err.message);
        settled = true;
        resolve(makeSftpFs(conn, sftp));
      });
    });
    conn.on("error", (err) => fail("Bağlantı hatası: " + err.message));

    const opts = {
      host: cfg.host,
      port: Number(cfg.port) || 22,
      username: cfg.username,
      readyTimeout: 20000,
      // Eski sunucularla uyumluluk için imza/anahtar algoritmalarını genişlet
      algorithms: {
        serverHostKey: [
          "ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
          "rsa-sha2-512", "rsa-sha2-256", "ssh-rsa", "ssh-dss",
        ],
      },
    };
    if (cfg.privateKey && cfg.privateKey.trim()) {
      opts.privateKey = cfg.privateKey;
      if (cfg.passphrase) opts.passphrase = cfg.passphrase;
    } else {
      opts.password = cfg.password || "";
      // Bazı sunucular klavye-etkileşimli (keyboard-interactive) auth ister
      opts.tryKeyboard = true;
      conn.on("keyboard-interactive", (_n, _i, _l, _p, finish) => finish([cfg.password || ""]));
    }
    try { conn.connect(opts); }
    catch (e) { fail("Bağlantı kurulamadı: " + e.message); }
  });
}

function makeSftpFs(conn, sftp) {
  const pf = (fn) => (...args) => new Promise((res, rej) => {
    fn(...args, (err, r) => (err ? rej(err) : res(r)));
  });
  const readdir = pf(sftp.readdir.bind(sftp));
  const stat = pf(sftp.stat.bind(sftp));
  const realpath = pf(sftp.realpath.bind(sftp));
  const readFileCb = pf(sftp.readFile.bind(sftp));
  const mkdirCb = pf(sftp.mkdir.bind(sftp));
  const renameCb = pf(sftp.rename.bind(sftp));
  const unlinkCb = pf(sftp.unlink.bind(sftp));
  const rmdirCb = pf(sftp.rmdir.bind(sftp));

  async function removeDir(dir, onProgress) {
    const list = await readdir(dir);
    for (const it of list) {
      const full = path.posix.join(dir, it.filename);
      const isDir = (it.attrs.mode & 0o170000) === 0o040000;
      if (isDir) await removeDir(full, onProgress);
      else { await unlinkCb(full); if (onProgress) onProgress(); }
    }
    await rmdirCb(dir);
    if (onProgress) onProgress();
  }

  // Silmeden önce ağaçtaki toplam öğe (dosya + klasör) sayısı
  async function countTree(dir) {
    let n = 0;
    const list = await readdir(dir);
    for (const it of list) {
      const full = path.posix.join(dir, it.filename);
      const isDir = (it.attrs.mode & 0o170000) === 0o040000;
      n += isDir ? 1 + (await countTree(full)) : 1;
    }
    return n;
  }

  // Paralel ağaç silme: tüm ağacı tara, dosyaları eşzamanlı (concurrency) sil,
  // sonra klasörleri en derinden başlayarak boşalt. onTotal/onProgress ile ilerleme.
  async function removeTree(dir, opts = {}) {
    const concurrency = Math.max(1, opts.concurrency || 16);
    const onProgress = opts.onProgress;
    const files = [], dirs = [];
    async function walk(d) {
      dirs.push(d);
      const list = await readdir(d);
      for (const it of list) {
        const full = path.posix.join(d, it.filename);
        if ((it.attrs.mode & 0o170000) === 0o040000) await walk(full);
        else files.push(full);
      }
    }
    await walk(dir);
    if (opts.onTotal) opts.onTotal(files.length + dirs.length);

    // Dosyaları eşzamanlı sil (round-trip'leri paralelleştir)
    let idx = 0;
    const worker = async () => {
      while (idx < files.length) {
        const f = files[idx++];
        await unlinkCb(f);
        if (onProgress) onProgress();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));

    // Klasörleri en derinden başlayarak kaldır (içerikleri artık boş)
    dirs.sort((a, b) => b.length - a.length);
    for (const d of dirs) { await rmdirCb(d); if (onProgress) onProgress(); }
  }

  return {
    proto: "sftp",
    exec: conn, // ssh2 Client (docker/disk/tar için)
    async list(dir) {
      const list = await readdir(dir);
      return list.map((it) => {
        const a = it.attrs;
        const isDir = (a.mode & 0o170000) === 0o040000;
        const isLink = (a.mode & 0o170000) === 0o120000;
        return {
          name: it.filename,
          type: isDir ? "dir" : isLink ? "link" : "file",
          size: a.size,
          mtime: a.mtime * 1000,
          mode: a.mode & 0o777,
        };
      });
    },
    async realpath(p) { return realpath(p || "."); },
    async statSize(file) { const st = await stat(file); return st.size; },
    async statInfo(file) {
      const st = await stat(file);
      return { size: st.size, mtime: (st.mtime || 0) * 1000 };
    },
    async readFile(file) { return readFileCb(file); },
    writeFile(file, buf) {
      return new Promise((res, rej) => {
        const ws = sftp.createWriteStream(file);
        ws.on("error", rej);
        ws.on("close", res);
        ws.end(buf);
      });
    },
    downloadTo(writable, file) {
      return new Promise((res, rej) => {
        const rs = sftp.createReadStream(file);
        rs.on("error", rej);
        writable.on("error", rej);
        rs.on("end", res);
        rs.pipe(writable);
      });
    },
    uploadFrom(buf, dest) {
      return new Promise((res, rej) => {
        const ws = sftp.createWriteStream(dest);
        ws.on("error", rej);
        ws.on("close", res);
        ws.end(buf);
      });
    },
    // Bir Readable'dan akış yazar (RAM'e tüm dosyayı almadan).
    // SFTP tek kanal üzerinden eşzamanlı birden çok akışı destekler → paralel yükleme.
    uploadStream(readable, dest) {
      return new Promise((res, rej) => {
        const ws = sftp.createWriteStream(dest);
        ws.on("error", rej);
        ws.on("close", res);
        readable.on("error", rej);
        readable.pipe(ws);
      });
    },
    mkdir(dir) { return mkdirCb(dir); },
    rename(from, to) { return renameCb(from, to); },
    removeFile(file) { return unlinkCb(file); },
    removeDir,
    countTree,
    removeTree,
    async end() { try { conn.end(); } catch (_) {} },
  };
}

// ---------------- FTP / FTPS ----------------
// secure: false → düz FTP, true → FTPS (açık TLS), "implicit" → örtük TLS
async function connectFTP(cfg, secure) {
  const client = new ftp.Client(25000);
  client.ftp.verbose = false;
  await client.access({
    host: cfg.host,
    port: Number(cfg.port) || (secure === "implicit" ? 990 : 21),
    user: cfg.username,
    password: cfg.password || "",
    secure: secure || false,
    secureOptions: { rejectUnauthorized: false }, // self-signed sertifikalara izin ver
  });
  return makeFtpFs(client);
}

function makeFtpFs(client) {
  // basic-ftp tek seferde tek işlem yapabilir → işlemleri sıraya al (mutex)
  let chain = Promise.resolve();
  const run = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  const typeOf = (info) => {
    if (info.type === ftp.FileType.Directory) return "dir";
    if (info.type === ftp.FileType.SymbolicLink) return "link";
    return "file";
  };

  async function removeDir(dir) {
    // basic-ftp removeDir özyinelemeli siler ve dizine girip çıkar
    await client.removeDir(dir);
  }

  return {
    proto: "ftp",
    exec: null,
    list(dir) {
      return run(async () => {
        const list = await client.list(dir);
        return list.map((info) => ({
          name: info.name,
          type: typeOf(info),
          size: info.size,
          mtime: info.modifiedAt ? info.modifiedAt.getTime() : 0,
          mode: 0,
        }));
      });
    },
    realpath() { return run(() => client.pwd()); },
    statSize(file) { return run(() => client.size(file)); },
    statInfo(file) {
      return run(async () => {
        let size = -1, mtime = 0;
        try { size = await client.size(file); } catch (_) {}
        try { const d = await client.lastMod(file); mtime = d ? d.getTime() : 0; } catch (_) {}
        if (size < 0 && mtime === 0) throw new Error("stat yok");
        return { size, mtime };
      });
    },
    readFile(file) {
      return run(async () => {
        const chunks = [];
        const sink = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
        await client.downloadTo(sink, file);
        return Buffer.concat(chunks);
      });
    },
    writeFile(file, buf) {
      return run(() => client.uploadFrom(Readable.from(buf), file));
    },
    downloadTo(writable, file) {
      return run(() => client.downloadTo(writable, file));
    },
    uploadFrom(buf, dest) {
      return run(() => client.uploadFrom(Readable.from(buf), dest));
    },
    // FTP tek bağlantıda tek işlem yapabildiği için akışlar mutex ile sıraya alınır.
    uploadStream(readable, dest) {
      return run(() => client.uploadFrom(readable, dest));
    },
    mkdir(dir) { return run(() => client.send("MKD " + dir)); },
    rename(from, to) { return run(() => client.rename(from, to)); },
    removeFile(file) { return run(() => client.remove(file)); },
    removeDir(dir) { return run(() => removeDir(dir)); },
    async end() { try { client.close(); } catch (_) {} },
  };
}

// Protokole göre doğru bağlantıyı kur
function connectRemote(cfg) {
  const proto = (cfg.protocol || "sftp").toLowerCase();
  if (proto === "ftp") return connectFTP(cfg, false);
  if (proto === "ftps") return connectFTP(cfg, true);
  return connectSFTP(cfg);
}

module.exports = { connectRemote };
