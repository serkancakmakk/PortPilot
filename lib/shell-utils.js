const path = require("path");

// Kabuk komutlarında güvenli tek-tırnak alıntılama (komut enjeksiyonunu önler)
function shQuote(p) {
  return "'" + String(p).replace(/'/g, "'\\''") + "'";
}

// POSIX yol birleştirme/normalleştirme (uzak sunucu Unix kabul edilir)
function resolveRemote(base, target) {
  const joined =
    target && target.startsWith("/")
      ? target
      : path.posix.join(base || "/", target || "");
  return path.posix.normalize(joined) || "/";
}

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

// Her satırı ayrı JSON nesnesi olan çıktıyı (docker --format '{{json .}}') ayrıştırır
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

module.exports = { shQuote, resolveRemote, runPool, parseJsonLines, SAFE_ID };
