"use strict";

// SSH yerel port yönlendirme (local tunnel) yöneticisi.
// Her tünel: PortPilot'un çalıştığı makinede bir TCP dinleyici açar; gelen her
// bağlantıyı, oturumun ssh2 Client'ı üzerinden conn.forwardOut ile uzak hedefe
// (remoteHost:remotePort) aktarır. Böylece "localhost:localPort" → sunucu ağındaki
// bir servise (DB, dahili panel vb.) güvenli tünel olur.
//
// Masaüstü (Electron) modunda dinleyici kullanıcı makinesinde açılır → tarayıcı/DB
// aracından doğrudan localhost ile erişilir.

const net = require("net");
const crypto = require("crypto");

// token -> Map<id, tunnel>
const byToken = new Map();

function idFor() { return crypto.randomBytes(6).toString("hex"); }

function listFor(token) {
  const m = byToken.get(token);
  if (!m) return [];
  return [...m.values()].map((t) => ({
    id: t.id,
    localHost: t.localHost,
    localPort: t.localPort,
    remoteHost: t.remoteHost,
    remotePort: t.remotePort,
    conns: t.conns,
    bytesUp: t.bytesUp,
    bytesDown: t.bytesDown,
    error: t.error || null,
    createdAt: t.createdAt,
  }));
}

// Tünel aç. Promise: { id, localPort } veya hata fırlatır.
// getConn: o anki canlı ssh2 Client'ı döndüren fonksiyon (yeniden bağlanmaya dayanır)
//          ya da doğrudan conn nesnesi.
function open(token, getConn, opts) {
  const liveConn = () => (typeof getConn === "function" ? getConn() : getConn);
  const localHost = opts.localHost || "127.0.0.1";
  const localPort = Number(opts.localPort) || 0; // 0 → işletim sistemi boş port seçer
  const remoteHost = String(opts.remoteHost || "127.0.0.1");
  const remotePort = Number(opts.remotePort);
  if (!remotePort || remotePort < 1 || remotePort > 65535)
    return Promise.reject(new Error("Geçersiz uzak port."));
  if (localPort && (localPort < 1 || localPort > 65535))
    return Promise.reject(new Error("Geçersiz yerel port."));

  return new Promise((resolve, reject) => {
    const tunnel = {
      id: idFor(), localHost, localPort, remoteHost, remotePort,
      conns: 0, bytesUp: 0, bytesDown: 0, error: null,
      createdAt: Date.now(), sockets: new Set(), server: null,
    };

    const server = net.createServer((socket) => {
      tunnel.conns++;
      tunnel.sockets.add(socket);
      socket.on("close", () => { tunnel.sockets.delete(socket); });
      socket.on("error", () => { try { socket.destroy(); } catch (_) {} });

      const conn = liveConn();
      if (!conn) { tunnel.error = "Bağlantı yok."; try { socket.destroy(); } catch (_) {} return; }
      conn.forwardOut(
        socket.remoteAddress || "127.0.0.1",
        socket.remotePort || 0,
        remoteHost,
        remotePort,
        (err, stream) => {
          if (err) {
            tunnel.error = err.message;
            try { socket.destroy(); } catch (_) {}
            return;
          }
          stream.on("error", () => { try { socket.destroy(); } catch (_) {} });
          socket.on("data", (d) => { tunnel.bytesUp += d.length; });
          stream.on("data", (d) => { tunnel.bytesDown += d.length; });
          socket.pipe(stream).pipe(socket);
        },
      );
    });

    server.on("error", (err) => {
      const msg = err.code === "EADDRINUSE"
        ? `Yerel port ${localPort} zaten kullanımda.`
        : err.message;
      reject(new Error(msg));
    });

    server.listen(localPort, localHost, () => {
      tunnel.localPort = server.address().port;
      tunnel.server = server;
      let m = byToken.get(token);
      if (!m) { m = new Map(); byToken.set(token, m); }
      m.set(tunnel.id, tunnel);
      resolve({ id: tunnel.id, localPort: tunnel.localPort, localHost });
    });
  });
}

function closeTunnel(token, id) {
  const m = byToken.get(token);
  const t = m && m.get(id);
  if (!t) return false;
  try { t.server.close(); } catch (_) {}
  for (const s of t.sockets) { try { s.destroy(); } catch (_) {} }
  m.delete(id);
  if (m.size === 0) byToken.delete(token);
  return true;
}

// Bir oturuma ait tüm tünelleri kapat (disconnect / oturum zaman aşımı).
function closeAllForToken(token) {
  const m = byToken.get(token);
  if (!m) return;
  for (const t of m.values()) {
    try { t.server.close(); } catch (_) {}
    for (const s of t.sockets) { try { s.destroy(); } catch (_) {} }
  }
  byToken.delete(token);
}

module.exports = { open, listFor, closeTunnel, closeAllForToken };
