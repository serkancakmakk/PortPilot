// Çift panel (split-pane) — sağ tarafta ikinci bir bağlı sunucuyu gezdirir ve
// sol (aktif) panelle arasında sürükle-bırak/düğme ile aktarım yapar.
// Aktarım var olan /api/transfer-remote (sunucudan sunucuya relay) ile yapılır.
import { $, escapeHtml, toast } from "./dom.js";
import { connections, activeConnId, session, cwd } from "./state.js";
import { navigate, joinPath, fmtSize, fmtDate, checkedItems } from "./explorer.js";
import { runTransfer } from "./transfer-remote.js";
import { enqueueTransfer } from "./transfer-queue.js";

let isOpen = false;
const dp = { connId: null, tok: null, cwd: "/", items: [] };

function listConns() { return connections.filter((c) => c.session); }
function connLabel(c) { return (c.info && (c.info.name || `${c.info.username}@${c.info.host}`)) || c.id; }
function activeConn() { return connections.find((c) => c.id === activeConnId); }
function activeLabel() { const c = activeConn(); return c ? connLabel(c) : "aktif sunucu"; }

// İki panelin kim olduğunu ve ne yapılacağını açıkça yaz.
function setHint() {
  const el = $("dp-xfer-hint");
  if (!el) return;
  const right = dp.connId ? connLabel(connections.find((c) => c.id === dp.connId) || {}) : "—";
  const same = dp.tok && activeConn() && activeConn().session === dp.tok;
  el.innerHTML =
    `<span class="dp-side"><b>◀ Sol</b> (senin gezginin): ${escapeHtml(activeLabel())}</span>` +
    `<span class="dp-side"><b>Sağ ▶</b>: ${escapeHtml(right)}</span>` +
    (same
      ? `<span class="dp-warn">⚠ İki panel aynı sunucu — aktarım için farklı bir sunucu seç.</span>`
      : `<span class="dp-tip">Aktarmak için dosyaları <b>kutucukla seç</b>, sonra <b>📥 Soldan al</b> / <b>📤 Sola gönder</b>.</span>`);
}

async function listDir(tok, path) {
  const res = await fetch("/api/list?path=" + encodeURIComponent(path), { headers: tok ? { "x-session": tok } : {} });
  if (!res.ok) { let e = "Listelenemedi"; try { e = (await res.json()).error || e; } catch (_) {} throw new Error(e); }
  return res.json();
}

function populateSelect() {
  const sel = $("dp-conn");
  const conns = listConns();
  sel.innerHTML = conns.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(connLabel(c))}</option>`).join("");
  // Var olan seçimi koru; yoksa aktif olmayan ilk bağlantıyı seç.
  if (dp.connId && conns.some((c) => c.id === dp.connId)) sel.value = dp.connId;
  else {
    const pref = conns.find((c) => c.id !== activeConnId) || conns[0];
    if (pref) sel.value = pref.id;
  }
}

async function setConn(id) {
  const c = connections.find((x) => x.id === id);
  if (!c) return;
  dp.connId = id; dp.tok = c.session; dp.cwd = c.homePath || "/";
  setHint();
  await loadDp();
}

async function loadDp() {
  const list = $("dp-list");
  list.innerHTML = `<div class="dk-msg">Yükleniyor…</div>`;
  if (!dp.tok) { list.innerHTML = `<div class="dk-msg">Sağ panel için bir sunucu seç.</div>`; renderBread(); return; }
  try {
    const data = await listDir(dp.tok, dp.cwd);
    dp.cwd = data.path;
    dp.items = data.items || [];
    render();
  } catch (e) { list.innerHTML = `<div class="dk-msg">Hata: ${escapeHtml(e.message)}</div>`; }
}

function renderBread() {
  const bc = $("dp-bread");
  if (!bc) return;
  bc.innerHTML = "";
  const mk = (label, path) => {
    const s = document.createElement("span");
    s.className = "crumb";
    s.textContent = label;
    s.onclick = () => { dp.cwd = path; loadDp(); };
    return s;
  };
  bc.appendChild(mk("/", "/"));
  let acc = "";
  dp.cwd.split("/").filter(Boolean).forEach((p) => {
    acc += "/" + p;
    const sep = document.createElement("span"); sep.className = "sep"; sep.textContent = "›"; bc.appendChild(sep);
    bc.appendChild(mk(p, acc));
  });
}

function render() {
  renderBread();
  const items = [...dp.items].sort((a, b) => {
    if ((a.type === "dir") !== (b.type === "dir")) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "tr");
  });
  const list = $("dp-list");
  list.innerHTML = "";
  if (!items.length) { list.innerHTML = `<div class="dk-msg">Bu klasör boş.</div>`; return; }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "dp-row " + item.type;
    row.innerHTML = `
      <input type="checkbox" class="dp-check" />
      <span class="dp-ico">${item.type === "dir" ? "📁" : item.type === "link" ? "🔗" : "📄"}</span>
      <span class="dp-name"></span>
      <span class="dp-meta">${item.type === "file" ? escapeHtml(fmtSize(item.size)) : ""}</span>
      <span class="dp-date">${escapeHtml(fmtDate(item.mtime))}</span>`;
    row.querySelector(".dp-name").textContent = item.name;
    const cb = row.querySelector(".dp-check");
    cb._item = item;
    cb.addEventListener("click", (e) => e.stopPropagation());
    if (item.type === "dir" || item.type === "link") {
      row.addEventListener("dblclick", () => { dp.cwd = joinPath(dp.cwd, item.name); loadDp(); });
    }
    list.appendChild(row);
  });
}

function dpSelectedPaths() {
  return Array.from($("dp-list").querySelectorAll(".dp-check:checked")).map((cb) => joinPath(dp.cwd, cb._item.name));
}

// Sol (aktif) → Sağ (dp)
function transferLeftToRight() {
  if (!dp.tok) return toast("Önce sağ panel için sunucu seç.", true);
  const sel = checkedItems().map((it) => joinPath(cwd, it.name));
  if (!sel.length) return toast("Sol panelde aktarılacak öğe seç (kutucukla).", true);
  const c = connections.find((x) => x.id === activeConnId);
  if (c && c.session === dp.tok) return toast("İki panel aynı sunucu — farklı bir sunucu seç.", true);
  const rightName = connLabel(connections.find((x) => x.id === dp.connId) || {});
  enqueueTransfer(`Soldan al → ${rightName} (${sel.length})`, async () => {
    await runTransfer(session, dp.tok, dp.cwd, sel);
    loadDp();
  });
}

// Sağ (dp) → Sol (aktif)
function transferRightToLeft() {
  if (!dp.tok) return toast("Önce sağ panel için sunucu seç.", true);
  const sel = dpSelectedPaths();
  if (!sel.length) return toast("Sağ panelde aktarılacak öğe seç (kutucukla).", true);
  const c = connections.find((x) => x.id === activeConnId);
  if (c && c.session === dp.tok) return toast("İki panel aynı sunucu — farklı bir sunucu seç.", true);
  enqueueTransfer(`Sola gönder → ${activeLabel()} (${sel.length})`, async () => {
    await runTransfer(dp.tok, session, cwd, sel);
    navigate(cwd, false);
  });
}

function toggle() {
  isOpen = !isOpen;
  const panes = $("panes");
  const pane = $("dual-pane");
  panes.classList.toggle("split", isOpen);
  pane.hidden = !isOpen;
  $("btn-split").classList.toggle("active", isOpen);
  if (!isOpen) return;
  // Sol tarafta panel (dashboard) açıksa dosya gezginine geç — yoksa kullanıcı
  // kendi dosyalarını göremez ve aktarım için seçim yapamaz.
  import("./dashboard.js").then((m) => m.showFilesView()).catch(() => {});
  if (listConns().length < 2)
    toast("Çift panel için ikinci bir sunucuya bağlan (yeni sekmede). Tek sunucu arasında aktarım yapılamaz.", true);
  setHint();
  populateSelect();
  const id = $("dp-conn").value;
  if (id) setConn(id); else loadDp();
}

export function initDualPane() {
  const btn = $("btn-split");
  if (!btn) return;
  btn.addEventListener("click", toggle);
  $("dp-close").addEventListener("click", () => { if (isOpen) toggle(); });
  $("dp-refresh").addEventListener("click", loadDp);
  $("dp-up").addEventListener("click", () => {
    if (dp.cwd === "/") return;
    dp.cwd = dp.cwd.replace(/\/[^/]+\/?$/, "") || "/";
    loadDp();
  });
  $("dp-conn").addEventListener("change", (e) => setConn(e.target.value));
  $("dp-to-right").addEventListener("click", transferLeftToRight);
  $("dp-to-left").addEventListener("click", transferRightToLeft);
}
