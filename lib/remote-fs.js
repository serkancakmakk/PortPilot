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
const { seal, open } = require("./crypto-mem");

// ---------------- SFTP (SSH) ----------------
// ssh2 bağlantı seçeneklerini oluşturur (parola/anahtar + keepalive + algoritmalar).
// cfg.sock verilirse bağlantı o akış üzerinden kurulur (jump host / bastion için).
function buildSshOpts(cfg, conn) {
  const opts = {
    host: cfg.host,
    port: Number(cfg.port) || 22,
    username: cfg.username,
    readyTimeout: 20000,
    // Boşta kalan bağlantıların (NAT/firewall) düşmesini önle: düzenli keepalive.
    keepaliveInterval: 15000,
    keepaliveCountMax: 4,
    // Eski sunucularla uyumluluk için imza/anahtar algoritmalarını genişlet
    algorithms: {
      serverHostKey: [
        "ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521",
        "rsa-sha2-512", "rsa-sha2-256", "ssh-rsa", "ssh-dss",
      ],
    },
  };
  if (cfg.sock) opts.sock = cfg.sock; // önceden kurulmuş akış (bastion forwardOut)
  if (cfg.privateKey && cfg.privateKey.trim()) {
    opts.privateKey = cfg.privateKey;
    if (cfg.passphrase) opts.passphrase = cfg.passphrase;
  } else {
    opts.password = cfg.password || "";
    // Bazı sunucular klavye-etkileşimli (keyboard-interactive) auth ister
    opts.tryKeyboard = true;
    conn.on("keyboard-interactive", (_n, _i, _l, _p, finish) => finish([cfg.password || ""]));
  }
  return opts;
}

// Yalnızca SSH bağlantısı (SFTP kanalı açmadan) — bastion/atlama sunucusu için.
function rawConnectClient(cfg) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (_) {}
      reject(new Error(msg));
    };
    conn.on("ready", () => { settled = true; resolve({ conn }); });
    conn.on("error", (err) => fail("Bağlantı hatası: " + err.message));
    try { conn.connect(buildSshOpts(cfg, conn)); }
    catch (e) { fail("Bağlantı kurulamadı: " + e.message); }
  });
}

// Tek bir SSH bağlantısı + SFTP kanalı kurar (düşük seviye, tek seferlik).
function rawConnectSFTP(cfg) {
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
        resolve({ conn, sftp });
      });
    });
    conn.on("error", (err) => fail("Bağlantı hatası: " + err.message));
    try { conn.connect(buildSshOpts(cfg, conn)); }
    catch (e) { fail("Bağlantı kurulamadı: " + e.message); }
  });
}

// Jump host (bastion) üzerinden bağlan: bastion'a bağlan → oradan hedefe forwardOut →
// oluşan akışı hedef SSH'ın soketi olarak kullan. Atlama yoksa doğrudan bağlanır.
async function rawConnectVia(cfg) {
  const jump = cfg.jump;
  if (!jump || !jump.host) return rawConnectSFTP(cfg);
  const b = await rawConnectClient({
    host: jump.host, port: jump.port, username: jump.username,
    password: jump.password, privateKey: jump.privateKey, passphrase: jump.passphrase,
  });
  let stream;
  try {
    stream = await new Promise((res, rej) =>
      b.conn.forwardOut("127.0.0.1", 0, cfg.host, Number(cfg.port) || 22,
        (e, s) => (e ? rej(e) : res(s))));
  } catch (e) {
    try { b.conn.end(); } catch (_) {}
    throw new Error("Atlama sunucusundan hedefe yönlendirme başarısız: " + e.message);
  }
  let target;
  try {
    target = await rawConnectSFTP({ ...cfg, sock: stream });
  } catch (e) {
    try { b.conn.end(); } catch (_) {}
    throw e;
  }
  // Hedef koparsa bastion'ı da kapat; çağıran da kapatabilsin diye döndür
  target.bastion = b.conn;
  target.conn.on("close", () => { try { b.conn.end(); } catch (_) {} });
  return target;
}

// Kendini iyileştiren SFTP: bağlantı koparsa (ağ değişimi, sunucu yeniden başlatma),
// mühürlü (şifreli) kimlik bilgisiyle saydam şekilde yeniden bağlanır. Kimlik
// bilgileri yalnızca bellekte ve AES-256-GCM ile şifreli tutulur.
async function connectSFTP(cfg, _rawConnect = rawConnectVia) {
  const sealed = seal({
    host: cfg.host, port: cfg.port, username: cfg.username,
    password: cfg.password, privateKey: cfg.privateKey, passphrase: cfg.passphrase,
    jump: cfg.jump && cfg.jump.host ? {
      host: cfg.jump.host, port: cfg.jump.port, username: cfg.jump.username,
      password: cfg.jump.password, privateKey: cfg.jump.privateKey, passphrase: cfg.jump.passphrase,
    } : undefined,
  });

  // Canlı bağlantı durumu (yeniden bağlanınca conn/sftp değişir)
  const state = { conn: null, sftp: null, bastion: null, dead: true, reconnecting: null, closedByUs: false };

  function watch(conn) {
    const onGone = () => { state.dead = true; };
    conn.on("close", onGone);
    conn.on("end", onGone);
    conn.on("error", onGone);
  }

  // Canlı sftp'yi döndürür; ölüyse (en fazla bir kez eşzamanlı) yeniden bağlanır.
  function ensure() {
    if (state.conn && !state.dead) return Promise.resolve(state.sftp);
    if (state.closedByUs) return Promise.reject(new Error("Bağlantı kapatıldı."));
    if (state.reconnecting) return state.reconnecting;
    state.reconnecting = _rawConnect(open(sealed))
      .then(({ conn, sftp, bastion }) => {
        // Yeniden bağlanmada eski bastion'ı kapat
        if (state.bastion && state.bastion !== bastion) { try { state.bastion.end(); } catch (_) {} }
        state.conn = conn; state.sftp = sftp; state.bastion = bastion || null; state.dead = false;
        watch(conn);
        return sftp;
      })
      .finally(() => { state.reconnecting = null; });
    return state.reconnecting;
  }

  await ensure(); // ilk bağlantı — auth hatası burada yüzeye çıkar
  return makeSftpFs(state, ensure);
}

function makeSftpFs(state, ensure) {
  // Her çağrıda canlı sftp'yi al (yeniden bağlanma sonrası yeni kanal) ve
  // ssh2 callback API'sini Promise'a çevir.
  const pf = (method) => async (...args) => {
    const sftp = await ensure();
    return new Promise((res, rej) => {
      sftp[method](...args, (err, r) => (err ? rej(err) : res(r)));
    });
  };
  const readdir = pf("readdir");
  const stat = pf("stat");
  const realpath = pf("realpath");
  const readFileCb = pf("readFile");
  const mkdirCb = pf("mkdir");
  const renameCb = pf("rename");
  const unlinkCb = pf("unlink");
  const rmdirCb = pf("rmdir");

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
    // Canlı ssh2 Client (docker/disk/tar/tünel için). Yeniden bağlanınca otomatik
    // olarak yeni bağlantıyı gösterir.
    get exec() { return state.conn; },
    // Kabuk komutlarından önce bağlantının canlı olduğundan emin ol (gerekirse
    // yeniden bağlan) ve güncel ssh2 Client'ı döndür.
    async ensureLive() { await ensure(); return state.conn; },
    get alive() { return !!state.conn && !state.dead; },
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
    async writeFile(file, buf) {
      const sftp = await ensure();
      return new Promise((res, rej) => {
        const ws = sftp.createWriteStream(file);
        ws.on("error", rej);
        ws.on("close", res);
        ws.end(buf);
      });
    },
    async downloadTo(writable, file) {
      const sftp = await ensure();
      return new Promise((res, rej) => {
        const rs = sftp.createReadStream(file);
        rs.on("error", rej);
        writable.on("error", rej);
        rs.on("end", res);
        rs.pipe(writable);
      });
    },
    async uploadFrom(buf, dest) {
      const sftp = await ensure();
      return new Promise((res, rej) => {
        const ws = sftp.createWriteStream(dest);
        ws.on("error", rej);
        ws.on("close", res);
        ws.end(buf);
      });
    },
    // Bir Readable'dan akış yazar (RAM'e tüm dosyayı almadan).
    // SFTP tek kanal üzerinden eşzamanlı birden çok akışı destekler → paralel yükleme.
    async uploadStream(readable, dest) {
      const sftp = await ensure();
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
    async end() {
      state.closedByUs = true;
      state.dead = true;
      try { state.conn && state.conn.end(); } catch (_) {}
      try { state.bastion && state.bastion.end(); } catch (_) {}
    },
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

module.exports = { connectRemote, connectSFTP };
