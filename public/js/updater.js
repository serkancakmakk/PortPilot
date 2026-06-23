import { $, toast } from "./dom.js";
import { confirmDialog } from "./dialog.js";

let updateChecking = false;

function setUpdateLabel(text) {
  const btn = $("btn-update");
  if (!btn) return;
  btn.childNodes.forEach((n) => { if (n.nodeType === 3) n.textContent = ""; });
  btn.insertBefore(document.createTextNode(" " + text), btn.querySelector(".upd-dot"));
}

async function runUpdateCheck(silent) {
  if (!window.desktop || !window.desktop.checkUpdate) return;
  const btn = $("btn-update");
  if (updateChecking) return;
  updateChecking = true;
  if (btn && !silent) { btn.classList.add("checking"); setUpdateLabel("Denetleniyor…"); }
  try {
    const r = await window.desktop.checkUpdate({ silent });
    if (r && r.packaged === false) {
      if (!r.ok) { if (!silent) toast("Güncelleme denetlenemedi: " + (r.error || "ağ hatası"), true); return; }
      if (r.hasUpdate && !silent) {
        const go = await confirmDialog(`Yeni sürüm var: v${r.latest} (yüklü: v${r.current})\n\nİndirme sayfasını açmak ister misin?`, { title: "Güncelleme Var", okText: "İndir", icon: "" });
        if (go) window.desktop.openExternal(r.url);
      } else if (!r.hasUpdate && !silent) {
        toast(`En güncel sürümdesin (v${r.current}).`);
      }
      return;
    }
    if (r && !r.ok && !silent) toast("Güncelleme denetlenemedi: " + (r.error || "hata"), true);
  } finally {
    updateChecking = false;
    if (btn && !silent) btn.classList.remove("checking");
    setUpdateLabel("Güncellemeleri Denetle");
  }
}

function handleUpdateEvent(p) {
  const btn = $("btn-update");
  const dot = btn && btn.querySelector(".upd-dot");
  if (!p || !btn) return;
  switch (p.state) {
    case "available":
      if (dot) dot.hidden = false;
      btn.classList.add("has-update");
      break;
    case "downloading":
      btn.classList.add("checking");
      setUpdateLabel(`İndiriliyor… %${p.percent || 0}`);
      break;
    case "downloaded":
      btn.classList.remove("checking");
      btn.classList.add("has-update");
      if (dot) dot.hidden = false;
      setUpdateLabel("Yeniden başlatınca kurulacak");
      toast(`v${p.version} indirildi — kurmak için yeniden başlat.`);
      break;
    case "latest":
      if (dot) dot.hidden = true;
      btn.classList.remove("has-update", "checking");
      setUpdateLabel("Güncellemeleri Denetle");
      if (!p.silent) toast("En güncel sürümdesin.");
      break;
    case "error":
      btn.classList.remove("checking");
      setUpdateLabel("Güncellemeleri Denetle");
      if (!p.silent) toast("Güncelleme hatası: " + (p.error || "bilinmiyor"), true);
      break;
  }
}

export function initDesktop() {
  if (!window.desktop || !window.desktop.isDesktop) return;
  document.body.classList.add("is-desktop");
  const dl = $("open-downloads");
  if (dl) dl.hidden = true;
  const btn = $("btn-update");
  if (btn) {
    btn.hidden = false;
    btn.addEventListener("click", () => runUpdateCheck(false));
  }
  if (window.desktop.onUpdate) window.desktop.onUpdate(handleUpdateEvent);
  setTimeout(() => runUpdateCheck(true), 2500);
}
