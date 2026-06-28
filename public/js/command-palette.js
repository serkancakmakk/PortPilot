// Komut paleti (Cmd/Ctrl+K): tüm aksiyonları ve kayıtlı sunuculara bağlanmayı tek
// bir hızlı aramada toplar. Fuzzy filtre, ok tuşlarıyla gezinme, Enter ile çalıştır.
import { $ } from "./dom.js";
import { api } from "./api.js";
import { currentLang } from "./i18n.js";

const L = () => (currentLang() === "en" ? "en" : "tr");
const TX = (tr, en) => (L() === "en" ? en : tr);

let overlay = null, input = null, listEl = null;
let items = [];      // o anki görünür komutlar
let active = 0;      // seçili index

// Mevcut bir butonu "tıkla" (var olan handler'ı tetikle)
function clickBtn(id) { const el = $(id); if (el) el.click(); }

// Statik aksiyon komutları (sidebar/araç çubuğu eşlemleri)
function actionCommands() {
  const defs = [
    ["btn-dashboard", "Sunucu Paneli", "Server Dashboard", "📊"],
    ["btn-terminal", "Sunucu Terminali", "Server Terminal", "⌨️"],
    ["btn-docker", "Docker Yönetimi", "Docker Management", "🐳"],
    ["btn-systools", "Sunucu Araçları", "Server Tools", "🧰"],
    ["btn-audit", "İşlem Günlüğü", "Activity Log", "📜"],
    ["btn-whatsnew", "Sürüm Notları", "Release Notes", "✨"],
    ["btn-split", "Çift Panel", "Dual Pane", "▥"],
    ["btn-newfolder", "Yeni Klasör", "New Folder", "📁"],
    ["btn-upload", "Dosya Yükle", "Upload File", "⬆️"],
    ["btn-upload-folder", "Klasör Yükle", "Upload Folder", "⬆️"],
    ["btn-download", "İndir", "Download", "⬇️"],
    ["btn-refresh", "Yenile", "Refresh", "🔄"],
    ["btn-up", "Üst Klasör", "Parent Folder", "↰"],
    ["btn-fav", "Sık kullanılanlara ekle", "Add to favorites", "⭐"],
    ["btn-theme", "Tema değiştir (açık/koyu)", "Toggle theme (light/dark)", "🌗"],
    ["btn-lang", "Dil değiştir (TR/EN)", "Toggle language (TR/EN)", "🌍"],
    ["btn-disconnect", "Bağlantıyı Kes", "Disconnect", "🔌"],
  ];
  return defs
    .filter(([id]) => $(id))
    .map(([id, tr, en, icon]) => ({ id, title: TX(tr, en), icon, run: () => clickBtn(id) }));
}

// Kayıtlı sunucular → "Bağlan: <ad>" komutları
async function serverCommands() {
  try {
    const d = await api("servers");
    return (d.servers || []).map((s) => ({
      id: "srv:" + s.id,
      title: TX("Bağlan: ", "Connect: ") + (s.name || `${s.username}@${s.host}`),
      hint: `${(s.protocol || "sftp").toUpperCase()} · ${s.username}@${s.host}` + (s.jump ? "  🛡️" : ""),
      icon: "🖥️",
      run: () => import("./servers.js").then((m) => m.selectServer(s)),
    }));
  } catch (_) { return []; }
}

// Basit fuzzy: sorgu karakterleri sırayla geçiyor mu + öncelik skoru
function score(text, q) {
  text = text.toLowerCase(); q = q.toLowerCase();
  if (!q) return 1;
  if (text.includes(q)) return 1000 - text.indexOf(q); // tam alt dize → yüksek
  let ti = 0, qi = 0;
  while (ti < text.length && qi < q.length) { if (text[ti] === q[qi]) qi++; ti++; }
  return qi === q.length ? 1 : -1; // subsequence eşleşmesi
}

function render(q) {
  const scored = items
    .map((c) => ({ c, s: score(c.title + " " + (c.hint || ""), q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  active = 0;
  if (!scored.length) {
    listEl.innerHTML = `<div class="cmdp-empty">${TX("Eşleşen komut yok", "No matching command")}</div>`;
    return;
  }
  listEl.innerHTML = scored.map((x, i) => `
    <div class="cmdp-row${i === 0 ? " active" : ""}" data-i="${i}">
      <span class="cmdp-ico">${x.c.icon || "›"}</span>
      <span class="cmdp-title">${escapeHtml(x.c.title)}</span>
      ${x.c.hint ? `<span class="cmdp-hint">${escapeHtml(x.c.hint)}</span>` : ""}
    </div>`).join("");
  listEl._scored = scored;
  listEl.querySelectorAll(".cmdp-row").forEach((r) => {
    r.addEventListener("mousemove", () => setActive(Number(r.dataset.i)));
    r.addEventListener("click", () => exec(Number(r.dataset.i)));
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function setActive(i) {
  const rows = listEl.querySelectorAll(".cmdp-row");
  if (!rows.length) return;
  active = Math.max(0, Math.min(rows.length - 1, i));
  rows.forEach((r, idx) => r.classList.toggle("active", idx === active));
  rows[active].scrollIntoView({ block: "nearest" });
}

function exec(i) {
  const scored = listEl._scored;
  if (!scored || !scored[i]) return;
  close();
  try { scored[i].c.run(); } catch (e) { console.warn("komut hatası:", e); }
}

async function open() {
  if (!overlay) build();
  overlay.hidden = false;
  input.value = "";
  // Komutları topla (aksiyonlar + kayıtlı sunucular)
  items = actionCommands();
  render("");
  input.focus();
  // Sunucular asenkron gelir; gelince listeyi tazele (arama kutusu boşsa)
  const servers = await serverCommands();
  if (!overlay.hidden) { items = actionCommands().concat(servers); render(input.value); }
}

function close() { if (overlay) overlay.hidden = true; }

function build() {
  overlay = document.createElement("div");
  overlay.className = "cmdp-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="cmdp-box" role="dialog" aria-modal="true">
      <div class="cmdp-search-wrap">
        <span class="cmdp-search-ico">⌘</span>
        <input class="cmdp-search" type="text" placeholder="${TX("Komut veya sunucu ara…", "Search command or server…")}" autocomplete="off" spellcheck="false">
        <kbd class="cmdp-esc">esc</kbd>
      </div>
      <div class="cmdp-list"></div>
    </div>`;
  document.body.appendChild(overlay);
  input = overlay.querySelector(".cmdp-search");
  listEl = overlay.querySelector(".cmdp-list");

  input.addEventListener("input", () => render(input.value));
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); exec(active); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
}

export function initCommandPalette() {
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (overlay && !overlay.hidden) close(); else open();
    }
  });
}
