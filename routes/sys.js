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

// ---- Cron: kullanıcının crontab'ını oku ----
router.get("/api/sys/cron", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    const r = await runCmd(s, "crontab -l 2>/dev/null; echo \"##EXIT$?##\"");
    // crontab -l boşsa çıkış kodu 1 olur ama bu "tablo yok" demektir, hata değil.
    const text = r.out.replace(/##EXIT\d+##\s*$/, "");
    const lines = text.split("\n").map((raw, i) => {
      const line = raw.replace(/\r$/, "");
      if (!line.trim()) return null;
      const comment = line.trim().startsWith("#");
      let schedule = "", command = "", isEnv = false;
      if (!comment) {
        const m = line.match(/^\s*(@\w+|(?:\S+\s+){5})(.*)$/);
        if (m) { schedule = m[1].trim(); command = m[2].trim(); }
        else { isEnv = true; command = line.trim(); } // VAR=deger satırı
      }
      return { i, raw: line, comment, schedule, command, isEnv };
    }).filter(Boolean);
    res.json({ available: true, raw: text, lines });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Cron: crontab'ı kaydet (tüm içeriği değiştirir) ----
router.post("/api/sys/cron", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return res.status(400).json({ error: "Bu bağlantıda kullanılamaz." });
  let content = String(req.body.content || "");
  if (content && !content.endsWith("\n")) content += "\n";
  // Yeni satır/tırnak sorununu önlemek için base64 ile aktar.
  const b64 = Buffer.from(content, "utf8").toString("base64");
  try {
    const r = await runCmd(s, `printf %s ${shQuote(b64)} | base64 -d | crontab - 2>&1`);
    if (r.code !== 0) return res.status(400).json({ error: (r.out + r.err).trim() || "Crontab kaydedilemedi." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Kullanıcılar (/etc/passwd) ----
router.get("/api/sys/users", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    const r = await runCmd(s, "getent passwd 2>/dev/null || cat /etc/passwd 2>/dev/null");
    const items = r.out.split("\n").map((l) => {
      const p = l.split(":");
      if (p.length < 7) return null;
      const uid = Number(p[2]);
      return {
        name: p[0], uid, gid: Number(p[3]), gecos: p[4] || "",
        home: p[5] || "", shell: p[6] || "",
        system: uid < 1000 && uid !== 0, // 0=root, <1000 sistem hesabı
        login: !/(nologin|false)$/.test(p[6] || ""),
      };
    }).filter(Boolean);
    items.sort((a, b) => a.uid - b.uid);
    res.json({ available: true, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Gruplar (/etc/group) ----
router.get("/api/sys/groups", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    const r = await runCmd(s, "getent group 2>/dev/null || cat /etc/group 2>/dev/null");
    const items = r.out.split("\n").map((l) => {
      const p = l.split(":");
      if (p.length < 4) return null;
      return { name: p[0], gid: Number(p[2]), members: (p[3] || "").split(",").filter(Boolean) };
    }).filter(Boolean);
    items.sort((a, b) => a.gid - b.gid);
    res.json({ available: true, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Sahiplik değiştir (chown) ----
router.post("/api/sys/chown", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const target = String(req.body.path || "").trim();
  const owner = String(req.body.owner || "").trim();
  const group = String(req.body.group || "").trim();
  if (!target) return res.status(400).json({ error: "Yol gerekli." });
  if (!owner && !group) return res.status(400).json({ error: "Sahip ve/veya grup gerekli." });
  const ok = /^[\w.\-]+$/;
  if (owner && !ok.test(owner)) return res.status(400).json({ error: "Geçersiz kullanıcı adı." });
  if (group && !ok.test(group)) return res.status(400).json({ error: "Geçersiz grup adı." });
  const spec = group ? `${owner}:${group}` : owner;
  const rec = req.body.recursive ? "-R " : "";
  try {
    const r = await runCmd(s, `chown ${rec}-- ${shQuote(spec)} ${shQuote(target)} 2>&1`);
    if (r.code !== 0) return res.status(400).json({ error: (r.out + r.err).trim() || "Sahiplik değiştirilemedi (root gerekebilir)." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Kullanıcı ekle (useradd) ----
router.post("/api/sys/useradd", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const name = String(req.body.name || "").trim();
  if (!/^[a-z_][a-z0-9_\-]{0,31}$/.test(name)) return res.status(400).json({ error: "Geçersiz kullanıcı adı." });
  const home = req.body.createHome === false ? "-M" : "-m";
  const grp = String(req.body.group || "").trim();
  const grpArg = grp && /^[\w.\-]+$/.test(grp) ? ` -g ${shQuote(grp)}` : "";
  try {
    const r = await runCmd(s, `useradd ${home}${grpArg} ${shQuote(name)} 2>&1`);
    if (r.code !== 0) return res.status(400).json({ error: (r.out + r.err).trim() || "Kullanıcı eklenemedi (root gerekebilir)." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- SSH: yetkili anahtarları listele ----
router.get("/api/sys/sshkeys", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    const r = await runCmd(s, "cat ~/.ssh/authorized_keys 2>/dev/null");
    const items = r.out.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
      const p = l.split(/\s+/);
      // tip anahtar yorum  (yorum genelde son alan)
      return { type: p[0] || "", comment: p.slice(2).join(" ") || "", fingerprint: (p[1] || "").slice(0, 16) + "…" };
    });
    res.json({ available: true, items });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- SSH: anahtar üret + authorized_keys'e kur (parolasız giriş) ----
// Sunucuda ed25519 anahtar çifti üretir, açık anahtarı authorized_keys'e ekler ve
// özel anahtarı döndürür → kullanıcı bağlantıya kaydedip parolasız bağlanır.
router.post("/api/sys/ssh-setup", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return res.status(400).json({ error: "Bu bağlantıda kullanılamaz." });
  const comment = String(req.body.comment || "portpilot").replace(/[^\w@.\-]/g, "") || "portpilot";
  const kf = "~/.ssh/portpilot_ed25519";
  const script = [
    "set -e",
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh",
    `[ -f ${kf} ] || ssh-keygen -t ed25519 -N '' -C ${shQuote(comment)} -f ${kf} >/dev/null`,
    `touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`,
    `grep -qxF "$(cat ${kf}.pub)" ~/.ssh/authorized_keys || cat ${kf}.pub >> ~/.ssh/authorized_keys`,
    `echo '##PRIV##'; cat ${kf}; echo '##PUB##'; cat ${kf}.pub`,
  ].join("\n");
  try {
    const r = await runCmd(s, script + " 2>&1");
    if (r.code !== 0 || !r.out.includes("##PRIV##"))
      return res.status(400).json({ error: r.out.trim() || r.err.trim() || "Anahtar kurulamadı." });
    const priv = (r.out.split("##PRIV##")[1] || "").split("##PUB##")[0].trim();
    const pub = (r.out.split("##PUB##")[1] || "").trim();
    res.json({ ok: true, privateKey: priv + "\n", publicKey: pub });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
