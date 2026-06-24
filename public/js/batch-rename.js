// Toplu yeniden adlandırma — bul/değiştir (regex) veya sıralı isimlendirme,
// canlı önizleme ile. Yeni adları istemcide hesaplayıp /api/rename-batch'e yollar.
import { showLoading, toast, escapeHtml } from "./dom.js";
import { cwd } from "./state.js";
import { joinPath, navigate } from "./explorer.js";
import { api } from "./api.js";

// Uzantıyı ayır ("dosya.tar.gz" → name:"dosya.tar", ext:".gz"); klasörlerde uzantı yok.
function splitExt(name, isDir) {
  if (isDir) return { base: name, ext: "" };
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

function pad(n, width) {
  const s = String(n);
  return width > 0 ? s.padStart(width, "0") : s;
}

// Bir öğe listesi + ayarlardan yeni adları hesapla. Hata varsa {error} döndürür.
function computeNames(items, cfg) {
  let re = null;
  if (cfg.mode === "replace" && cfg.find) {
    try { re = new RegExp(cfg.find, cfg.flags); }
    catch (e) { return { error: "Geçersiz desen: " + e.message }; }
  }
  const out = [];
  const seen = new Set();
  let idx = cfg.start;
  for (const it of items) {
    const { base, ext } = splitExt(it.name, it.type === "dir");
    let nextBase = base, nextName;
    if (cfg.mode === "replace") {
      nextBase = re ? base.replace(re, cfg.repl) : base;
      nextName = nextBase + ext;
    } else {
      // Sıralı: {n} sıra no, {name} özgün ad. {n} yoksa sona ekle.
      const num = pad(idx, cfg.width);
      let tmpl = cfg.pattern || "{name}-{n}";
      if (!/\{n\}/.test(tmpl)) tmpl += "-{n}";
      nextBase = tmpl.replace(/\{n\}/g, num).replace(/\{name\}/g, base);
      nextName = nextBase + ext;
      idx += 1;
    }
    const dup = seen.has(nextName);
    seen.add(nextName);
    out.push({ from: it.name, to: nextName, changed: nextName !== it.name, dup, type: it.type });
  }
  return { rows: out };
}

export function batchRename(items) {
  if (!items || items.length < 1) return;
  const h = document.createElement("div");
  h.className = "app-dialog-overlay";
  h.innerHTML = `
    <div class="app-dialog br-dialog" role="dialog" aria-modal="true">
      <div class="app-dialog-title">✏️ Toplu Yeniden Adlandırma (${items.length})</div>
      <div class="br-tabs">
        <button type="button" class="br-tab active" data-mode="replace">Bul / Değiştir</button>
        <button type="button" class="br-tab" data-mode="seq">Sıralı</button>
      </div>
      <div class="br-pane" data-pane="replace">
        <label class="br-field">Bul (regex)<input class="br-find" type="text" autocomplete="off" placeholder="ör. \\s+ veya ^IMG_"></label>
        <label class="br-field">Değiştir<input class="br-repl" type="text" autocomplete="off" placeholder="boş bırak = sil"></label>
        <label class="br-check"><input type="checkbox" class="br-ci" checked> Büyük/küçük harf duyarsız</label>
      </div>
      <div class="br-pane" data-pane="seq" hidden>
        <label class="br-field">Desen<input class="br-pattern" type="text" autocomplete="off" value="{name}-{n}"></label>
        <div class="br-row">
          <label class="br-field br-sm">Başlangıç<input class="br-start" type="number" value="1"></label>
          <label class="br-field br-sm">Basamak<input class="br-width" type="number" value="2" min="0"></label>
        </div>
        <div class="br-hint">{name} = özgün ad · {n} = sıra no</div>
      </div>
      <div class="br-preview"><table class="br-table"><tbody></tbody></table></div>
      <div class="app-dialog-actions">
        <span class="br-count"></span>
        <button type="button" class="ad-btn ad-cancel">İptal</button>
        <button type="button" class="ad-btn ad-ok primary">Uygula</button>
      </div>
    </div>`;
  document.body.appendChild(h);
  requestAnimationFrame(() => h.classList.add("show"));

  let mode = "replace";
  const q = (s) => h.querySelector(s);
  const tbody = q(".br-table tbody");
  const countEl = q(".br-count");
  const okBtn = q(".ad-ok");

  function readCfg() {
    return {
      mode,
      find: q(".br-find").value,
      repl: q(".br-repl").value,
      flags: "g" + (q(".br-ci").checked ? "i" : ""),
      pattern: q(".br-pattern").value,
      start: parseInt(q(".br-start").value, 10) || 0,
      width: Math.max(0, parseInt(q(".br-width").value, 10) || 0),
    };
  }

  function refresh() {
    const res = computeNames(items, readCfg());
    if (res.error) {
      tbody.innerHTML = `<tr><td class="br-err">${escapeHtml(res.error)}</td></tr>`;
      countEl.textContent = "";
      okBtn.disabled = true;
      return;
    }
    const rows = res.rows;
    const changed = rows.filter((r) => r.changed).length;
    const dups = rows.filter((r) => r.dup).length;
    tbody.innerHTML = rows.map((r) => {
      const cls = r.dup ? "br-dup" : r.changed ? "br-chg" : "br-same";
      return `<tr class="${cls}">
        <td class="br-old">${escapeHtml(r.from)}</td>
        <td class="br-arrow">→</td>
        <td class="br-new">${escapeHtml(r.to)}${r.dup ? ' <span class="br-tag">çakışma</span>' : ""}</td>
      </tr>`;
    }).join("");
    countEl.textContent = dups
      ? `${dups} çakışma — düzelt`
      : `${changed} ad değişecek`;
    okBtn.disabled = changed === 0 || dups > 0;
  }

  // Sekme geçişi
  h.querySelectorAll(".br-tab").forEach((t) => {
    t.addEventListener("click", () => {
      mode = t.dataset.mode;
      h.querySelectorAll(".br-tab").forEach((x) => x.classList.toggle("active", x === t));
      h.querySelectorAll(".br-pane").forEach((p) => { p.hidden = p.dataset.pane !== mode; });
      refresh();
    });
  });
  h.querySelectorAll("input").forEach((i) => i.addEventListener("input", refresh));

  const cleanup = () => {
    h.classList.remove("show");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => h.remove(), 140);
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(); }
  };
  q(".ad-cancel").addEventListener("click", cleanup);
  h.addEventListener("mousedown", (e) => { if (e.target === h) cleanup(); });
  document.addEventListener("keydown", onKey, true);

  okBtn.addEventListener("click", async () => {
    const res = computeNames(items, readCfg());
    if (res.error) return;
    const pairs = res.rows
      .filter((r) => r.changed && !r.dup)
      .map((r) => ({ from: joinPath(cwd, r.from), to: joinPath(cwd, r.to) }));
    if (!pairs.length) return;
    cleanup();
    showLoading(true);
    try {
      const r = await api("rename-batch", { method: "POST", json: { items: pairs } });
      if (r.failed) toast(`${r.done} yeniden adlandırıldı, ${r.failed} başarısız${r.error ? " · " + r.error : ""}`, true);
      else toast(`${r.done} öğe yeniden adlandırıldı`);
      await navigate(cwd, false);
    } catch (e) { toast(e.message, true); }
    finally { showLoading(false); }
  });

  setTimeout(() => { q(".br-find").focus(); }, 40);
  refresh();
}
