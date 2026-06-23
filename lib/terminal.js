const { WebSocketServer } = require("ws");
const { sessions, hasExec } = require("./sessions");
const { shQuote, SAFE_ID } = require("./shell-utils");

// ---- Sunucu / konteyner terminali (WebSocket + SSH PTY) ----
// Tarayıcı /api/terminal'e bağlanır. id boş ya da "__host__" ise sunucunun
// kendisinde interaktif bir kabuk (SSH shell) açılır; geçerli bir konteyner
// kimliği verilirse `docker exec -it` ile o konteynerde kabuk açılır.
// Her iki durumda da iki yönlü akış WebSocket'e bağlanır.
function attachTerminal(server) {
  const wss = new WebSocketServer({ server, path: "/api/terminal" });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("session");
    const id = url.searchParams.get("id");
    const dir = url.searchParams.get("dir");
    const cols = Math.min(500, Math.max(20, parseInt(url.searchParams.get("cols"), 10) || 80));
    const rows = Math.min(200, Math.max(5, parseInt(url.searchParams.get("rows"), 10) || 24));
    const say = (t) => { try { if (ws.readyState === 1) ws.send(t); } catch (_) {} };

    const s = token && sessions.get(token);
    if (!s) { say("\r\nOturum bulunamadı veya süresi doldu.\r\n"); return ws.close(); }
    if (!hasExec(s)) { say("\r\nTerminal yalnızca SFTP (SSH) bağlantılarında kullanılabilir.\r\n"); return ws.close(); }

    // id verilmediyse ya da "__host__" ise sunucunun kendisine bağlan
    const isHost = !id || id === "__host__";
    if (!isHost && !SAFE_ID.test(id)) { say("\r\nGeçersiz konteyner kimliği.\r\n"); return ws.close(); }
    s.lastUsed = Date.now();

    // Açılan akışı (SSH kanalı) WebSocket'e bağla — iki durum için ortak
    const onStream = (err, stream) => {
      if (err) { say("\r\nHata: " + err.message + "\r\n"); return ws.close(); }
      stream.on("data", (d) => say(d));
      if (stream.stderr) stream.stderr.on("data", (d) => say(d));
      stream.on("close", () => { try { ws.close(); } catch (_) {} });
      ws.on("message", (raw) => {
        let m;
        try { m = JSON.parse(raw.toString()); } catch (_) { return; }
        if (typeof m.i === "string") stream.write(m.i);                       // klavye girişi
        else if (Array.isArray(m.r)) {                                        // boyut değişimi [cols, rows]
          try { stream.setWindow(m.r[1], m.r[0], 0, 0); } catch (_) {}
        }
      });
      ws.on("close", () => { try { stream.end(); } catch (_) {} });
    };

    const window = { cols, rows, term: "xterm-256color" };
    if (isHost) {
      if (dir) {
        // belirtilen dizine geçip interaktif giriş kabuğu başlat.
        // NOT: bash prompt'u (PS1) ve readline yankısını stderr'e yazar; bu yüzden
        // kabuğun stderr'i ASLA yönlendirilmemeli — yoksa ekran boş kalır.
        // bash varlığını redirect olmadan command -v ile sınayıp uygun kabuğu açıyoruz.
        const startCmd =
          "cd " + shQuote(dir) + " 2>/dev/null; " +
          "if command -v bash >/dev/null 2>&1; then exec bash -il; else exec sh -i; fi";
        s.fs.exec.exec(startCmd, { pty: window }, onStream);
      } else {
        // sunucunun varsayılan giriş kabuğunda interaktif PTY
        s.fs.exec.shell(window, onStream);
      }
    } else {
      // konteyner içinde bash varsa onu, yoksa sh'i çalıştır.
      // (stderr'i yönlendirmiyoruz; aksi halde kabuk prompt'u görünmez.)
      const cmd =
        `docker exec -it ${shQuote(id)} sh -c ` +
        `'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'`;
      s.fs.exec.exec(cmd, { pty: window }, onStream);
    }
  });
}

module.exports = { attachTerminal };
