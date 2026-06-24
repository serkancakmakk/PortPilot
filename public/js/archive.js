// Arşivle / çıkar — sunucu üzerinde tar.gz / zip oluştur veya arşivi aç.
import { showLoading, toast } from "./dom.js";
import { cwd } from "./state.js";
import { navigate } from "./explorer.js";
import { api } from "./api.js";
import { confirmDialog } from "./dialog.js";

// Çıkarılabilir arşiv uzantıları
export const ARCHIVE_EXT = /\.(tar\.gz|tgz|tar\.bz2|tbz2?|tar\.xz|txz|tar|zip|gz)$/i;

// Ad + biçim soran küçük modal (dialog.js stiliyle aynı görünüm)
function askArchive(defaultName) {
  return new Promise((resolve) => {
    const h = document.createElement("div");
    h.className = "app-dialog-overlay";
    h.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true">
        <div class="app-dialog-title">🗜️ Arşivle</div>
        <div class="app-dialog-msg">Arşiv adı:</div>
        <input class="app-dialog-input" type="text" autocomplete="off" />
        <div class="arc-formats">
          <label class="arc-fmt"><input type="radio" name="arc-fmt" value="targz" checked> .tar.gz <span class="arc-hint">(Linux/Unix)</span></label>
          <label class="arc-fmt"><input type="radio" name="arc-fmt" value="zip"> .zip <span class="arc-hint">(Windows uyumlu)</span></label>
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="ad-btn ad-cancel">İptal</button>
          <button type="button" class="ad-btn ad-ok primary">Arşivle</button>
        </div>
      </div>`;
    document.body.appendChild(h);
    requestAnimationFrame(() => h.classList.add("show"));

    const input = h.querySelector(".app-dialog-input");
    input.value = defaultName;
    setTimeout(() => { input.focus(); input.select(); }, 40);

    const cleanup = (val) => {
      h.classList.remove("show");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => h.remove(), 140);
      resolve(val);
    };
    const ok = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      const format = h.querySelector('input[name="arc-fmt"]:checked').value;
      cleanup({ name, format });
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(null); }
      else if (e.key === "Enter") { e.preventDefault(); ok(); }
    };
    h.querySelector(".ad-ok").addEventListener("click", ok);
    h.querySelector(".ad-cancel").addEventListener("click", () => cleanup(null));
    h.addEventListener("mousedown", (e) => { if (e.target === h) cleanup(null); });
    document.addEventListener("keydown", onKey, true);
  });
}

// sources: tam yol dizisi (aktif klasördeki öğeler)
export async function archiveItems(sources) {
  if (!sources || !sources.length) return;
  const names = sources.map((p) => p.split("/").filter(Boolean).pop());
  const def = names.length === 1 ? names[0] : "arsiv";
  const choice = await askArchive(def);
  if (!choice) return;
  showLoading(true);
  try {
    const r = await api("archive", {
      method: "POST",
      json: { dir: cwd, sources, name: choice.name, format: choice.format },
    });
    toast(`Arşiv oluşturuldu: ${r.name || choice.name}`);
    await navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}

// Arşivi bulunduğu klasöre çıkar
export async function extractArchive(item, full) {
  if (!(await confirmDialog(
    `“${item.name}” arşivini bu klasöre çıkar?`,
    { title: "Arşivi Çıkar", okText: "Çıkar" }
  ))) return;
  showLoading(true);
  try {
    await api("extract", { method: "POST", json: { path: full, dest: cwd } });
    toast("Arşiv çıkarıldı");
    await navigate(cwd, false);
  } catch (e) { toast(e.message, true); }
  finally { showLoading(false); }
}
