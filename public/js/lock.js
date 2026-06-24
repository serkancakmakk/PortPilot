import { $, toast, escapeHtml } from "./dom.js";
import { applyIcons } from "./icons.js";

// Uygulama kilidi: açılışta (kilit etkinse) parola sorar; otomatik kilit destekler.
// Parola sunucuda scrypt ile hash'lenir (routes/lock.js); burada yalnızca UI ve doğrulama.

let state = { enabled: false, autoLockMin: 0 };
let idleTimer = null;

async function fetchStatus() {
  try {
    const r = await fetch("/api/lock/status");
    if (r.ok) state = await r.json();
  } catch (_) {}
  return state;
}

function setLinkLabel() {
  const el = $("applock-link-label");
  if (el) el.textContent = state.enabled ? "Uygulama kilidini yönet" : "Uygulama kilidi kur";
}

// ---- Kilit ekranı ----
export function showLockScreen() {
  const scr = $("lock-screen");
  if (!scr) return;
  scr.hidden = false;
  document.body.classList.add("locked");
  const input = $("lock-input");
  if (input) { input.value = ""; setTimeout(() => input.focus(), 60); }
  maybeShowBiometric();
}

function hideLockScreen() {
  const scr = $("lock-screen");
  if (scr) scr.hidden = true;
  document.body.classList.remove("locked");
  $("lock-error").textContent = "";
  resetIdle();
}

async function tryUnlock(password) {
  const err = $("lock-error");
  err.textContent = "";
  try {
    const r = await fetch("/api/lock/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const d = await r.json();
    if (d.ok) { hideLockScreen(); return true; }
    err.textContent = "Parola yanlış.";
  } catch (e) {
    err.textContent = "Doğrulanamadı: " + e.message;
  }
  return false;
}

// ---- Touch ID (yalnızca macOS masaüstü) ----
async function maybeShowBiometric() {
  const btn = $("lock-bio");
  if (!btn) return;
  if (window.desktop && window.desktop.biometricAvailable) {
    try {
      const ok = await window.desktop.biometricAvailable();
      btn.hidden = !ok;
    } catch (_) { btn.hidden = true; }
  } else {
    btn.hidden = true;
  }
}

async function biometricUnlock() {
  if (!(window.desktop && window.desktop.biometricPrompt)) return;
  try {
    const ok = await window.desktop.biometricPrompt("PortPilot kilidini aç");
    if (ok) hideLockScreen();
    else $("lock-error").textContent = "Touch ID doğrulanamadı.";
  } catch (e) {
    $("lock-error").textContent = e.message || "Touch ID kullanılamadı.";
  }
}

// ---- Otomatik kilit (boşta kalınca) ----
function resetIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!state.enabled || !state.autoLockMin) return;
  idleTimer = setTimeout(() => showLockScreen(), state.autoLockMin * 60 * 1000);
}

function wireIdleTracking() {
  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, () => { if (!document.body.classList.contains("locked")) resetIdle(); }, { passive: true })
  );
}

// ---- Ayarlar diyaloğu (kur / değiştir / kaldır) ----
const AUTOLOCK_OPTS = [
  [0, "Kapalı"], [1, "1 dakika"], [5, "5 dakika"], [15, "15 dakika"], [30, "30 dakika"], [60, "1 saat"],
];

function openSettings() {
  let host = $("applock-overlay");
  if (!host) {
    host = document.createElement("div");
    host.id = "applock-overlay";
    host.className = "app-dialog-overlay";
    document.body.appendChild(host);
  }
  const enabled = state.enabled;
  const opts = AUTOLOCK_OPTS.map(([v, l]) =>
    `<option value="${v}"${v === state.autoLockMin ? " selected" : ""}>${l}</option>`).join("");

  host.innerHTML = `
    <div class="app-dialog applock-dialog" role="dialog" aria-modal="true">
      <div class="app-dialog-title"><span class="ad-ico">🔒</span>Uygulama Kilidi</div>
      <div class="applock-body">
        <p class="applock-desc">${enabled
          ? "Kilit etkin. Parolayı değiştirebilir, otomatik kilit süresini ayarlayabilir veya kilidi kaldırabilirsin."
          : "Uygulamayı açılışta bir parolayla koru. Parola bu cihazda güvenli (scrypt) saklanır."}</p>
        ${enabled ? `
          <label class="applock-label">Mevcut parola</label>
          <input type="password" id="al-current" class="app-dialog-input" autocomplete="off" />` : ""}
        <label class="applock-label">${enabled ? "Yeni parola (boş bırak = değiştirme)" : "Parola"}</label>
        <input type="password" id="al-new" class="app-dialog-input" autocomplete="off" />
        <label class="applock-label">Parola (tekrar)</label>
        <input type="password" id="al-new2" class="app-dialog-input" autocomplete="off" />
        <label class="applock-label">Otomatik kilit (boşta kalınca)</label>
        <select id="al-autolock" class="app-dialog-input">${opts}</select>
        <div id="al-error" class="login-error"></div>
      </div>
      <div class="app-dialog-actions">
        ${enabled ? '<button type="button" class="ad-btn danger al-disable" style="margin-right:auto">Kilidi Kaldır</button>' : ""}
        <button type="button" class="ad-btn al-cancel">İptal</button>
        <button type="button" class="ad-btn primary al-save">${enabled ? "Kaydet" : "Kilidi Kur"}</button>
      </div>
    </div>`;
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add("show"));
  applyIcons();

  const close = () => {
    host.classList.remove("show");
    setTimeout(() => { host.hidden = true; host.innerHTML = ""; }, 140);
  };
  const err = host.querySelector("#al-error");

  host.querySelector(".al-cancel").onclick = close;
  host.addEventListener("mousedown", (e) => { if (e.target === host) close(); });

  host.querySelector(".al-save").onclick = async () => {
    err.textContent = "";
    const current = enabled ? host.querySelector("#al-current").value : "";
    const pw = host.querySelector("#al-new").value;
    const pw2 = host.querySelector("#al-new2").value;
    const autoLockMin = Number(host.querySelector("#al-autolock").value) || 0;

    // Etkinse ve yalnızca otomatik kilit değiştiriliyorsa (yeni parola boş)
    if (enabled && !pw) {
      try {
        const r = await fetch("/api/lock/autolock", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoLockMin }),
        });
        if (!r.ok) throw new Error((await r.json()).error || "Hata");
        state.autoLockMin = autoLockMin;
        toast("Otomatik kilit güncellendi");
        resetIdle();
        close();
      } catch (e) { err.textContent = e.message; }
      return;
    }

    if (pw.length < 4) { err.textContent = "Parola en az 4 karakter olmalı."; return; }
    if (pw !== pw2) { err.textContent = "Parolalar eşleşmiyor."; return; }
    try {
      const r = await fetch("/api/lock/set", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw, current, autoLockMin }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Kaydedilemedi");
      state.enabled = true;
      state.autoLockMin = autoLockMin;
      setLinkLabel();
      resetIdle();
      toast(enabled ? "Kilit güncellendi" : "Uygulama kilidi kuruldu");
      close();
    } catch (e) { err.textContent = e.message; }
  };

  const disableBtn = host.querySelector(".al-disable");
  if (disableBtn) disableBtn.onclick = async () => {
    err.textContent = "";
    const current = host.querySelector("#al-current").value;
    if (!current) { err.textContent = "Kaldırmak için mevcut parolayı gir."; return; }
    try {
      const r = await fetch("/api/lock/disable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Kaldırılamadı");
      state.enabled = false;
      state.autoLockMin = 0;
      setLinkLabel();
      resetIdle();
      toast("Uygulama kilidi kaldırıldı");
      close();
    } catch (e) { err.textContent = e.message; }
  };
}

export async function initLock() {
  await fetchStatus();
  setLinkLabel();
  wireIdleTracking();

  if (state.enabled) showLockScreen();
  else resetIdle();

  const input = $("lock-input");
  if ($("lock-unlock")) $("lock-unlock").addEventListener("click", () => tryUnlock(input.value));
  if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(input.value); });
  if ($("lock-bio")) $("lock-bio").addEventListener("click", biometricUnlock);
  if ($("open-applock")) $("open-applock").addEventListener("click", openSettings);
}
