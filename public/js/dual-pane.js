// Çift panel (split-pane) — sağ tarafta İKİNCİ BİR SUNUCUYU ya da BU BİLGİSAYARI
// (yerel, yalnızca masaüstü uygulamasında) gezdirir ve sol (aktif) sunucuyla arasında
// dosya aktarır.
//   • Sunucu ↔ sunucu: /api/transfer-remote (relay)
//   • Yerel → sunucu:  /api/upload-local (yükleme)
//   • Sunucu → yerel:  window.desktop.downloadToDir (indirme, masaüstü)
import { $, escapeHtml, toast } from "./dom.js";
import { connections, activeConnId, session, cwd } from "./state.js";
import { navigate, joinPath, fmtSize, fmtDate, checkedItems } from "./explorer.js";
import { runTransfer } from "./transfer-remote.js";
import { enqueueTransfer } from "./transfer-queue.js";

const LOCAL = "__local__";
let isOpen = false;
// mode: "remote" | "local"
const dp = { mode: "remote", connId: null, tok: null, cwd: "/", parent: null, items: [] };

const isDesktop = () => !!(window.desktop && window.desktop.isDesktop && window.desktop.listDir);
function listConns() { return connections.filter((c) => c.session); }
function connLabel(c) { return (c.info && (c.info.name || `${c.info.username}@${c.info.host}`)) || c.id; }
function activeConn() { return connections.find((c) => c.id === activeConnId); }
function activeLabel() { const c = activeConn(); return c ? connLabel(c) : "aktif sunucu"; }
function rightLabel() {
  if (dp.mode === "local") return "💻 Bu Bilgisayar";
  return dp.connId ? connLabel(connections.find((c) => c.id === dp.connId) || {}) : "—";
}

// İki panelin kim olduğunu ve ne yapılacağını açıkça yaz.
function setHint() {
  const el = $("dp-xfer-hint");
  if (!el) return;
  const same = dp.mode === "remote" && dp.tok && activeConn() && activeConn().session === dp.tok;
  el.innerHTML =
    `<span class="dp-side"><b>◀ Sol</b> (senin gezginin): ${escapeHtml(activeLabel())}</span>` +
    `<span class="dp-side"><b>Sağ ▶</b>: ${escapeHtml(rightLabel())}</span>` +
    (same
      ? `<span class="dp-warn">⚠ İki panel aynı sunucu — aktarım için farklı bir sunucu seç.</span>`
      : `<span class="dp-tip">Aktarmak için dosyaları <b>kutucukla seç</b>, sonra <b>📥 Soldan al</b> / <b>📤 Sola gönder</b>.</span>`);
}

async function listRemote(tok, p) {
  const res = await fetch("/api/list?path=" + encodeURIComponent(p), { headers: tok ? { "x-session": tok } : {} });
  if (!res.ok) { let e = "Listelenemedi"; try { e = (await res.json()).error || e; } catch (_) {} throw new Error(e); }
  return res.json();
}

function populateSelect() {
  const sel = $("dp-conn");
  const conns = listConns();
  let html = conns.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(connLabel(c))}</option>`).join("");
  if (isDesktop()) html += `<option value="${LOCAL}">💻 Bu Bilgisayar (yerel)</option>`;
  sel.innerHTML = html;
  // Var olan seçimi koru; yoksa aktif olmayan ilk sunucu, o da yoksa yerel.
  if (dp.mode === "local") sel.value = LOCAL;
  else if (dp.connId && conns.some((c) => c.id === dp.connId)) sel.value = dp.connId;
  else {
    const pref = conns.find((c) => c.id !== activeConnId) || conns[0];
    if (pref) sel.value = pref.id;
    else if (isDesktop()) sel.value = LOCAL;
  }
}

async function setConn(id) {
  if (id === LOCAL) {
    dp.mode = "local"; dp.connId = null; dp.tok = null;
    let home = "/"; try { home = await window.desktop.homeDir(); } catch (_) {}
    dp.cwd = home;
    setHint();
    return loadLocal(home);
  }
  const c = connections.find((x) => x.id === id);
  if (!c) return;
  dp.mode = "remote"; dp.connId = id; dp.tok = c.session; dp.cwd = c.homePath || "/"; dp.parent = null;
  setHint();
  await loadDp();
}

async function loadDp() {
  if (dp.mode === "local") return loadLocal(dp.cwd);
  const list = $("dp-list");
  list.innerHTML = `<div class="dk-msg">Yükleniyor…</div>`;
  if (!dp.tok) { list.innerHTML = `<div class="dk-msg">Sağ panel için bir sunucu seç.</div>`; renderBread(); return; }
  try {
    const data = await listRemote(dp.tok, dp.cwd);
    dp.cwd = data.path;
    dp.items = (data.items || []).map((i) => ({ name: i.name, type: i.type, size: i.size, mtime: i.mtime }));
    render();
  } catch (e) { list.innerHTML = `<div class="dk-msg">Hata: ${escapeHtml(e.message)}</div>`; }
}

async function loadLocal(target) {
  const list = $("dp-list");
  list.innerHTML = `<div class="dk-msg">Yükleniyor…</div>`;
  let r;
  try { r = await window.desktop.listDir(target); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) { list.innerHTML = `<div class="dk-msg">Klasör açılamadı: ${escapeHtml((r && r.error) || "?")}</div>`; return; }
  dp.cwd = r.path; dp.parent = r.parent;
  const sep = r.path.includes("\\") ? "\\" : "/";
  dp.items = (r.entries || []).map((e) => ({
    name: e.name, type: e.isDir ? "dir" : "file", size: e.size || 0, mtime: e.mtime || 0,
    abs: r.path.replace(/[\\/]+$/, "") + sep + e.name,
  }));
  render();
}

function renderBread() {
  const bc = $("dp-bread");
  if (!bc) return;
  bc.innerHTML = "";
  if (dp.mode === "local") {
    // Yerel: yol metni + (varsa) üst klasör kısayolu — segment yeniden kurmak yerine güvenli.
    const span = document.createElement("span");
    span.className = "crumb dp-localpath";
    span.textContent = "💻 " + dp.cwd;
    bc.appendChild(span);
    return;
  }
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
      row.addEventListener("dblclick", () => {
        if (dp.mode === "local") loadLocal(item.abs);
        else { dp.cwd = joinPath(dp.cwd, item.name); loadDp(); }
      });
    }
    list.appendChild(row);
  });
}

// Seçili sağ-panel öğeleri (item nesneleri)
function dpSelectedItems() {
  return Array.from($("dp-list").querySelectorAll(".dp-check:checked")).map((cb) => cb._item);
}

// ---- 📥 Soldan al: sol (aktif sunucu) seçilenleri → sağ panele ----
function transferLeftToRight() {
  const items = checkedItems();
  if (!items.length) return toast("Sol panelde aktarılacak öğe seç (kutucukla).", true);

  if (dp.mode === "local") {
    // Sunucu → yerel klasöre indir (masaüstü)
    const destDir = dp.cwd;
    enqueueTransfer(`İndir → 💻 ${destDir} (${items.length})`, async () => {
      let ok = 0, fail = 0;
      for (const it of items) {
        const full = joinPath(cwd, it.name);
        const isDir = it.type === "dir";
        const url = `${location.origin}/api/${isDir ? "download-folder" : "download"}?session=${encodeURIComponent(session)}&path=${encodeURIComponent(full)}`;
        const name = isDir ? it.name + ".tar.gz" : it.name;
        try {
          const r = await window.desktop.downloadToDir(url, destDir, name);
          if (r && r.ok) ok++; else fail++;
        } catch (_) { fail++; }
      }
      toast(fail ? `${ok} indirildi, ${fail} başarısız` : `${ok} öğe indirildi → ${destDir}`, !!fail);
      loadLocal(destDir);
    });
    return;
  }

  // Sunucu → sunucu
  if (!dp.tok) return toast("Önce sağ panel için sunucu seç.", true);
  const c = activeConn();
  if (c && c.session === dp.tok) return toast("İki panel aynı sunucu — farklı bir sunucu seç.", true);
  const sel = items.map((it) => joinPath(cwd, it.name));
  enqueueTransfer(`Soldan al → ${rightLabel()} (${sel.length})`, async () => {
    await runTransfer(session, dp.tok, dp.cwd, sel);
    loadDp();
  });
}

// ---- 📤 Sola gönder: sağ panel seçilenleri → sol (aktif sunucu) ----
function transferRightToLeft() {
  const items = dpSelectedItems();
  if (!items.length) return toast("Sağ panelde aktarılacak öğe seç (kutucukla).", true);

  if (dp.mode === "local") {
    // Yerel → aktif sunucunun açık klasörüne yükle
    const abs = items.map((it) => it.abs).filter(Boolean);
    enqueueTransfer(`Yükle → ${activeLabel()} (${abs.length})`, () =>
      import("./local-explorer.js").then((m) => m.uploadLocalPaths(abs, abs)));
    return;
  }

  // Sunucu → sunucu
  if (!dp.tok) return toast("Önce sağ panel için sunucu seç.", true);
  const c = activeConn();
  if (c && c.session === dp.tok) return toast("İki panel aynı sunucu — farklı bir sunucu seç.", true);
  const sel = items.map((it) => joinPath(dp.cwd, it.name));
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
  // Sol tarafta panel (dashboard) açıksa dosya gezginine geç.
  import("./dashboard.js").then((m) => m.showFilesView()).catch(() => {});
  if (listConns().length < 2 && !isDesktop())
    toast("Çift panel için ikinci bir sunucuya bağlan (yeni sekmede).", true);
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
    if (dp.mode === "local") { if (dp.parent) loadLocal(dp.parent); return; }
    if (dp.cwd === "/") return;
    dp.cwd = dp.cwd.replace(/\/[^/]+\/?$/, "") || "/";
    loadDp();
  });
  $("dp-conn").addEventListener("change", (e) => setConn(e.target.value));
  $("dp-to-right").addEventListener("click", transferLeftToRight);
  $("dp-to-left").addEventListener("click", transferRightToLeft);
}
