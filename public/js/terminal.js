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
  $("term-title").textContent = "⌨ " + name;
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
  termState = { term, ws, onResize };
}

export function closeTerminal() {
  if (termState) {
    window.removeEventListener("resize", termState.onResize);
    try {
      termState.ws.close();
    } catch (_) {}
    try {
      termState.term.dispose();
    } catch (_) {}
    termState = null;
  }
  $("terminal-modal").hidden = true;
}

export function openServerTerminal(dir) {
  const name = dir ? "Terminal — " + dir : "Sunucu Terminali";
  openTerminal("__host__", name, dir);
}

export function initTerminal() {
  $("term-close").addEventListener("click", closeTerminal);
  const btnTerminal = $("btn-terminal");
  if (btnTerminal)
    btnTerminal.addEventListener("click", () => openServerTerminal());
  // docker.js'in inline onclick'leri için global
  window._openTerminal = openTerminal;
}
