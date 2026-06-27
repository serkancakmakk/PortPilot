// token -> { fs, info, lastUsed }  (fs: protokolden bağımsız uzak dosya sistemi)
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 dk boşta kalma

// Döngüsel require'ı önlemek için tembel yükleme (tunnels → sessions bağımlılığı yok ama tutarlılık için)
let tunnels = null;
function closeTunnels(token) {
  try { (tunnels || (tunnels = require("./tunnels"))).closeAllForToken(token); }
  catch (_) {}
}

// Boşta kalan oturumları temizle
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL) {
      closeTunnels(token);
      try {
        s.fs.end();
      } catch (_) {}
      sessions.delete(token);
    }
  }
}, 60 * 1000).unref();

// İstekten oturumu çözer; yoksa 401 yanıtı yazıp null döner.
function getSession(req, res) {
  const token = req.get("x-session") || req.query.session;
  const s = token && sessions.get(token);
  if (!s) {
    res.status(401).json({
      error: "Oturum bulunamadı veya süresi doldu. Yeniden bağlanın.",
    });
    return null;
  }
  s.lastUsed = Date.now();
  return s;
}

// FTP/FTPS oturumlarında komut çalıştırma (SSH exec) yoktur
function hasExec(s) {
  return !!(s.fs && s.fs.exec);
}

module.exports = { sessions, getSession, hasExec, SESSION_TTL, closeTunnels };
