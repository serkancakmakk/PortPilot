// Sunucu Araçları: açık portlar, süreçler, systemd servisleri, disk analizi, log kuyruğu.
import { $, escapeHtml, escapeAttr, toast, showLoading } from "./dom.js";
import { api } from "./api.js";
import { confirmDialog } from "./dialog.js";
import { fmtSize } from "./explorer.js";

let sysTab = "ports";
let logPath = "/var/log/syslog";
let duPath = "/";

function setTab(tab) {
  sysTab = tab;
  document.querySelectorAll("#systools-panel .dk-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.systab === tab));
  loadTab();
}

function msg(html) { $("systools-body").innerHTML = `<div class="dk-msg">${html}</div>`; }

async function loadTab() {
  $("systools-status").textContent = "";
  if (sysTab === "log") return renderLog();
  if (sysTab === "diskusage") return loadDiskUsage();
  if (sysTab === "cron") return loadCron();
  if (sysTab === "users") return loadUsers();
  if (sysTab === "ssh") return loadSsh();
  msg("Yükleniyor…");
  let data;
  try {
    data = await api("sys/" + sysTab);
  } catch (e) { return msg("Hata: " + escapeHtml(e.message)); }
  if (!data || !data.available) {
    return msg("Bu sunucuda kullanılamıyor (komut çalıştırma kapalı, FTP, ya da araç yok)." +
      (data && data.error ? `<br><br><span class="dk-sub">${escapeHtml(data.error)}</span>` : ""));
  }
  if (sysTab === "ports") renderPorts(data.items);
  else if (sysTab === "procs") renderProcs(data.items);
  else if (sysTab === "services") renderServices(data.items);
  $("systools-status").textContent = "Güncellendi · " + new Date().toLocaleTimeString("tr-TR");
}

// ---- Cron ----
async function loadCron() {
  msg("Yükleniyor…");
  let data;
  try { data = await api("sys/cron"); }
  catch (e) { return msg("Hata: " + escapeHtml(e.message)); }
  if (!data || !data.available)
    return msg("Bu sunucuda kullanılamıyor (komut çalıştırma kapalı ya da FTP).");
  const raw = data.raw || "";
  $("systools-body").innerHTML = `
    <div class="cron-help dk-sub">Her satır: <code>dk saat gün ay haftagünü komut</code> · ör. <code>0 3 * * * /yedek.sh</code> · <code>@reboot</code>, <code>@daily</code> de geçerli. Satır başına <code>#</code> ile yorum.</div>
    <textarea id="cron-edit" class="cron-edit" spellcheck="false" placeholder="# Henüz cron görevi yok. Buraya ekleyebilirsin."></textarea>
    <div class="cron-actions">
      <button id="cron-save" class="btn btn-sm tbtn primary">Kaydet</button>
      <span class="dk-sub">Kaydet, kullanıcının tüm crontab'ını bu içerikle değiştirir.</span>
    </div>`;
  $("cron-edit").value = raw;
  $("cron-save").addEventListener("click", saveCron);
  $("systools-status").textContent = (data.lines || []).filter((l) => !l.comment && !l.isEnv).length + " görev";
}

async function saveCron() {
  const content = $("cron-edit").value;
  showLoading(true);
  try {
    await api("sys/cron", { method: "POST", json: { content } });
    toast("Crontab kaydedildi");
    loadCron();
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

// ---- Kullanıcılar & sahiplik (chown) ----
async function loadUsers() {
  msg("Yükleniyor…");
  let data;
  try { data = await api("sys/users"); }
  catch (e) { return msg("Hata: " + escapeHtml(e.message)); }
  if (!data || !data.available)
    return msg("Bu sunucuda kullanılamıyor (komut çalıştırma kapalı ya da FTP).");
  const rows = data.items.map((u) => `<tr class="${u.system ? "usr-sys" : ""}">
    <td><b>${escapeHtml(u.name)}</b>${u.uid === 0 ? ' <span class="usr-tag root">root</span>' : u.system ? ' <span class="usr-tag">sistem</span>' : ""}</td>
    <td>${u.uid}</td>
    <td>${u.gid}</td>
    <td>${escapeHtml(u.home)}</td>
    <td>${escapeHtml(u.shell)}${u.login ? "" : ' <span class="dk-sub">(girişsiz)</span>'}</td>
  </tr>`).join("");
  $("systools-body").innerHTML = `
    <div class="chown-box">
      <div class="chown-title">Sahiplik değiştir (chown)</div>
      <div class="chown-row">
        <input id="chown-path" class="lx-path" placeholder="Yol (ör. /var/www/site)" spellcheck="false" />
        <input id="chown-owner" class="chown-in" placeholder="kullanıcı" spellcheck="false" />
        <input id="chown-group" class="chown-in" placeholder="grup (ops.)" spellcheck="false" />
        <label class="chown-rec"><input type="checkbox" id="chown-rec" /> -R</label>
        <button id="chown-go" class="btn btn-sm tbtn primary">Uygula</button>
      </div>
    </div>
    <table class="table sys-table">
      <thead><tr><th>Kullanıcı</th><th>UID</th><th>GID</th><th>Ev</th><th>Kabuk</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  $("chown-go").addEventListener("click", doChown);
  $("systools-status").textContent = data.items.filter((u) => !u.system).length + " normal kullanıcı";
}

async function doChown() {
  const path = $("chown-path").value.trim();
  const owner = $("chown-owner").value.trim();
  const group = $("chown-group").value.trim();
  const recursive = $("chown-rec").checked;
  if (!path) return toast("Yol gerekli.", true);
  if (!owner && !group) return toast("Kullanıcı ve/veya grup gir.", true);
  showLoading(true);
  try {
    await api("sys/chown", { method: "POST", json: { path, owner, group, recursive } });
    toast("Sahiplik güncellendi");
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

// ---- SSH anahtarları ----
async function loadSsh() {
  msg("Yükleniyor…");
  let data;
  try { data = await api("sys/sshkeys"); }
  catch (e) { return msg("Hata: " + escapeHtml(e.message)); }
  if (!data || !data.available)
    return msg("Bu sunucuda kullanılamıyor (komut çalıştırma kapalı ya da FTP).");
  const rows = data.items.length ? data.items.map((k) => `<tr>
    <td>${escapeHtml(k.type)}</td>
    <td class="ssh-fp">${escapeHtml(k.fingerprint)}</td>
    <td>${escapeHtml(k.comment || "—")}</td>
  </tr>`).join("") : `<tr><td colspan="3" class="dk-sub">authorized_keys boş.</td></tr>`;
  $("systools-body").innerHTML = `
    <div class="ssh-intro dk-sub">Parolasız bağlantı için sunucuda bir anahtar çifti üret; açık anahtar <code>authorized_keys</code>'e eklenir, özel anahtarı bağlantına kaydedersin.</div>
    <div class="ssh-actions"><button id="ssh-gen" class="btn btn-sm tbtn primary">🔑 Anahtar üret & kur</button></div>
    <div class="ssh-title">Yetkili anahtarlar (authorized_keys)</div>
    <table class="table sys-table">
      <thead><tr><th>Tip</th><th>Parmak izi</th><th>Yorum</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  $("ssh-gen").addEventListener("click", genSshKey);
}

async function genSshKey() {
  if (!(await confirmDialog(
    "Sunucuda ed25519 anahtar çifti üretilip authorized_keys'e eklenecek. Devam?",
    { title: "SSH Anahtarı Kur", okText: "Üret & Kur" }
  ))) return;
  showLoading(true);
  let r;
  try { r = await api("sys/ssh-setup", { method: "POST", json: {} }); }
  catch (e) { showLoading(false); return toast(e.message, true); }
  showLoading(false);
  showPrivateKey(r.privateKey || "");
  loadSsh();
}

// Özel anahtarı kopyalanabilir bir kutuda göster
function showPrivateKey(priv) {
  const h = document.createElement("div");
  h.className = "app-dialog-overlay";
  h.innerHTML = `
    <div class="app-dialog" role="dialog" aria-modal="true" style="max-width:560px">
      <div class="app-dialog-title">🔑 Özel Anahtar Üretildi</div>
      <div class="app-dialog-msg">Bu özel anahtarı kopyala ve bağlantını düzenlerken <b>Kimlik = Anahtar</b> alanına yapıştır. Anahtar yalnızca bir kez gösterilir.</div>
      <textarea class="cron-edit" readonly style="height:180px;font-size:11px"></textarea>
      <div class="app-dialog-actions">
        <button type="button" class="ad-btn ad-copy">Kopyala</button>
        <button type="button" class="ad-btn ad-ok primary">Tamam</button>
      </div>
    </div>`;
  document.body.appendChild(h);
  requestAnimationFrame(() => h.classList.add("show"));
  const ta = h.querySelector("textarea");
  ta.value = priv;
  const close = () => { h.classList.remove("show"); setTimeout(() => h.remove(), 140); };
  h.querySelector(".ad-ok").addEventListener("click", close);
  h.querySelector(".ad-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(priv); toast("Kopyalandı"); }
    catch (_) { ta.select(); document.execCommand("copy"); toast("Kopyalandı"); }
  });
  h.addEventListener("mousedown", (e) => { if (e.target === h) close(); });
}

function renderPorts(items) {
  if (!items.length) return msg("Dinleyen port bulunamadı.");
  const rows = items.map((p) => `<tr>
    <td>${escapeHtml(p.proto)}</td>
    <td><b>${escapeHtml(p.port)}</b></td>
    <td>${escapeHtml(p.addr)}</td>
    <td>${escapeHtml(p.process || "—")}</td>
  </tr>`).join("");
  $("systools-body").innerHTML = `<table class="table sys-table">
    <thead><tr><th>Protokol</th><th>Port</th><th>Adres</th><th>Süreç</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderProcs(items) {
  if (!items.length) return msg("Süreç listelenemedi.");
  const rows = items.map((p) => `<tr>
    <td>${escapeHtml(p.pid)}</td>
    <td>${escapeHtml(p.user)}</td>
    <td>${escapeHtml(p.cpu)}%</td>
    <td>${escapeHtml(p.mem)}%</td>
    <td>${escapeHtml(p.comm)}</td>
    <td><button class="dk-btn danger" data-act="kill" data-pid="${escapeAttr(p.pid)}" data-name="${escapeAttr(p.comm)}">Sonlandır</button></td>
  </tr>`).join("");
  $("systools-body").innerHTML = `<table class="table sys-table">
    <thead><tr><th>PID</th><th>Kullanıcı</th><th>CPU</th><th>RAM</th><th>Komut</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderServices(items) {
  if (!items.length) return msg("Servis listelenemedi.");
  const rows = items.map((s) => {
    const on = s.active === "active";
    return `<tr>
      <td><div class="dk-name">${escapeHtml(s.unit)}</div><div class="dk-sub">${escapeHtml(s.desc || "")}</div></td>
      <td><span class="dk-state ${on ? "ok" : "off"}"><span class="dot"></span>${escapeHtml(s.active)} / ${escapeHtml(s.sub)}</span></td>
      <td class="sys-actions">
        <button class="dk-btn" data-act="svc" data-do="start" data-name="${escapeAttr(s.unit)}">Başlat</button>
        <button class="dk-btn" data-act="svc" data-do="restart" data-name="${escapeAttr(s.unit)}">Yeniden</button>
        <button class="dk-btn danger" data-act="svc" data-do="stop" data-name="${escapeAttr(s.unit)}">Durdur</button>
      </td>
    </tr>`;
  }).join("");
  $("systools-body").innerHTML = `<table class="table sys-table">
    <thead><tr><th>Servis</th><th>Durum</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderLog(text) {
  $("systools-body").innerHTML = `
    <div class="sys-logbar">
      <input id="sys-log-path" class="lx-path" placeholder="Log dosyası yolu (ör. /var/log/syslog)" value="${escapeAttr(logPath)}" spellcheck="false" />
      <input id="sys-log-lines" class="sys-log-lines" type="number" min="10" max="2000" value="200" title="Satır sayısı" />
      <button id="sys-log-get" class="btn btn-sm tbtn primary">Getir</button>
    </div>
    <pre class="sys-log" id="sys-log-out">${text != null ? escapeHtml(text) : "Bir log dosyası yolu girip “Getir”e bas."}</pre>`;
  $("sys-log-get").addEventListener("click", fetchLog);
  $("sys-log-path").addEventListener("keydown", (e) => { if (e.key === "Enter") fetchLog(); });
}

async function fetchLog() {
  logPath = $("sys-log-path").value.trim();
  const lines = $("sys-log-lines").value || 200;
  if (!logPath) return toast("Dosya yolu gerekli.", true);
  $("sys-log-out").textContent = "Yükleniyor…";
  try {
    const r = await api("sys/logtail?path=" + encodeURIComponent(logPath) + "&lines=" + encodeURIComponent(lines));
    $("sys-log-out").textContent = (r && r.text) || "(boş)";
  } catch (e) { $("sys-log-out").textContent = "Hata: " + e.message; }
}

// ---- Disk analizi ----
function renderDiskBar(path) {
  return `<div class="sys-logbar">
    <input id="sys-du-path" class="lx-path" placeholder="Klasör yolu (ör. /var)" value="${escapeAttr(path)}" spellcheck="false" />
    <button id="sys-du-get" class="btn btn-sm tbtn primary">Analiz Et</button>
  </div>`;
}

async function loadDiskUsage() {
  $("systools-body").innerHTML = renderDiskBar(duPath) +
    `<div class="dk-msg" id="sys-du-out">Bir klasör yolu girip “Analiz Et”e bas (ör. <code>/var</code>, <code>/home</code>).</div>`;
  wireDiskBar();
}

function wireDiskBar() {
  const get = $("sys-du-get");
  const input = $("sys-du-path");
  if (get) get.addEventListener("click", fetchDiskUsage);
  if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") fetchDiskUsage(); });
}

async function fetchDiskUsage() {
  duPath = $("sys-du-path").value.trim() || "/";
  $("systools-status").textContent = "";
  $("systools-body").innerHTML = renderDiskBar(duPath) + `<div class="dk-msg" id="sys-du-out">Hesaplanıyor… (büyük klasörlerde sürebilir)</div>`;
  wireDiskBar();
  let data;
  try {
    data = await api("sys/diskusage?path=" + encodeURIComponent(duPath));
  } catch (e) { $("sys-du-out").innerHTML = "Hata: " + escapeHtml(e.message); return; }
  if (!data || !data.available) {
    $("sys-du-out").innerHTML = "Bu sunucuda kullanılamıyor (komut çalıştırma kapalı ya da FTP).";
    return;
  }
  renderDiskUsage(data);
  $("systools-status").textContent = "Güncellendi · " + new Date().toLocaleTimeString("tr-TR");
}

function renderDiskUsage(data) {
  const max = data.items.reduce((m, i) => Math.max(m, i.size), 0) || 1;
  const rows = data.items.length ? data.items.map((i) => {
    const pct = Math.round((i.size / max) * 100);
    const share = data.total ? ((i.size / data.total) * 100).toFixed(1) : "0";
    return `<tr>
      <td class="sys-du-name"><button class="dk-link" data-act="du-into" data-path="${escapeAttr(i.path)}">${escapeHtml(i.name)}</button></td>
      <td class="sys-du-bar"><div class="du-track"><div class="du-fill" style="width:${pct}%"></div></div></td>
      <td class="sys-du-size"><b>${escapeHtml(fmtSize(i.size))}</b></td>
      <td class="sys-du-share">%${share}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="4" class="dk-sub">Alt öğe yok ya da erişilemedi.</td></tr>`;
  $("systools-body").innerHTML = renderDiskBar(duPath) + `
    <div class="sys-du-total">Toplam: <b>${escapeHtml(fmtSize(data.total))}</b> · <span class="dk-sub">${escapeHtml(data.path)}</span></div>
    <table class="table sys-table sys-du-table">
      <thead><tr><th>Klasör / Dosya</th><th>Oran</th><th>Boyut</th><th>Pay</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  wireDiskBar();
}

// Eylemler (kill / servis / disk analizine in)
async function onBodyClick(e) {
  const into = e.target.closest("button[data-act='du-into']");
  if (into) {
    duPath = into.dataset.path;
    $("sys-du-path") && ($("sys-du-path").value = duPath);
    return fetchDiskUsage();
  }
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "kill") {
    const { pid, name } = btn.dataset;
    if (!(await confirmDialog(`"${name}" (PID ${pid}) sürecini sonlandır?`, { title: "Süreci Sonlandır", okText: "Sonlandır", danger: true }))) return;
    showLoading(true);
    try { await api("sys/kill", { method: "POST", json: { pid } }); toast("Sonlandırıldı"); loadTab(); }
    catch (err) { toast(err.message, true); }
    finally { showLoading(false); }
  } else if (btn.dataset.act === "svc") {
    const { name, do: action } = btn.dataset;
    const verb = action === "start" ? "başlat" : action === "stop" ? "durdur" : "yeniden başlat";
    if (action === "stop" && !(await confirmDialog(`"${name}" servisini durdur?`, { title: "Servisi Durdur", okText: "Durdur", danger: true }))) return;
    showLoading(true);
    try { await api("sys/service", { method: "POST", json: { name, action } }); toast(`Servis ${verb}ıldı`); loadTab(); }
    catch (err) { toast(err.message, true); }
    finally { showLoading(false); }
  }
}

export function openSystools() {
  $("systools-panel").hidden = false;
  setTab(sysTab);
}

export function initSystools() {
  const btn = $("btn-systools");
  if (btn) btn.addEventListener("click", openSystools);
  if ($("systools-close")) $("systools-close").addEventListener("click", () => { $("systools-panel").hidden = true; });
  if ($("systools-refresh")) $("systools-refresh").addEventListener("click", loadTab);
  document.querySelectorAll("#systools-panel .dk-tab").forEach((b) =>
    b.addEventListener("click", () => setTab(b.dataset.systab)));
  if ($("systools-body")) $("systools-body").addEventListener("click", onBodyClick);
}
