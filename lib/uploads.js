const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Yüklemeler diske (geçici klasöre) akıtılır; tüm dosyalar RAM'e doldurulmaz.
// Böylece büyük dosyalar ve klasörler bellek şişirmeden yüklenir.
const UPLOAD_TMP = path.join(os.tmpdir(), "portpilot-uploads");
try {
  fs.mkdirSync(UPLOAD_TMP, { recursive: true });
} catch (_) {}
const upload = multer({ dest: UPLOAD_TMP });

// Aynı anda kaç dosya yüklensin (SFTP'de gerçek paralellik, FTP'de güvenli sıra)
const UPLOAD_CONCURRENCY = 4;

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

// Geçerli çakışma modları (FileZilla benzeri).
const CONFLICT_MODES = [
  "overwrite",            // her zaman üzerine yaz
  "overwrite_newer",      // kaynak daha yeniyse üzerine yaz, değilse atla
  "overwrite_size",       // boyut farklıysa üzerine yaz, aynıysa atla
  "overwrite_size_newer", // boyut farklı VEYA kaynak daha yeniyse üzerine yaz
  "skip",                 // hedefte varsa atla
  "rename",               // hedefte varsa yeni adla her ikisini tut
];

// Mtime karşılaştırmasında dosya sistemi yuvarlamalarına karşı tolerans (ms).
const MTIME_TOLERANCE = 2000;

// Hedefte aynı ad varsa ne yapılacağına karar verir.
// Döner: "write" (yükle), "skip" (atla) veya "rename" (yeni ad bul).
async function resolveConflict(s, dest, conflict, srcSize, srcMtime) {
  if (conflict === "overwrite") return "write";

  let info = null;
  try { info = await s.fs.statInfo(dest); } catch (_) { info = null; }
  if (!info) return "write"; // hedefte yok → çakışma yok

  if (conflict === "skip") return "skip";
  if (conflict === "rename") return "rename";

  const sizeDiffers =
    Number(srcSize) >= 0 && Number(info.size) >= 0 &&
    Number(srcSize) !== Number(info.size);
  const srcNewer =
    srcMtime > 0 && info.mtime > 0 &&
    srcMtime > info.mtime + MTIME_TOLERANCE;

  let doWrite;
  if (conflict === "overwrite_newer") doWrite = srcNewer;
  else if (conflict === "overwrite_size") doWrite = sizeDiffers;
  else if (conflict === "overwrite_size_newer") doWrite = sizeDiffers || srcNewer;
  else doWrite = true;

  return doWrite ? "write" : "skip";
}

// Geçici yüklenen dosyaları diskten temizle.
function cleanupTemps(files) {
  for (const f of files || []) {
    fs.unlink(f.path, () => {});
  }
}

module.exports = {
  UPLOAD_TMP,
  UPLOAD_CONCURRENCY,
  CONFLICT_MODES,
  upload,
  remoteExists,
  uniqueRemoteName,
  resolveConflict,
  cleanupTemps,
};
