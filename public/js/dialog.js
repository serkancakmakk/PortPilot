// Modern diyaloglar (native confirm/prompt/alert yerine)
import { escapeHtml } from "./dom.js";

let _host = null;
function host() {
  if (_host) return _host;
  _host = document.createElement("div");
  _host.className = "app-dialog-overlay";
  _host.hidden = true;
  document.body.appendChild(_host);
  return _host;
}

function open(o) {
  const {
    title = "", message = "", prompt = false, defaultValue = "",
    okText = "Tamam", cancelText = "İptal", danger = false, icon = "",
  } = o;
  return new Promise((resolve) => {
    const h = host();
    h.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true">
        ${title ? `<div class="app-dialog-title">${icon ? `<span class="ad-ico ${danger ? "danger" : ""}">${icon}</span>` : ""}${escapeHtml(title)}</div>` : ""}
        ${message ? `<div class="app-dialog-msg">${escapeHtml(message).replace(/\n/g, "<br>")}</div>` : ""}
        ${prompt ? `<input class="app-dialog-input" type="text" autocomplete="off" />` : ""}
        <div class="app-dialog-actions">
          <button type="button" class="ad-btn ad-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="ad-btn ad-ok ${danger ? "danger" : "primary"}">${escapeHtml(okText)}</button>
        </div>
      </div>`;
    h.hidden = false;
    requestAnimationFrame(() => h.classList.add("show"));

    const input = h.querySelector(".app-dialog-input");
    const okBtn = h.querySelector(".ad-ok");
    const cancelBtn = h.querySelector(".ad-cancel");
    if (input) { input.value = defaultValue; setTimeout(() => { input.focus(); input.select(); }, 40); }
    else setTimeout(() => okBtn.focus(), 40);

    const cleanup = (val) => {
      h.classList.remove("show");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => { h.hidden = true; h.innerHTML = ""; }, 140);
      resolve(val);
    };
    const onOk = () => cleanup(prompt ? input.value : true);
    const onCancel = () => cleanup(prompt ? null : false);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
      else if (e.key === "Enter") { e.preventDefault(); onOk(); }
    };
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    h.addEventListener("mousedown", (e) => { if (e.target === h) onCancel(); });
    document.addEventListener("keydown", onKey, true);
  });
}

const ICON_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

export function confirmDialog(message, opts = {}) {
  return open({
    message,
    title: opts.title || "Onay",
    okText: opts.okText || "Evet",
    cancelText: opts.cancelText || "Vazgeç",
    danger: opts.danger,
    icon: opts.danger ? ICON_WARN : (opts.icon || ""),
  });
}

export function promptDialog(message, opts = {}) {
  return open({
    message,
    prompt: true,
    title: opts.title || "",
    defaultValue: opts.defaultValue || "",
    okText: opts.okText || "Tamam",
    cancelText: opts.cancelText || "İptal",
  });
}
