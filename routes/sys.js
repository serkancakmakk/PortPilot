const express = require("express");
const { getSession, hasExec } = require("../lib/sessions");
const { shQuote } = require("../lib/shell-utils");

const router = express.Router();

// Kabuk komutu çalıştır (çıktı + çıkış kodu).
function runCmd(s, cmd) {
  return new Promise((resolve, reject) => {
    if (!hasExec(s)) return reject(new Error("Bu bağlantı kabuk komutlarını desteklemiyor."));
    s.fs.exec.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "", errOut = "";
      stream.on("data", (d) => { out += d; });
      stream.stderr.on("data", (d) => { errOut += d; });
      stream.on("close", (code) => resolve({ code: code || 0, out, err: errOut }));
    });
  });
}

function notSupported(res) {
  return res.json({ available: false });
}

// ---- Açık (dinleyen) portlar ----
router.get("/api/sys/ports", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    // Önce ss, yoksa netstat
    let r = await runCmd(s, "ss -H -tulnp 2>/dev/null || netstat -tulnp 2>/dev/null");
    const items = [];
    for (const line of r.out.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const p = t.split(/\s+/);
      // ss: Netid State R-Q S-Q Local Peer Process | netstat: Proto R-Q S-Q Local Foreign State PID/Program
      let proto = p[0], local = "", procStr = "";
      if (/^(tcp|udp)/i.test(p[0]) && t.includes("users:")) { // ss
        local = p[4] || "";
        const m = t.match(/users:\(\("([^"]+)",pid=(\d+)/);
        procStr = m ? `${m[1]} (${m[2]})` : "";
      } else if (/^(tcp|udp)/i.test(p[0])) { // netstat
        local = p[3] || "";
        const last = p[p.length - 1] || "";
        procStr = last.includes("/") ? last.split("/").slice(1).join("/") + " (" + last.split("/")[0] + ")" : "";
      } else continue;
      const idx = local.lastIndexOf(":");
      if (idx < 0) continue;
      items.push({
        proto: proto.replace(/\d$/, ""),
        addr: local.slice(0, idx),
        port: local.slice(idx + 1),
        process: procStr,
      });
    }
    // Porta göre sırala
    items.sort((a, b) => (Number(a.port) || 0) - (Number(b.port) || 0));
    res.json({ available: true, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Süreçler (en çok CPU) ----
router.get("/api/sys/procs", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    const r = await runCmd(s, "ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu --no-headers 2>/dev/null | head -n 60");
    const items = r.out.split("\n").map((l) => {
      const t = l.trim(); if (!t) return null;
      const p = t.split(/\s+/);
      if (p.length < 5) return null;
      return { pid: p[0], user: p[1], cpu: p[2], mem: p[3], comm: p.slice(4).join(" ") };
    }).filter(Boolean);
    res.json({ available: true, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Süreç sonlandır ----
router.post("/api/sys/kill", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const pid = String(req.body.pid || "");
  if (!/^\d+$/.test(pid)) return res.status(400).json({ error: "Geçersiz PID." });
  const sig = req.body.force ? "-9" : "-15";
  try {
    const r = await runCmd(s, `kill ${sig} ${pid}`);
    if (r.code !== 0) return res.status(400).json({ error: r.err.trim() || "Sonlandırılamadı (yetki gerekebilir)." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- systemd servisleri ----
router.get("/api/sys/services", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    const r = await runCmd(s, "systemctl list-units --type=service --all --no-pager --plain --no-legend 2>/dev/null | head -n 300");
    const items = r.out.split("\n").map((l) => {
      const t = l.replace(/^\s*●?\s*/, "").trim(); if (!t) return null;
      const p = t.split(/\s+/);
      if (p.length < 4) return null;
      return { unit: p[0], load: p[1], active: p[2], sub: p[3], desc: p.slice(4).join(" ") };
    }).filter(Boolean);
    res.json({ available: true, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Servis eylemi (start/stop/restart) ----
router.post("/api/sys/service", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const name = String(req.body.name || "");
  const action = String(req.body.action || "");
  if (!/^[\w@.\-]+$/.test(name)) return res.status(400).json({ error: "Geçersiz servis adı." });
  if (!["start", "stop", "restart"].includes(action)) return res.status(400).json({ error: "Geçersiz eylem." });
  try {
    const r = await runCmd(s, `systemctl ${action} ${shQuote(name)} 2>&1`);
    if (r.code !== 0) return res.status(400).json({ error: (r.out + r.err).trim() || "İşlem başarısız (root/sudo gerekebilir)." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Disk kullanım analizi (klasör bazında boyut) ----
// Verilen yolun doğrudan alt klasör/dosyalarının boyutunu `du` ile döker; en büyükten
// sırala. "hangi klasör diski doldurmuş" sorusunu yanıtlar.
router.get("/api/sys/diskusage", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  const dir = String(req.query.path || "/").trim() || "/";
  try {
    // -b: bayt, --max-depth=1: yalnızca doğrudan çocuklar. Erişilemeyenleri (stderr) yut.
    const r = await runCmd(s, `du -b --max-depth=1 -- ${shQuote(dir)} 2>/dev/null | sort -nr`);
    const lines = r.out.split("\n").map((l) => l.trim()).filter(Boolean);
    let total = 0;
    const items = [];
    const base = dir.replace(/\/+$/, "") || "/";
    for (const line of lines) {
      const m = line.match(/^(\d+)\s+(.*)$/);
      if (!m) continue;
      const bytes = Number(m[1]);
      const p = m[2];
      // İlk satır genelde dizinin kendisi (toplam) → ayır
      if (p === base || p === dir || p === base + "/") { total = bytes; continue; }
      const name = p.split("/").filter(Boolean).pop() || p;
      items.push({ name, path: p, size: bytes });
    }
    if (!total) total = items.reduce((a, b) => a + b.size, 0);
    res.json({ available: true, path: base, total, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Log kuyruğu (dosya tail) ----
router.get("/api/sys/logtail", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  const file = String(req.query.path || "").trim();
  let lines = parseInt(req.query.lines, 10);
  if (!Number.isFinite(lines)) lines = 200;
  lines = Math.min(2000, Math.max(10, lines));
  if (!file) return res.status(400).json({ error: "Dosya yolu gerekli." });
  try {
    const r = await runCmd(s, `tail -n ${lines} -- ${shQuote(file)} 2>&1`);
    res.json({ available: true, text: r.out, code: r.code });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

module.exports = router;
