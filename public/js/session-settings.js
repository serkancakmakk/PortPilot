import { $ } from "./dom.js";

const DEFAULT_SESSION_PREFS = {
  idleTimeoutMin: 30,
  restoreOpenSessions: true,
  autoConnectSavedServer: false,
  autoConnectMode: "last",
  lastConnectedServerId: "",
};

let sessionPrefs = { ...DEFAULT_SESSION_PREFS };
let saveTimer = null;

function normalizePrefs(prefs) {
  const src = prefs && typeof prefs === "object" ? prefs : {};
  const n = Number(src.idleTimeoutMin);
  return {
    idleTimeoutMin: Number.isFinite(n) ? Math.max(0, Math.min(1440, Math.round(n))) : 30,
    restoreOpenSessions: src.restoreOpenSessions !== false,
    autoConnectSavedServer: src.autoConnectSavedServer === true,
    autoConnectMode: src.autoConnectMode === "first" ? "first" : "last",
    lastConnectedServerId: src.lastConnectedServerId ? String(src.lastConnectedServerId) : "",
  };
}

function setStatus(text, isError = false) {
  const el = $("params-status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
}

function applyToForm() {
  if ($("idle-timeout-min")) $("idle-timeout-min").value = String(sessionPrefs.idleTimeoutMin);
  if ($("restore-open-sessions")) $("restore-open-sessions").checked = sessionPrefs.restoreOpenSessions;
  if ($("auto-connect-saved-server")) $("auto-connect-saved-server").checked = sessionPrefs.autoConnectSavedServer;
  if ($("auto-connect-mode")) {
    $("auto-connect-mode").value = sessionPrefs.autoConnectMode;
    $("auto-connect-mode").disabled = !sessionPrefs.autoConnectSavedServer;
  }
}

async function savePrefs(partial = {}) {
  sessionPrefs = normalizePrefs({ ...sessionPrefs, ...partial });
  applyToForm();
  try {
    const res = await fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sessionPrefs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Oturum ayarları kaydedilemedi.");
    sessionPrefs = normalizePrefs(data.prefs && data.prefs.session);
    applyToForm();
    setStatus("Kaydedildi");
  } catch (err) {
    setStatus(err.message || "Oturum ayarları kaydedilemedi.", true);
  }
}

function queueSave(partial) {
  sessionPrefs = normalizePrefs({ ...sessionPrefs, ...partial });
  applyToForm();
  setStatus("Kaydediliyor...");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => savePrefs(), 350);
}

export async function loadSessionPrefs() {
  try {
    const res = await fetch("/api/prefs");
    if (!res.ok) throw new Error();
    const data = await res.json();
    sessionPrefs = normalizePrefs(data.prefs && data.prefs.session);
  } catch (_) {
    sessionPrefs = { ...DEFAULT_SESSION_PREFS };
  }
  applyToForm();
  return sessionPrefs;
}

export function getSessionPrefs() {
  return sessionPrefs;
}

export function rememberConnectedServer(id) {
  if (!id) return;
  savePrefs({ lastConnectedServerId: String(id) });
}

export function initSessionSettings() {
  if ($("btn-params")) {
    $("btn-params").addEventListener("click", () => {
      setStatus("");
      loadSessionPrefs();
      $("params-panel").hidden = false;
    });
  }
  if ($("params-close")) {
    $("params-close").addEventListener("click", () => {
      $("params-panel").hidden = true;
    });
  }
  if ($("params-panel")) {
    $("params-panel").addEventListener("mousedown", (e) => {
      if (e.target === $("params-panel")) $("params-panel").hidden = true;
    });
  }

  if ($("idle-timeout-min")) {
    $("idle-timeout-min").addEventListener("change", (e) => {
      queueSave({ idleTimeoutMin: e.target.value });
    });
  }
  if ($("restore-open-sessions")) {
    $("restore-open-sessions").addEventListener("change", (e) => {
      queueSave({ restoreOpenSessions: e.target.checked });
    });
  }
  if ($("auto-connect-saved-server")) {
    $("auto-connect-saved-server").addEventListener("change", (e) => {
      queueSave({ autoConnectSavedServer: e.target.checked });
    });
  }
  if ($("auto-connect-mode")) {
    $("auto-connect-mode").addEventListener("change", (e) => {
      queueSave({ autoConnectMode: e.target.value });
    });
  }

  loadSessionPrefs();
}
