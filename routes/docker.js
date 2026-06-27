const express = require("express");
const { getSession, hasExec } = require("../lib/sessions");
const { shQuote, parseJsonLines, SAFE_ID } = require("../lib/shell-utils");

const router = express.Router();

// Docker komutu çalıştırır; FTP bağlantısında hata döner
function dockerExec(s, cmd, cb) {
  if (!hasExec(s))
    return cb(new Error("Bu protokolde (FTP) komut çalıştırılamaz."));
  const run = (conn) => conn.exec(cmd, (err, stream) => {
    if (err) return cb(err);
    let out = "", errout = "";
    stream.on("data", (d) => { out += d; });
    stream.stderr.on("data", (d) => { errout += d; });
    stream.on("close", (code) => cb(null, { code, out, errout }));
  });
  // Bağlantı koptuysa şeffaf yeniden bağlan, sonra çalıştır
  (s.fs.ensureLive ? s.fs.ensureLive() : Promise.resolve(s.fs.exec)).then(run).catch(cb);
}

function dockerUnavailable(r) {
  const t = (r.errout + r.out).toLowerCase();
  return (
    r.code !== 0 &&
    (t.includes("command not found") ||
      t.includes("not found") ||
      t.includes("cannot connect") ||
      t.includes("permission denied") ||
      t.includes("docker daemon"))
  );
}

// ---- Konteyner listesi ----
router.get("/api/docker/ps", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker ps -a --no-trunc --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const containers = parseJsonLines(r.out).map((c) => {
      const m = /com\.docker\.compose\.project=([^,]+)/.exec(c.Labels || "");
      return {
        id: c.ID, name: c.Names, image: c.Image, status: c.Status,
        state: c.State || (/^up/i.test(c.Status) ? "running" : "exited"),
        ports: c.Ports || "", created: c.CreatedAt || c.RunningFor || "",
        group: m ? m[1] : "",
      };
    });
    res.json({ available: true, containers });
  });
});

// ---- Canlı kaynak kullanımı ----
router.get("/api/docker/stats", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker stats --no-stream --no-trunc --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const stats = parseJsonLines(r.out).map((x) => ({
      id: x.ID, name: x.Name, cpu: x.CPUPerc || "", mem: x.MemUsage || "",
      memPerc: x.MemPerc || "", netIO: x.NetIO || "", blockIO: x.BlockIO || "", pids: x.PIDs || "",
    }));
    res.json({ available: true, stats });
  });
});

// ---- Boşta / eski konteynerler ----
router.get("/api/docker/idle", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const cmd = "docker ps -aq --no-trunc | xargs -r docker inspect --format '{{json .}}'";
  dockerExec(s, cmd, (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const now = Date.now();
    const parseTs = (v) => {
      const t = Date.parse(v);
      return Number.isFinite(t) && t > 0 ? t : 0;
    };
    const containers = parseJsonLines(r.out).map((c) => {
      const st = c.State || {}, cfg = c.Config || {};
      const running = !!st.Running;
      const created = parseTs(c.Created);
      const startedAt = parseTs(st.StartedAt);
      const finishedAt = parseTs(st.FinishedAt);
      const lastActivity = running ? startedAt || created : finishedAt || created;
      return {
        id: (c.Id || "").slice(0, 12), name: (c.Name || "").replace(/^\//, ""),
        image: cfg.Image || "", running, status: st.Status || (running ? "running" : "exited"),
        created, startedAt, finishedAt, restartCount: c.RestartCount || 0,
        cmd: Array.isArray(cfg.Cmd) ? cfg.Cmd.join(" ") : "",
        lastActivity, idleMs: lastActivity ? now - lastActivity : 0,
      };
    });
    containers.sort((a, b) => b.idleMs - a.idleMs);
    res.json({ available: true, containers, now });
  });
});

// ---- Temizlik (prune) ----
const PRUNE_CMDS = {
  containers: "docker container prune -f",
  images: "docker image prune -f",
};
router.post("/api/docker/prune", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const cmd = PRUNE_CMDS[req.body && req.body.what];
  if (!cmd) return res.status(400).json({ error: "Geçersiz temizlik türü." });
  dockerExec(s, cmd + " 2>&1", (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    if (r.code !== 0)
      return res.status(400).json({ error: (r.out || "Temizlik başarısız").trim() });
    res.json({ ok: true, output: (r.out || "").trim() });
  });
});

// ---- Görüntü (image) listesi ----
router.get("/api/docker/images", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  dockerExec(s, "docker images --format '{{json .}}'", (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const images = parseJsonLines(r.out).map((i) => ({
      id: i.ID, repo: i.Repository, tag: i.Tag, size: i.Size,
      created: i.CreatedSince || i.CreatedAt || "",
    }));
    res.json({ available: true, images });
  });
});

// ---- Konteyner logları ----
router.get("/api/docker/logs", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const id = req.query.id;
  if (!id || !SAFE_ID.test(id))
    return res.status(400).json({ error: "Geçersiz kimlik." });
  // tail: "all" ya da 1..50000 arası sayı; geçersizse 400
  let tail = "400";
  const t = String(req.query.tail || "").trim();
  if (t === "all") tail = "all";
  else if (/^\d+$/.test(t)) tail = String(Math.min(Math.max(parseInt(t, 10), 1), 50000));
  dockerExec(s, `docker logs --tail ${tail} --timestamps ${shQuote(id)} 2>&1`, (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ logs: r.out || "(log yok)" });
  });
});

// ---- Eylem: start/stop/restart/rm/pause/unpause/kill/rmi ----
const CONTAINER_ACTIONS = {
  start: "start", stop: "stop", restart: "restart",
  pause: "pause", unpause: "unpause", kill: "kill", rm: "rm -f",
};
router.post("/api/docker/action", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { type, id, action } = req.body || {};
  if (!id || !SAFE_ID.test(id))
    return res.status(400).json({ error: "Geçersiz kimlik." });
  let cmd;
  if (type === "image") {
    if (action !== "rmi")
      return res.status(400).json({ error: "Geçersiz işlem." });
    cmd = `docker rmi ${shQuote(id)}`;
  } else {
    const sub = CONTAINER_ACTIONS[action];
    if (!sub) return res.status(400).json({ error: "Geçersiz işlem." });
    cmd = `docker ${sub} ${shQuote(id)}`;
  }
  dockerExec(s, cmd + " 2>&1", (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    if (r.code !== 0)
      return res.status(400).json({ error: (r.out || r.errout || "İşlem başarısız").trim() });
    res.json({ ok: true, output: r.out.trim() });
  });
});

// ---- Docker Compose: stack (proje) listesi ----
// `docker ps` etiketlerinden compose projelerini grupla. Her proje için çalışan/
// toplam konteyner sayısı ve working_dir (compose dosyasının yeri) çıkar.
router.get("/api/docker/compose", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const cmd = "docker ps -aq --no-trunc | xargs -r docker inspect --format '{{json .}}'";
  dockerExec(s, cmd, (err, r) => {
    if (err) return res.json({ available: false, error: err.message });
    if (dockerUnavailable(r))
      return res.json({ available: false, error: (r.errout || "Docker bulunamadı").trim() });
    const projects = new Map();
    for (const c of parseJsonLines(r.out)) {
      const labels = (c.Config && c.Config.Labels) || {};
      const proj = labels["com.docker.compose.project"];
      if (!proj) continue;
      const dir = labels["com.docker.compose.project.working_dir"] || "";
      const file = labels["com.docker.compose.project.config_files"] || "";
      const running = !!(c.State && c.State.Running);
      if (!projects.has(proj)) projects.set(proj, { name: proj, dir, file, total: 0, running: 0, services: new Set() });
      const p = projects.get(proj);
      p.total++; if (running) p.running++;
      const svc = labels["com.docker.compose.service"];
      if (svc) p.services.add(svc);
      if (!p.dir && dir) p.dir = dir;
      if (!p.file && file) p.file = file;
    }
    const list = [...projects.values()].map((p) => ({
      name: p.name, dir: p.dir, file: p.file, total: p.total, running: p.running,
      services: [...p.services].sort(),
    })).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ available: true, projects: list });
  });
});

// ---- Docker Compose: stack eylemi (up/down/restart/stop/start/pull) ----
const COMPOSE_ACTIONS = {
  up: "up -d", down: "down", restart: "restart", stop: "stop", start: "start", pull: "pull",
};
router.post("/api/docker/compose-action", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { dir, action } = req.body || {};
  const sub = COMPOSE_ACTIONS[action];
  if (!sub) return res.status(400).json({ error: "Geçersiz işlem." });
  if (!dir || typeof dir !== "string") return res.status(400).json({ error: "Proje klasörü gerekli." });
  // compose dosyasının bulunduğu klasöre geçip komutu çalıştır.
  // `docker compose` (v2) yoksa `docker-compose` (v1) ile dene.
  const cmd = `cd ${shQuote(dir)} && (docker compose ${sub} || docker-compose ${sub}) 2>&1`;
  dockerExec(s, cmd, (err, r) => {
    if (err) return res.status(400).json({ error: err.message });
    if (r.code !== 0)
      return res.status(400).json({ error: (r.out || r.errout || "İşlem başarısız").trim().slice(-800) });
    res.json({ ok: true, output: (r.out || "").trim().slice(-2000) });
  });
});

module.exports = router;
