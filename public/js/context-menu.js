import { $, showLoading } from "./dom.js";
import { cwd, session } from "./state.js";
import { joinPath, navigate, isEditable, downloadFile, downloadFolder } from "./explorer.js";
import { api } from "./api.js";
import { toast } from "./dom.js";
import { confirmDialog, promptDialog } from "./dialog.js";

const menu = $("context-menu");

export function showContextMenu(e, item) {
  const full = joinPath(cwd, item.name);
  const actions = [];
  if (item.type === "dir") {
    actions.push({ label: "📂 Aç", fn: () => navigate(full) });
    actions.push({ label: "⌨ Terminal'i burada aç", fn: () => import("./terminal.js").then((m) => m.openServerTerminal(full)) });
    actions.push({ label: "⬇ İndir (.tar.gz)", fn: () => downloadFolder(full) });
  } else {
    if (isEditable(item.name))
      actions.push({ label: "📝 Düzenle", fn: () => import("./editor.js").then((m) => m.editFile(item, full)) });
    actions.push({ label: "⬇ İndir", fn: () => downloadFile(full) });
  }
  actions.push({ label: "✏ Yeniden adlandır", fn: () => renameItem(item, full) });
  actions.push({ sep: true });
  actions.push({ label: "🗑 Sil", danger: true, fn: () => deleteItem(item, full) });
  renderMenu(e, actions);
}

export function showAreaMenu(e) {
  if (e.target.closest("tr, .tile")) return;
  e.preventDefault();
  renderMenu(e, [
    { label: "⌨ Terminal'i burada aç", fn: () => import("./terminal.js").then((m) => m.openServerTerminal(cwd)) },
    { label: "📁 Yeni Klasör", fn: () => import("./toolbar.js").then((m) => m.newFolder()) },
    { label: "🔄 Yenile", fn: () => navigate(cwd, false) },
  ]);
}

function renderMenu(e, actions) {
  menu.innerHTML = "";
  actions.forEach((a) => {
    if (a.sep) {
      const s = document.createElement("div");
      s.className = "sep";
      menu.appendChild(s);
      return;
    }
    const el = document.createElement("div");
    el.className = "item" + (a.danger ? " danger" : "");
    el.textContent = a.label;
    el.onclick = () => { hideMenu(); a.fn(); };
    menu.appendChild(el);
  });
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + "px";
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 20) + "px";
  menu.hidden = false;
}

export function hideMenu() { menu.hidden = true; }

async function renameItem(item, full) {
  const { cwd } = await import("./state.js");
  const name = await promptDialog("Yeni ad:", { title: "Yeniden Adlandır", defaultValue: item.name, okText: "Kaydet" });
  if (!name || name === item.name) return;
  try {
    await api("rename", { method: "POST", json: { from: full, to: joinPath(cwd, name) } });
    toast("Yeniden adlandırıldı");
    navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
}

async function deleteItem(item, full) {
  const { cwd } = await import("./state.js");
  const what = item.type === "dir" ? "klasörü ve TÜM içeriğini" : "dosyayı";
  if (!(await confirmDialog(`"${item.name}" ${what} kalıcı olarak silmek istiyor musun?`, { title: "Silinsin mi?", okText: "Sil", danger: true }))) return;

  // Tek dosya → hızlı; klasör → ilerlemeli (akıtmalı) silme
  if (item.type !== "dir") {
    showLoading(true);
    try {
      await api("delete", { method: "POST", json: { path: full, type: item.type } });
      toast("Silindi");
      await navigate(cwd, false);
    } catch (e) { toast(e.message, true); }
    finally { showLoading(false); }
    return;
  }

  const box = $("upload-progress");
  const bar = $("upload-progress-bar");
  const label = $("upload-progress-label");
  const cancelBtn = $("upload-cancel");
  if (box) box.hidden = false;
  if (cancelBtn) cancelBtn.hidden = true;
  if (bar) { bar.classList.remove("writing"); bar.style.width = "0%"; }
  if (label) label.textContent = "Siliniyor…";

  let total = 0, err = null;
  try {
    const res = await fetch("/api/delete-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { "x-session": session } : {}) },
      body: JSON.stringify({ path: full, type: item.type }),
    });
    if (!res.ok || !res.body) throw new Error("Silme başlatılamadı (HTTP " + res.status + ")");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (_) { continue; }
        if (o.total != null) total = o.total;
        if (o.done != null && label && bar) {
          const pct = total ? Math.round((o.done / total) * 100) : 0;
          bar.style.width = pct + "%";
          const left = Math.max(0, total - o.done);
          label.textContent = `Siliniyor… ${o.done}/${total} · ${left} kaldı · %${pct}`;
        }
        if (o.error) err = o.error;
      }
    }
  } catch (e) { err = e.message; }

  if (box) box.hidden = true;
  if (cancelBtn) cancelBtn.hidden = false;
  if (err) toast(err, true);
  else { toast("Silindi"); await navigate(cwd, false); }
}
