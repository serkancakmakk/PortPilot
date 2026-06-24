import { $, toast } from "./dom.js";
import { session } from "./state.js";

let termState = null;

export function openTerminal(id, name, dir) {
  if (!session) {
    toast("Önce bir sunucuya bağlan.", true);
    return;
  }
  if (typeof Terminal === "undefined") {
    toast("Terminal bileşeni yüklenemedi.", true);
    return;
  }
  // Önceki terminal varsa kapat (sızıntıyı önle)
  disposeTerminal();
  $("term-dock").hidden = true;
  $("term-title").textContent = "⌨ " + name;
  $("term-dock-name").textContent = name;
  $("terminal-modal").hidden = false;
  const host = $("term-host");
  host.innerHTML = "";

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    theme: { background: "#0b1020", foreground: "#e6e9ef" },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  requestAnimationFrame(() => {
    try {
      fit.fit();
      sendResize();
    } catch (_) {}
  });
  term.focus();

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url =
    `${proto}://${location.host}/api/terminal?session=${encodeURIComponent(session)}` +
    `&id=${encodeURIComponent(id)}&cols=${term.cols}&rows=${term.rows}` +
    (dir ? `&dir=${encodeURIComponent(dir)}` : "");
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const sendResize = () => {
    if (ws.readyState === 1)
      ws.send(JSON.stringify({ r: [term.cols, term.rows] }));
  };
  ws.onopen = () => {
    try {
      fit.fit();
    } catch (_) {}
    sendResize();
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") term.write(ev.data);
    else term.write(new Uint8Array(ev.data));
  };
  ws.onclose = () => term.write("\r\n\x1b[90m[bağlantı kapandı]\x1b[0m\r\n");
  ws.onerror = () => term.write("\r\n\x1b[31m[bağlantı hatası]\x1b[0m\r\n");
  term.onData((d) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ i: d }));
  });

  const onResize = () => {
    try {
      fit.fit();
      sendResize();
    } catch (_) {}
  };
  window.addEventListener("resize", onResize);
  // Kutu boyutu (kullanıcı sürükleyince) değişince xterm'i yeniden sığdır
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => onResize());
    ro.observe(host);
  }
  termState = { term, ws, onResize, ro, fit };
}

function disposeTerminal() {
  if (!termState) return;
  window.removeEventListener("resize", termState.onResize);
  try { termState.ro && termState.ro.disconnect(); } catch (_) {}
  try { termState.ws.close(); } catch (_) {}
  try { termState.term.dispose(); } catch (_) {}
  termState = null;
}

export function closeTerminal() {
  disposeTerminal();
  $("terminal-modal").hidden = true;
  $("term-dock").hidden = true;
}

// Küçült: overlay'i gizle ama bağlantıyı/oturumu canlı tut
export function minimizeTerminal() {
  if (!termState) return closeTerminal();
  $("terminal-modal").hidden = true;
  $("term-dock").hidden = false;
}

// Geri dön: overlay'i tekrar göster ve yeniden sığdır
export function restoreTerminal() {
  if (!termState) return;
  $("term-dock").hidden = true;
  $("terminal-modal").hidden = false;
  requestAnimationFrame(() => {
    termState.onResize();
    termState.term.focus();
  });
}

export function openServerTerminal(dir) {
  const name = dir ? "Terminal — " + dir : "Sunucu Terminali";
  openTerminal("__host__", name, dir);
}

export function initTerminal() {
  $("term-close").addEventListener("click", closeTerminal);
  $("term-min").addEventListener("click", minimizeTerminal);
  $("term-restore").addEventListener("click", restoreTerminal);
  $("term-dock-close").addEventListener("click", closeTerminal);
  const btnTerminal = $("btn-terminal");
  if (btnTerminal)
    btnTerminal.addEventListener("click", () => openServerTerminal());
  // docker.js'in inline onclick'leri için global
  window._openTerminal = openTerminal;
}
