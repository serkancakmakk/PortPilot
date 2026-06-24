const express = require("express");
const path = require("path");
const { attachTerminal } = require("./lib/terminal");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Sürüm bilgisi (tarayıcı modu için; masaüstünde window.desktop.version kullanılır)
app.get("/api/version", (_req, res) => {
  let version = "";
  try { version = require("./package.json").version || ""; } catch (_) {}
  res.json({ version });
});

// Sürüm notları (CHANGELOG.md) — "Neler yeni?" penceresi için
app.get("/api/changelog", (_req, res) => {
  let markdown = "", version = "";
  try { version = require("./package.json").version || ""; } catch (_) {}
  try { markdown = require("fs").readFileSync(path.join(__dirname, "CHANGELOG.md"), "utf8"); } catch (_) {}
  res.json({ version, markdown });
});

// ---- Route modülleri ----
app.use(require("./routes/connect"));
app.use(require("./routes/files"));
app.use(require("./routes/docker"));
app.use(require("./routes/servers"));
app.use(require("./routes/prefs"));
app.use(require("./routes/downloads"));
app.use(require("./routes/sys"));

// ---- WebSocket terminali ----
// Doğrudan `node server.js` ile çalıştırıldığında dinle.
// Electron (electron/main.js) içinden require edildiğinde otomatik dinleme yapma;
// orada uygulama kendi portunu seçip startServer() çağırır.
function startServer(port = PORT, host) {
  return new Promise((resolve) => {
    const srv = app.listen(port, host, () => {
      const real = srv.address().port;
      console.log(`\n  PortPilot çalışıyor →  http://${host || "localhost"}:${real}\n`);
      resolve({ server: srv, port: real });
    });
    attachTerminal(srv);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
