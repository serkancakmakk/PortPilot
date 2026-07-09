const { readPrefs } = require("./prefs-store");

// token -> { fs, info, lastUsed }  (fs: protokolden bağımsız uzak dosya sistemi)
const sessions = new Map();
const DEFAULT_IDLE_TIMEOUT_MIN = 30;
const MAX_IDLE_TIMEOUT_MIN = 24 * 60;

function normalizeIdleTimeoutMin(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_IDLE_TIMEOUT_MIN;
  return Math.max(0, Math.min(MAX_IDLE_TIMEOUT_MIN, Math.round(n)));
}

function getSessionPrefs() {
  const sessionPrefs = (readPrefs().session || {});
  return {
    idleTimeoutMin: normalizeIdleTimeoutMin(sessionPrefs.idleTimeoutMin),
  };
}

function getSessionTtlMs() {
  const min = getSessionPrefs().idleTimeoutMin;
  return min > 0 ? min * 60 * 1000 : 0;
}

// Döngüsel require'ı önlemek için tembel yükleme (tunnels → sessions bağımlılığı yok ama tutarlılık için)
let tunnels = null;
function closeTunnels(token) {
  try { (tunnels || (tunnels = require("./tunnels"))).closeAllForToken(token); }
  catch (_) {}
}

// Boşta kalan oturumları temizle
setInterval(() => {
  const ttl = getSessionTtlMs();
  if (!ttl) return;
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.lastUsed > ttl) {
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

module.exports = {
  sessions,
  getSession,
  hasExec,
  closeTunnels,
  DEFAULT_IDLE_TIMEOUT_MIN,
  MAX_IDLE_TIMEOUT_MIN,
  getSessionPrefs,
  getSessionTtlMs,
};
