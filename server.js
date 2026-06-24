const express = require("express");
const path = require("path");
const { attachTerminal } = require("./lib/terminal");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Route modülleri ----
app.use(require("./routes/connect"));
app.use(require("./routes/files"));
app.use(require("./routes/docker"));
app.use(require("./routes/servers"));
app.use(require("./routes/downloads"));

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
