import { $, showLoading, toast, escapeHtml, escapeAttr } from "./dom.js";
import { api } from "./api.js";
import { confirmDialog } from "./dialog.js";

let dockerTab = "containers";
const collapsedGroups = new Set();

function toggleGroup(key, el) {
  const wrap = el.closest(".dk-group");
  if (!wrap) return;
  const collapsed = wrap.classList.toggle("collapsed");
  if (collapsed) collapsedGroups.add(key); else collapsedGroups.delete(key);
}
window._dockerToggleGroup = toggleGroup;

function fmtDuration(ms) {
  if (!ms || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} gün${h ? " " + h + " sa" : ""}`;
  if (h > 0) return `${h} saat${m ? " " + m + " dk" : ""}`;
  if (m > 0) return `${m} dk`;
  return `${sec} sn`;
}

function fmtDate(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function btn(action, id, type, label, extra = "") {
  return `<button class="dk-btn ${extra}" onclick="window._dockerAction('${action}','${id}','${type}')">${label}</button>`;
}

export async function loadDocker() {
  const body = $("docker-body");
  body.innerHTML = `<div class="dk-msg">Yükleniyor…</div>`;
  $("docker-status").textContent = "";
  try {
    if (dockerTab === "containers") {
      const data = await api("docker/ps");
      if (!data.available) return showDockerUnavailable(data.error);
      const statsData = await api("docker/stats").catch(() => ({ available: false }));
      const statsMap = {};
      if (statsData.available) {
        for (const st of statsData.stats || []) {
          if (st.name) statsMap[st.name] = st;
          if (st.id) { statsMap[st.id] = st; statsMap[st.id.slice(0, 12)] = st; }
        }
      }
      renderContainers(data.containers, statsMap);
    } else if (dockerTab === "compose") {
      const data = await api("docker/compose");
      if (!data.available) return showDockerUnavailable(data.error);
      renderCompose(data.projects);
    } else if (dockerTab === "idle") {
      const data = await api("docker/idle");
      if (!data.available) return showDockerUnavailable(data.error);
      renderIdle(data.containers, data.now);
    } else {
      const data = await api("docker/images");
      if (!data.available) return showDockerUnavailable(data.error);
      renderImages(data.images);
    }
  } catch (e) {
    body.innerHTML = `<div class="dk-msg">Hata: ${escapeHtml(e.message)}</div>`;
  }
}

function showDockerUnavailable(err) {
  $("docker-body").innerHTML =
    `<div class="dk-msg">Bu sunucuda Docker'a erişilemedi.<br><br>` +
    `<code>docker</code> kurulu ve çalışıyor olmalı; kullanıcının docker yetkisi olmalı.` +
    (err ? `<br><br><span class="dk-sub">${escapeHtml(err)}</span>` : "") + `</div>`;
}

function containerRow(c, statsMap) {
  const st = (c.state || "").toLowerCase();
  const cls = st.includes("run") ? "running" : st.includes("paus") ? "paused" : "exited";
  const running = cls === "running";
  const paused = cls === "paused";
  const stat = statsMap[c.name] || statsMap[c.id] || statsMap[(c.id || "").slice(0, 12)] || null;
  const cpu = stat && stat.cpu ? stat.cpu : "—";
  const mem = stat && stat.mem ? stat.mem : "—";
  const memPerc = stat && stat.memPerc ? stat.memPerc : "";
  const a = [];
  if (!running && !paused) a.push(btn("start", c.id, "container", "▶ Başlat", "go"));
  if (running) a.push(btn(paused ? "unpause" : "pause", c.id, "container", paused ? "▶ Devam" : "⏸ Duraklat"));
  if (running || paused) a.push(btn("stop", c.id, "container", "⏹ Durdur"));
  a.push(btn("restart", c.id, "container", "⟳ Yeniden başlat"));
  if (running) a.push(`<button class="dk-btn" onclick="window._openTerminal('${c.id}','${escapeAttr(c.name)}')">⌨ Terminal</button>`);
  a.push(`<button class="dk-btn" onclick="window._dockerLogs('${c.id}','${escapeAttr(c.name)}')">📄 Loglar</button>`);
  a.push(btn("rm", c.id, "container", "🗑 Sil", "danger"));
  return `<tr>
    <td><div class="dk-name">${escapeHtml(c.name)}</div><div class="dk-sub">${escapeHtml(c.image)}</div></td>
    <td><span class="dk-state ${cls}"><span class="dot"></span>${escapeHtml(c.status || c.state)}</span></td>
    <td class="dk-metric">${escapeHtml(cpu)}</td>
    <td class="dk-metric"><div>${escapeHtml(mem)}</div>${memPerc ? `<div class="dk-sub">${escapeHtml(memPerc)}</div>` : ""}</td>
    <td class="dk-sub">${escapeHtml(c.ports || "—")}</td>
    <td><div class="dk-actions">${a.join("")}</div></td>
  </tr>`;
}

const DK_HEAD = `<thead><tr><th>Konteyner</th><th>Durum</th><th>CPU</th><th>RAM</th><th>Portlar</th><th></th></tr></thead>`;

function renderContainers(list, statsMap = {}) {
  $("docker-status").textContent = `${list.length} konteyner`;
  if (!list.length) { $("docker-body").innerHTML = `<div class="dk-msg">Hiç konteyner yok.</div>`; return; }
  const groups = new Map();
  list.forEach((c) => {
    const g = (c.group || "").trim();
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  });
  const hasGroups = [...groups.keys()].some((k) => k);
  if (!hasGroups) {
    const rows = list.map((c) => containerRow(c, statsMap)).join("");
    $("docker-body").innerHTML = `<table class="dk-table">${DK_HEAD}<tbody>${rows}</tbody></table>`;
    return;
  }
  let html = "";
  groups.forEach((items, g) => {
    const label = g || "Diğer (compose dışı)";
    const key = g || "__other__";
    const collapsed = collapsedGroups.has(key);
    const rows = items.map((c) => containerRow(c, statsMap)).join("");
    html += `<div class="dk-group${collapsed ? " collapsed" : ""}"><div class="dk-group-head" onclick="window._dockerToggleGroup('${escapeAttr(key)}',this)"><span class="dk-group-caret">▾</span> 🧩 ${escapeHtml(label)} <span class="srv-group-count">${items.length}</span></div><table class="dk-table">${DK_HEAD}<tbody>${rows}</tbody></table></div>`;
  });
  $("docker-body").innerHTML = html;
}

function renderImages(list) {
  $("docker-status").textContent = `${list.length} görüntü`;
  if (!list.length) { $("docker-body").innerHTML = `<div class="dk-msg">Hiç görüntü yok.</div>`; return; }
  const rows = list.map((i) => `<tr>
    <td><div class="dk-name">${escapeHtml((i.repo || "<none>") + ":" + (i.tag || "latest"))}</div><div class="dk-sub">${escapeHtml(i.id)}</div></td>
    <td class="dk-sub">${escapeHtml(i.size || "")}</td>
    <td class="dk-sub">${escapeHtml(i.created || "")}</td>
    <td><div class="dk-actions">${btn("rmi", i.id, "image", "🗑 Sil", "danger")}</div></td>
  </tr>`).join("");
  $("docker-body").innerHTML = `<table class="dk-table"><thead><tr><th>Görüntü</th><th>Boyut</th><th>Oluşturulma</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCompose(list) {
  $("docker-status").textContent = `${list.length} compose projesi`;
  if (!list.length) {
    $("docker-body").innerHTML = `<div class="dk-msg">Compose projesi bulunamadı.<br><br>` +
      `<span class="dk-sub">Yalnızca <code>docker compose</code> ile başlatılmış (compose etiketli) konteynerler burada görünür.</span></div>`;
    return;
  }
  const cards = list.map((p) => {
    const allUp = p.running === p.total && p.total > 0;
    const cls = allUp ? "running" : p.running > 0 ? "paused" : "exited";
    const dir = escapeAttr(p.dir || "");
    const act = (a, label, extra = "") =>
      `<button class="dk-btn ${extra}" ${p.dir ? "" : "disabled title='compose klasörü bilinmiyor'"} onclick="window._composeAction('${escapeAttr(a)}','${dir}','${escapeAttr(p.name)}')">${label}</button>`;
    return `<div class="dk-group">
      <div class="dk-group-head" style="cursor:default">
        🐳 ${escapeHtml(p.name)}
        <span class="dk-state ${cls}" style="margin-left:8px"><span class="dot"></span>${p.running}/${p.total} çalışıyor</span>
      </div>
      <div class="cmp-meta dk-sub">${p.dir ? "📁 " + escapeHtml(p.dir) : "klasör bilinmiyor"} ${p.services.length ? "· servisler: " + escapeHtml(p.services.join(", ")) : ""}</div>
      <div class="dk-actions cmp-actions">
        ${act("up", "▲ Up (-d)", "go")}
        ${act("restart", "⟳ Yeniden")}
        ${act("stop", "⏸ Durdur")}
        ${act("pull", "⬇ Pull")}
        ${act("down", "⏹ Down", "danger")}
      </div>
    </div>`;
  }).join("");
  $("docker-body").innerHTML = cards;
}

export async function composeAction(action, dir, name) {
  if (!dir) return toast("Bu projenin compose klasörü bilinmiyor.", true);
  if (action === "down" &&
      !(await confirmDialog(`“${name}” stack'i durdurulup kaldırılsın mı? (docker compose down)`, { title: "Compose Down", okText: "Down", danger: true }))) return;
  showLoading(true);
  try {
    const r = await api("docker/compose-action", { method: "POST", json: { dir, action } });
    toast(r.output ? r.output.split("\n").filter(Boolean).slice(-1)[0] : "İşlem tamam");
    await loadDocker();
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

const IDLE_THRESHOLD = 7 * 86400 * 1000;

function renderIdle(list, now) {
  if (!list.length) { $("docker-body").innerHTML = `<div class="dk-msg">Hiç konteyner yok.</div>`; return; }
  const longIdle = list.filter((c) => !c.running && c.idleMs >= IDLE_THRESHOLD).length;
  $("docker-status").textContent = longIdle ? `${longIdle} konteyner 7+ gündür durdurulmuş` : `${list.length} konteyner`;
  const rows = list.map((c) => {
    const idle = fmtDuration(c.idleMs);
    const stale = !c.running && c.idleMs >= IDLE_THRESHOLD;
    const stateCls = c.running ? "running" : "exited";
    const activity = c.running ? `⬆ ${idle} süredir çalışıyor` : c.finishedAt ? `⏹ ${idle} önce durdu` : `oluşturuldu, hiç çalışmadı`;
    const created = c.created ? fmtDate(c.created) : "—";
    const lastSeen = c.lastActivity ? fmtDate(c.lastActivity) : "—";
    const a = [];
    if (!c.running) a.push(btn("start", c.id, "container", "▶ Başlat", "go"));
    a.push(`<button class="dk-btn" onclick="window._dockerLogs('${c.id}','${escapeAttr(c.name)}')">📄 Loglar</button>`);
    a.push(btn("rm", c.id, "container", "🗑 Sil", "danger"));
    return `<tr class="${stale ? "dk-stale" : ""}">
      <td><div class="dk-name">${stale ? "⚠️ " : ""}${escapeHtml(c.name)}</div><div class="dk-sub">${escapeHtml(c.image)}</div>${c.cmd ? `<div class="dk-sub dk-cmd" title="${escapeAttr(c.cmd)}">$ ${escapeHtml(c.cmd)}</div>` : ""}</td>
      <td><span class="dk-state ${stateCls}"><span class="dot"></span>${escapeHtml(c.status)}</span></td>
      <td class="dk-metric"><div>${escapeHtml(activity)}</div><div class="dk-sub">son: ${escapeHtml(lastSeen)}</div></td>
      <td class="dk-sub">${escapeHtml(created)}</td>
      <td class="dk-sub">${c.restartCount}×</td>
      <td><div class="dk-actions">${a.join("")}</div></td>
    </tr>`;
  }).join("");
  const tools = `<div class="dk-prune">
    <button class="dk-btn danger" onclick="window._dockerPrune('containers')">🧹 Durmuş konteynerleri sil</button>
    <button class="dk-btn danger" onclick="window._dockerPrune('images')">🧹 Artık (dangling) imajları sil</button>
  </div>`;
  const hint = longIdle ? `<div class="dk-msg" style="text-align:left;padding:10px 14px;opacity:.8">⚠️ işaretli konteynerler 7+ gündür durdurulmuş — artık gerekmiyorsa silebilirsin.</div>` : "";
  $("docker-body").innerHTML = tools + hint + `<table class="dk-table"><thead><tr><th>Konteyner</th><th>Durum</th><th>Son hareket</th><th>Oluşturulma</th><th>Restart</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function dockerPrune(what) {
  const msg = what === "containers"
    ? "TÜM durmuş konteynerler kalıcı olarak silinsin mi? (çalışanlar etkilenmez)"
    : "Kullanılmayan (dangling) tüm imajlar silinsin mi?";
  if (!(await confirmDialog(msg, { title: "Docker Temizliği", okText: "Sil", danger: true }))) return;
  showLoading(true);
  try {
    const r = await api("docker/prune", { method: "POST", json: { what } });
    toast(r.output ? r.output.split("\n").slice(-1)[0] : "Temizlik tamam");
    await loadDocker();
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

let logsCtxId = null;
export async function dockerLogs(id, name) {
  logsCtxId = id;
  $("logs-title").textContent = "📄 Loglar — " + name;
  $("docker-logs").hidden = false;
  $("logs-area").textContent = "Yükleniyor…";
  await refreshLogs();
}
async function refreshLogs() {
  if (!logsCtxId) return;
  const tail = ($("logs-tail") && $("logs-tail").value) || "400";
  try {
    const data = await api("docker/logs?id=" + encodeURIComponent(logsCtxId) + "&tail=" + encodeURIComponent(tail));
    $("logs-area").textContent = data.logs || "(log yok)";
    $("logs-area").scrollTop = $("logs-area").scrollHeight;
  } catch (e) { $("logs-area").textContent = "Hata: " + e.message; }
}

export async function dockerAction(action, id, type) {
  if ((action === "rm" || action === "rmi") &&
      !(await confirmDialog(`Bu ${type === "image" ? "görüntü" : "konteyner"} kalıcı olarak silinsin mi?`, { title: "Silinsin mi?", okText: "Sil", danger: true }))) return;
  showLoading(true);
  try {
    await api("docker/action", { method: "POST", json: { type, id, action } });
    toast("İşlem tamam");
    await loadDocker();
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

export function initDocker() {
  $("btn-docker").addEventListener("click", () => { $("docker-panel").hidden = false; loadDocker(); });
  $("docker-close").addEventListener("click", () => { $("docker-panel").hidden = true; });
  $("docker-refresh").addEventListener("click", loadDocker);
  document.querySelectorAll(".dk-tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".dk-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      dockerTab = t.dataset.tab;
      loadDocker();
    });
  });
  $("logs-refresh").addEventListener("click", refreshLogs);
  $("logs-tail").addEventListener("change", refreshLogs);
  $("logs-close").addEventListener("click", () => { $("docker-logs").hidden = true; logsCtxId = null; });

  // inline onclick handler'lar için global köprüler
  window._dockerAction = dockerAction;
  window._dockerLogs = dockerLogs;
  window._dockerPrune = dockerPrune;
  window._composeAction = composeAction;
}
