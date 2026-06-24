// Sunucudan sunucuya aktarım: aktif (kaynak) sunucudaki öğeleri başka bir bağlı
// (hedef) sunucuya gönderir. Sunucu, baytları iki bağlantı arasında relay eder.
import { $, escapeHtml, toast } from "./dom.js";
import { connections, activeConnId, session } from "./state.js";

export function showRemoteTransfer(sources) {
  sources = (sources || []).filter(Boolean);
  if (!sources.length) return;
  const others = connections.filter((c) => c.id !== activeConnId && c.session);
  if (!others.length) { toast("Aktarmak için başka bağlı sunucu yok (yeni sekmede bağlan).", true); return; }

  const sourceSession = session; // kaynak: şu anki aktif oturum (sabitle)

  let ov = $("rt-overlay");
  if (!ov) { ov = document.createElement("div"); ov.id = "rt-overlay"; ov.className = "sr-overlay"; document.body.appendChild(ov); }
  const opts = others.map((c, i) => {
    const label = (c.info && (c.info.name || `${c.info.username}@${c.info.host}`)) || c.id;
    return `<label class="rt-opt"><input type="radio" name="rt-target" value="${escapeHtml(c.id)}" ${i === 0 ? "checked" : ""}> ${escapeHtml(label)}</label>`;
  }).join("");
  ov.innerHTML = `<div class="sr-box rt-box">
    <div class="sr-head"><b>Başka sunucuya aktar (${sources.length} öğe)</b><button type="button" class="sr-close" title="Kapat">✕</button></div>
    <div class="rt-body">
      <div class="rt-label">Hedef sunucu</div>
      <div class="rt-opts">${opts}</div>
      <div class="rt-label">Hedef klasör (uzak)</div>
      <input id="rt-dest" class="lx-path" value="/" spellcheck="false" placeholder="/var/www" />
      <div class="rt-actions">
        <button type="button" id="rt-cancel" class="btn btn-sm tbtn">İptal</button>
        <button type="button" id="rt-go" class="btn btn-sm tbtn primary">Aktar</button>
      </div>
    </div></div>`;
  ov.hidden = false;
  const close = () => { ov.hidden = true; };
  ov.querySelector(".sr-close").onclick = close;
  $("rt-cancel").onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  $("rt-go").onclick = () => {
    const id = (ov.querySelector('input[name="rt-target"]:checked') || {}).value;
    const conn = others.find((c) => c.id === id);
    const dest = $("rt-dest").value.trim() || "/";
    if (!conn) { toast("Hedef sunucu seç.", true); return; }
    close();
    const host = (conn.info && conn.info.host) || "";
    import("./transfer-queue.js").then((tq) =>
      tq.enqueueTransfer(`Sunucuya aktar → ${host} (${sources.length})`,
        () => runTransfer(sourceSession, conn.session, dest, sources)));
  };
}

async function runTransfer(sourceSession, target, dest, sources) {
  const res = await fetch("/api/transfer-remote", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sourceSession ? { "x-session": sourceSession } : {}) },
    body: JSON.stringify({ target, dest, sources }),
  });
  if (res.status === 401) { import("./connections.js").then((m) => m.logout()); throw new Error("Oturum doldu."); }
  if (!res.body) {
    let err = "Aktarım başlatılamadı"; try { err = (await res.json()).error || err; } catch (_) {}
    throw new Error(err);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", last = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim(); if (!t) continue;
      let o; try { o = JSON.parse(t); } catch (_) { continue; }
      if (o.ok || o.error) last = o;
    }
  }
  if (buf.trim()) { try { last = JSON.parse(buf.trim()); } catch (_) {} }
  if (last && last.error) throw new Error(last.error);
  toast(`Aktarıldı (${(last && last.count) || 0} dosya)`);
}
