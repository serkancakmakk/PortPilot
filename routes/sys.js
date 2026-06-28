const express = require("express");
const { getSession, hasExec } = require("../lib/sessions");
const { shQuote } = require("../lib/shell-utils");
const { logFromSession } = require("../lib/audit");

const router = express.Router();

// Kabuk komutu çalıştır (çıktı + çıkış kodu).
function runCmd(s, cmd) {
  return new Promise((resolve, reject) => {
    if (!hasExec(s)) return reject(new Error("Bu bağlantı kabuk komutlarını desteklemiyor."));
    const run = (conn) => conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "", errOut = "";
      stream.on("data", (d) => { out += d; });
      stream.stderr.on("data", (d) => { errOut += d; });
      stream.on("close", (code) => resolve({ code: code || 0, out, err: errOut }));
    });
    // Bağlantı koptuysa şeffaf yeniden bağlan, sonra çalıştır
    (s.fs.ensureLive ? s.fs.ensureLive() : Promise.resolve(s.fs.exec)).then(run).catch(reject);
  });
}

function notSupported(res) {
  return res.json({ available: false });
}

// ---- Web sunucusu (Nginx / Apache) tespit + site/vhost listesi ----
router.get("/api/sys/web", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  const script = [
    'echo "##NGINX##"',
    'if command -v nginx >/dev/null 2>&1; then',
    '  echo "installed=1"',
    '  echo "active=$(systemctl is-active nginx 2>/dev/null)"',
    '  echo "version=$(nginx -v 2>&1 | sed \'s#.*nginx/##; s#nginx version: ##\')"',
    '  echo "##AVAIL##"; ls -1 /etc/nginx/sites-available/ 2>/dev/null',
    '  echo "##ENABLED##"; ls -1 /etc/nginx/sites-enabled/ 2>/dev/null',
    'fi',
    'echo "##APACHE##"',
    'if command -v apache2 >/dev/null 2>&1; then',
    '  echo "installed=1"; echo "bin=apache2"',
    '  echo "active=$(systemctl is-active apache2 2>/dev/null)"',
    '  echo "version=$(apache2 -v 2>/dev/null | sed -n \'1s#.*Apache/##; 1s# .*##p\')"',
    '  echo "##AVAIL##"; ls -1 /etc/apache2/sites-available/ 2>/dev/null',
    '  echo "##ENABLED##"; ls -1 /etc/apache2/sites-enabled/ 2>/dev/null',
    'elif command -v httpd >/dev/null 2>&1; then',
    '  echo "installed=1"; echo "bin=httpd"',
    '  echo "active=$(systemctl is-active httpd 2>/dev/null)"',
    '  echo "version=$(httpd -v 2>/dev/null | sed -n \'1s#.*Apache/##; 1s# .*##p\')"',
    '  echo "##AVAIL##"; ls -1 /etc/httpd/conf.d/ 2>/dev/null',
    '  echo "##ENABLED##"; ls -1 /etc/httpd/conf.d/ 2>/dev/null',
    'fi',
  ].join("; ");
  try {
    const r = await runCmd(s, script);
    res.json({ available: true, servers: parseWeb(r.out || "") });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

function parseWeb(out) {
  const blocks = { nginx: "", apache: "" };
  let cur = null;
  for (const raw of out.split("\n")) {
    if (raw.startsWith("##NGINX##")) { cur = "nginx"; continue; }
    if (raw.startsWith("##APACHE##")) { cur = "apache"; continue; }
    if (cur) blocks[cur] += raw + "\n";
  }
  const servers = [];
  const dirFor = { nginx: "/etc/nginx/sites-available", apache: "/etc/apache2/sites-available" };
  for (const kind of ["nginx", "apache"]) {
    const b = blocks[kind];
    if (!/installed=1/.test(b)) continue;
    const parts = b.split(/##AVAIL##\n?/);
    const head = parts[0] || "";
    const rest = (parts[1] || "").split(/##ENABLED##\n?/);
    const availNames = (rest[0] || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const enabledNames = new Set((rest[1] || "").split("\n").map((x) => x.trim()).filter(Boolean));
    const get = (k) => { const m = head.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
    const bin = get("bin") || (kind === "nginx" ? "nginx" : "apache2");
    const baseDir = kind === "apache"
      ? (bin === "httpd" ? "/etc/httpd/conf.d" : "/etc/apache2/sites-available")
      : dirFor.nginx;
    const sites = availNames
      .filter((n) => !n.startsWith("##"))
      .map((name) => ({
        name,
        enabled: kind === "apache" && bin === "httpd" ? true : enabledNames.has(name),
        path: `${baseDir}/${name}`,
      }));
    servers.push({
      kind, bin, installed: true,
      active: get("active") || "unknown",
      version: get("version") || "",
      toggleable: !(kind === "apache" && bin === "httpd"), // httpd conf.d aç/kapat yok
      sites,
    });
  }
  return servers;
}

// ---- Web sunucusu işlemi: enable/disable/reload/restart/test ----
const SITE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
router.post("/api/sys/web-action", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return res.status(400).json({ error: "Bu bağlantıda kullanılamaz." });
  const kind = req.body.kind === "apache" ? "apache" : "nginx";
  const bin = req.body.bin === "httpd" ? "httpd" : (kind === "apache" ? "apache2" : "nginx");
  const action = String(req.body.action || "");
  const svc = kind === "nginx" ? "nginx" : bin;
  let cmd = null;

  if (action === "test") {
    cmd = kind === "nginx" ? "nginx -t" : `${bin === "httpd" ? "httpd" : "apache2ctl"} configtest`;
  } else if (action === "reload" || action === "restart") {
    cmd = `systemctl ${action} ${svc}`;
  } else if (action === "enable" || action === "disable") {
    const site = String(req.body.site || "");
    if (!SITE_NAME.test(site)) return res.status(400).json({ error: "Geçersiz site adı." });
    if (kind === "nginx") {
      cmd = action === "enable"
        ? `ln -sf /etc/nginx/sites-available/${shQuote(site)} /etc/nginx/sites-enabled/${shQuote(site)}`
        : `rm -f /etc/nginx/sites-enabled/${shQuote(site)}`;
    } else {
      cmd = `${action === "enable" ? "a2ensite" : "a2dissite"} ${shQuote(site)}`;
    }
  } else {
    return res.status(400).json({ error: "Geçersiz işlem." });
  }

  try {
    const r = await runCmd(s, `sudo -n ${cmd} 2>&1 || ${cmd} 2>&1`);
    const txt = (r.out + r.err);
    const low = txt.toLowerCase();
    const denied = low.includes("permission denied") || low.includes("must be run as root") || low.includes("you need to be root");
    if (denied) return res.status(400).json({ error: "Yetki gerekiyor (root ya da parolasız sudo)." });
    // test başarısızsa code != 0 olur; çıktıyı kullanıcıya göster
    res.json({ ok: r.code === 0, code: r.code, output: txt.trim().slice(0, 1200) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Firewall (ufw) durumu + kuralları ----
router.get("/api/sys/ufw", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);
  try {
    // ufw kurulu mu? Kuralları numaralı al (root/sudo gerekir)
    const r = await runCmd(s,
      "command -v ufw >/dev/null 2>&1 || { echo '##NOUFW##'; exit 0; }; " +
      "sudo -n ufw status numbered 2>/dev/null || ufw status numbered 2>/dev/null || echo '##NOPERM##'");
    const out = r.out || "";
    if (out.includes("##NOUFW##")) return res.json({ available: true, installed: false });
    if (out.includes("##NOPERM##") || !out.trim())
      return res.json({ available: true, installed: true, permission: false });

    const active = /Status:\s*active/i.test(out);
    const rules = [];
    for (const line of out.split("\n")) {
      // [ 1] 22/tcp                     ALLOW IN    Anywhere
      const m = line.match(/^\s*\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)?\s*(.*)$/i);
      if (!m) continue;
      rules.push({
        num: Number(m[1]),
        to: m[2].trim(),
        action: m[3].toUpperCase(),
        dir: (m[4] || "IN").toUpperCase(),
        from: (m[5] || "").trim() || "Anywhere",
      });
    }
    res.json({ available: true, installed: true, permission: true, active, rules });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// ---- Firewall (ufw) işlemi: allow/deny/delete/enable/disable ----
const UFW_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9/:._-]{0,40}$/; // port, port/proto, servis adı
router.post("/api/sys/ufw-action", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return res.status(400).json({ error: "Bu bağlantıda kullanılamaz." });
  const action = String(req.body.action || "");
  let cmd = null;
  if (action === "allow" || action === "deny") {
    const v = String(req.body.value || "").trim();
    if (!UFW_VALUE.test(v)) return res.status(400).json({ error: "Geçersiz port/servis." });
    cmd = `ufw ${action} ${shQuote(v)}`;
  } else if (action === "delete") {
    const n = parseInt(req.body.num, 10);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: "Geçersiz kural numarası." });
    cmd = `yes | ufw delete ${n}`;
  } else if (action === "enable" || action === "disable") {
    cmd = `ufw --force ${action}`;
  } else {
    return res.status(400).json({ error: "Geçersiz işlem." });
  }
  try {
    const r = await runCmd(s, `sudo -n ${cmd} 2>&1 || ${cmd} 2>&1`);
    const txt = (r.out + r.err).toLowerCase();
    if (r.code !== 0 || txt.includes("permission denied") || txt.includes("you need to be root"))
      return res.status(400).json({ error: "Yetki gerekiyor (root ya da parolasız sudo). " + (r.out || r.err).trim().slice(0, 200) });
    res.json({ ok: true, output: (r.out || "").trim().slice(0, 300) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

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

// ---- Cron: sunucudaki TÜM cron'ları topla (sistem + tüm kullanıcılar + systemd timer) ----
// Çoğu kaynak (cron.d, diğer kullanıcı crontab'ları) root yetkisi ister; yetki yoksa
// o bölüm boş gelir — hata değildir.
router.get("/api/sys/cron-all", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  if (!hasExec(s)) return notSupported(res);

  // Bölüm işaretleyicileriyle tek seferde tüm kaynakları oku.
  const script = [
    'echo "##SEC:system##"; cat /etc/crontab 2>/dev/null',
    'echo "##SEC:crond##"; for f in /etc/cron.d/*; do [ -f "$f" ] && echo "##FILE:$f##" && cat "$f"; done 2>/dev/null',
    'echo "##SEC:periodic##"; for d in hourly daily weekly monthly; do for f in /etc/cron.$d/*; do [ -f "$f" ] && echo "$d:$f"; done; done 2>/dev/null',
    'echo "##SEC:users##"; for D in /var/spool/cron/crontabs /var/spool/cron; do [ -d "$D" ] && for f in "$D"/*; do [ -f "$f" ] && echo "##FILE:$f##" && cat "$f"; done; done 2>/dev/null',
    'echo "##SEC:timers##"; systemctl list-timers --all --no-pager 2>/dev/null',
  ].join("; ");

  try {
    const r = await runCmd(s, script);
    res.json({ available: true, ...parseCronAll(r.out) });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

// Tek bir cron satırını {schedule, command} olarak ayrıştırır.
// hasUser=true ise (sistem crontab / cron.d) 6. alan kullanıcı adıdır.
function parseCronLine(line, hasUser) {
  const t = line.replace(/\r$/, "");
  const sn = (x) => x.trim().replace(/\s+/g, " "); // zamanlama alanını sadeleştir
  if (!t.trim()) return null;
  if (t.trim().startsWith("#")) return { comment: true, raw: t.trim() };
  // Ortam değişkeni satırı: FOO=bar (zamanlama hiçbir zaman "kelime=" ile başlamaz)
  if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(t)) return { env: true, raw: t.trim() };
  let m;
  if ((m = t.match(/^\s*(@\w+)\s+(?:(\S+)\s+)?(.*)$/)) && hasUser) {
    return { schedule: m[1], user: m[2] || "", command: m[3].trim() };
  }
  if ((m = t.match(/^\s*(@\w+)\s+(.*)$/))) {
    return { schedule: m[1], command: m[2].trim() };
  }
  if (hasUser && (m = t.match(/^\s*((?:\S+\s+){5})(\S+)\s+(.*)$/))) {
    return { schedule: sn(m[1]), user: m[2], command: m[3].trim() };
  }
  if ((m = t.match(/^\s*((?:\S+\s+){5})(.*)$/))) {
    return { schedule: sn(m[1]), command: m[2].trim() };
  }
  return { command: t.trim() };
}

function parseCronAll(out) {
  const sections = { system: "", crond: "", periodic: "", users: "", timers: "" };
  let cur = null;
  for (const raw of out.split("\n")) {
    const sm = raw.match(/^##SEC:(\w+)##/);
    if (sm) { cur = sm[1]; continue; }
    if (cur && cur in sections) sections[cur] += raw + "\n";
  }

  const groups = [];
  let total = 0;

  // Dosya bazlı bölümleri (##FILE:yol## ile ayrılmış) gruplara böler.
  function fileGroups(text, hasUser, sourceLabel) {
    const parts = text.split(/^##FILE:(.+?)##$/m);
    // parts: ["", path1, body1, path2, body2, ...] ya da hiç dosya yoksa ["body"]
    if (parts.length === 1) {
      const jobs = collectJobs(parts[0], hasUser);
      if (jobs.length) { groups.push({ source: sourceLabel, file: "", jobs }); total += jobs.length; }
      return;
    }
    for (let i = 1; i < parts.length; i += 2) {
      const file = parts[i], body = parts[i + 1] || "";
      const jobs = collectJobs(body, hasUser);
      if (jobs.length) { groups.push({ source: sourceLabel, file, jobs }); total += jobs.length; }
    }
  }

  function collectJobs(text, hasUser) {
    const jobs = [];
    for (const line of text.split("\n")) {
      const p = parseCronLine(line, hasUser);
      if (p && !p.comment && !p.env && p.command) jobs.push(p);
    }
    return jobs;
  }

  // /etc/crontab (kullanıcı alanlı)
  fileGroups(sections.system, true, "/etc/crontab");
  // /etc/cron.d/*
  fileGroups(sections.crond, true, "cron.d");
  // kullanıcı crontab'ları (/var/spool/cron…)
  fileGroups(sections.users, false, "kullanıcı crontab");

  // /etc/cron.{hourly,daily,weekly,monthly} — betik listesi
  const periodic = [];
  for (const line of sections.periodic.split("\n")) {
    const t = line.trim();
    if (!t || !t.includes(":")) continue;
    const idx = t.indexOf(":");
    periodic.push({ when: t.slice(0, idx), file: t.slice(idx + 1) });
  }

  // systemd timer'ları (ham metin — okunaklı tablo)
  const timersRaw = sections.timers.trim();
  let timerCount = 0;
  if (timersRaw) {
    const tl = timersRaw.split("\n").filter((l) => l.trim());
    // Son satır genelde "N timers listed." özetidir
    const summary = tl[tl.length - 1] || "";
    const m = summary.match(/(\d+)\s+timers?\s+listed/i);
    timerCount = m ? Number(m[1]) : Math.max(0, tl.length - 2);
  }

  return {
    groups,
    periodic,
    timersRaw,
    timerCount,
    total,
    counts: { tasks: total, periodic: periodic.length, timers: timerCount },
  };
}

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
    logFromSession(s, "chown", `${spec} ${target}${req.body.recursive ? " -R" : ""}`);
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
