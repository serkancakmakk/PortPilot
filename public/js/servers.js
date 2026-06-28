import { $, toast, escapeHtml } from "./dom.js";
import { computerSVG } from "./icons.js";
import { api } from "./api.js";
import { confirmDialog } from "./dialog.js";

// state.js'de eksik olanları ekleyelim — ama basit tutmak için burada modül-lokal tutuyoruz
let _savedServers = [];
let _selectedServerIds = new Set();

export function getSavedServers() {
  return _savedServers;
}

// Kapatılmış grupların adlarını localStorage'da sakla
function loadCollapsedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem("collapsedGroups") || "[]"));
  } catch (_) {
    return new Set();
  }
}
function saveCollapsedGroups(set) {
  localStorage.setItem("collapsedGroups", JSON.stringify([...set]));
}

export async function renderSavedServers() {
  try {
    const data = await api("servers");
    _savedServers = data.servers || [];
  } catch (_) {
    _savedServers = [];
  }
  const servers = _savedServers;
  const wrap = $("saved-wrap");
  const list = $("saved-list");
  wrap.hidden = servers.length === 0;
  list.innerHTML = "";
  _selectedServerIds = new Set();

  const bar = document.createElement("div");
  bar.className = "srv-bulk";
  bar.innerHTML = `<button type="button" id="srv-del-selected" class="srv-bulk-btn danger" hidden>Seçilenleri Sil</button>
     <button type="button" id="srv-del-all" class="srv-bulk-btn">Tümünü Sil</button>`;
  list.appendChild(bar);

  const updateBulkBtn = () => {
    const btn = $("srv-del-selected");
    btn.hidden = _selectedServerIds.size === 0;
    btn.textContent = `Seçilenleri Sil (${_selectedServerIds.size})`;
  };
  const bulkDelete = async (json, confirmMsg) => {
    if (
      !(await confirmDialog(confirmMsg, {
        title: "Kayıtları Sil",
        okText: "Sil",
        danger: true,
      }))
    )
      return;
    try {
      await api("servers/bulk-delete", { method: "POST", json });
    } catch (e) {
      toast(e.message, true);
    }
    renderSavedServers();
  };

  const groups = new Map();
  servers.forEach((s) => {
    const g = (s.group || "").trim();
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  });

  const collapsed = loadCollapsedGroups();
  groups.forEach((items, g) => {
    const label = g || "Gruplanmamış";
    const isCollapsed = collapsed.has(label);
    const section = document.createElement("div");
    section.className = "srv-group" + (isCollapsed ? " collapsed" : "");
    const head = document.createElement("div");
    head.className = "srv-group-head";
    head.innerHTML = `<span class="srv-group-name"><span class="srv-chevron">▾</span> 📁 ${escapeHtml(label)} <span class="srv-group-count">${items.length}</span></span>`;
    const delG = document.createElement("button");
    delG.type = "button";
    delG.className = "srv-group-del";
    delG.textContent = "🗑 Grubu sil";
    delG.addEventListener("click", (e) => {
      e.stopPropagation();
      bulkDelete(
        g ? { group: g } : { ids: items.map((x) => x.id) },
        `"${label}" grubundaki ${items.length} sunucu silinsin mi?`,
      );
    });
    head.appendChild(delG);
    section.appendChild(head);

    const inner = document.createElement("div");
    inner.className = "saved-list";
    inner.hidden = isCollapsed;
    items.forEach((s) => inner.appendChild(buildServerCell(s, updateBulkBtn)));
    section.appendChild(inner);

    head.querySelector(".srv-group-name").addEventListener("click", () => {
      const nowCollapsed = !section.classList.contains("collapsed");
      section.classList.toggle("collapsed", nowCollapsed);
      inner.hidden = nowCollapsed;
      const set = loadCollapsedGroups();
      if (nowCollapsed) set.add(label);
      else set.delete(label);
      saveCollapsedGroups(set);
    });

    list.appendChild(section);
  });

  $("srv-del-all").addEventListener("click", () =>
    bulkDelete(
      { all: true },
      `TÜM kayıtlı sunucular (${servers.length}) silinsin mi?`,
    ),
  );
  $("srv-del-selected").addEventListener("click", () => {
    const ids = [..._selectedServerIds];
    if (ids.length) bulkDelete({ ids }, `${ids.length} sunucu silinsin mi?`);
  });
}

function buildServerCell(s, updateBulkBtn) {
  const hasCreds = !!(s.password || s.privateKey);
  const cell = document.createElement("div");
  cell.className = "srv-cell";
  const pick = document.createElement("input");
  pick.type = "checkbox";
  pick.className = "srv-pick";
  pick.title = "Toplu silme için seç";
  pick.addEventListener("click", (e) => e.stopPropagation());
  pick.addEventListener("change", () => {
    if (pick.checked) _selectedServerIds.add(s.id);
    else _selectedServerIds.delete(s.id);
    cell.classList.toggle("picked", pick.checked);
    updateBulkBtn();
  });
  const el = document.createElement("button");
  el.type = "button";
  const protoUp = (s.protocol || "sftp").toUpperCase();
  el.title = `${protoUp} · ${s.username}@${s.host}:${s.port} • ${s.auth === "key" ? "SSH anahtarı" : "parola"}`;
  el.innerHTML = `
    <span class="srv-ico">${computerSVG()}</span>
    <span class="srv-text">
      <span class="srv-name"></span>
      <span class="srv-host"></span>
    </span>
    <span class="srv-badge" title="${hasCreds ? "Kimlik bilgisi kayıtlı" : "Bağlanırken parola istenir"}">${hasCreds ? "🔓" : "🔒"}</span>
    <span class="srv-edit" title="Bağlantıyı düzenle">✎</span>
    <span class="srv-del" title="Kaydı sil">×</span>`;
  el.querySelector(".srv-name").textContent = s.name;
  el.querySelector(".srv-host").textContent =
    `${protoUp} · ${s.username}@${s.host}:${s.port}`;
  el.className = "srv-tile" + (false ? " online" : ""); // online durumu connections modülünden kontrol edilebilir
  el.addEventListener("click", () => selectServer(s));
  el.querySelector(".srv-edit").addEventListener("click", (e) => {
    e.stopPropagation();
    editServer(s);
  });
  el.querySelector(".srv-del").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (
      !(await confirmDialog(`"${s.name}" kaydı silinsin mi?`, {
        title: "Kaydı Sil",
        okText: "Sil",
        danger: true,
      }))
    )
      return;
    try {
      await api("servers/" + encodeURIComponent(s.id), { method: "DELETE" });
    } catch (err) {
      toast(err.message, true);
    }
    renderSavedServers();
  });
  cell.appendChild(pick);
  cell.appendChild(el);
  return cell;
}

// Kayıtlı bağlantıyı silmeden düzenle (host/port/kullanıcı/ad/grup/protokol).
// Kimlik bilgileri (parola/anahtar) korunur; id ile yerinde güncellenir.
function editServer(s) {
  const h = document.createElement("div");
  h.className = "app-dialog-overlay";
  h.innerHTML = `
    <div class="app-dialog srv-edit-dialog" role="dialog" aria-modal="true">
      <div class="app-dialog-title">🛠️ Bağlantıyı Düzenle</div>
      <div class="se-grid">
        <label class="se-field se-wide">Ad<input class="se-name" type="text"></label>
        <label class="se-field">Protokol<select class="se-proto">
          <option value="sftp">SFTP (SSH)</option>
          <option value="ftp">FTP</option>
          <option value="ftps">FTPS</option>
        </select></label>
        <label class="se-field">Grup / etiket<input class="se-group" type="text" placeholder="ör. Üretim"></label>
        <label class="se-field se-wide">Sunucu (host)<input class="se-host" type="text"></label>
        <label class="se-field">Port<input class="se-port" type="number" min="1" max="65535"></label>
        <label class="se-field">Kullanıcı<input class="se-user" type="text"></label>
      </div>
      <div class="se-note dk-sub">Parola / anahtar korunur. Değiştirmek için kaydı seçip yeniden bağlanırken güncelle.</div>
      <div class="app-dialog-actions">
        <button type="button" class="ad-btn ad-cancel">İptal</button>
        <button type="button" class="ad-btn ad-ok primary">Kaydet</button>
      </div>
    </div>`;
  document.body.appendChild(h);
  requestAnimationFrame(() => h.classList.add("show"));
  const q = (c) => h.querySelector(c);
  q(".se-name").value = s.name || "";
  q(".se-proto").value = s.protocol || "sftp";
  q(".se-group").value = s.group || "";
  q(".se-host").value = s.host || "";
  q(".se-port").value = s.port || "";
  q(".se-user").value = s.username || "";

  const close = () => { h.classList.remove("show"); document.removeEventListener("keydown", onKey, true); setTimeout(() => h.remove(), 140); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  q(".ad-cancel").addEventListener("click", close);
  h.addEventListener("mousedown", (e) => { if (e.target === h) close(); });
  q(".ad-ok").addEventListener("click", async () => {
    const host = q(".se-host").value.trim();
    const username = q(".se-user").value.trim();
    const port = parseInt(q(".se-port").value, 10);
    if (!host || !username) return toast("Sunucu ve kullanıcı gerekli.", true);
    const payload = {
      ...s, // id + kimlik bilgileri (parola/anahtar/passphrase/auth) korunur
      name: q(".se-name").value.trim() || `${username}@${host}`,
      protocol: q(".se-proto").value,
      group: q(".se-group").value.trim(),
      host, username,
      port: Number.isFinite(port) ? port : s.port,
    };
    try {
      await api("servers", { method: "POST", json: payload });
      toast("Bağlantı güncellendi");
      close();
      renderSavedServers();
    } catch (e) { toast(e.message, true); }
  });
  setTimeout(() => q(".se-host").focus(), 40);
}

export function maybeSaveServer(body) {
  if (!$("save-server").checked) return null;
  const savePass = $("save-pass").checked;
  const isKey = !!(body.privateKey && body.privateKey.trim());
  const name = $("save-name").value.trim() || `${body.username}@${body.host}`;
  const server = {
    name,
    host: body.host,
    port: body.port,
    username: body.username,
    protocol: body.protocol || "sftp",
    auth: isKey ? "key" : "password",
    password: savePass && !isKey ? body.password : "",
    privateKey: savePass && isKey ? body.privateKey : "",
    passphrase: savePass && isKey ? body.passphrase : "",
    group: $("save-group") ? $("save-group").value.trim() : "",
  };
  // Atlama sunucusu (jump) — varsa kaydet; kimlik bilgileri yalnızca "sakla" işaretliyse
  if (body.jump && body.jump.host && body.jump.username) {
    server.jump = {
      host: body.jump.host,
      port: body.jump.port,
      username: body.jump.username,
      password: savePass ? body.jump.password : "",
      privateKey: savePass ? body.jump.privateKey : "",
      passphrase: savePass ? body.jump.passphrase : "",
    };
  }
  api("servers", { method: "POST", json: server }).catch((e) =>
    console.warn("Sunucu kaydedilemedi:", e.message),
  );
  return name;
}

export function selectServer(s) {
  const f = $("connect-form");
  f.protocol.value = s.protocol || "sftp";
  import("./login.js").then((m) => m.applyProtocol({ keepPort: true }));
  f.host.value = s.host;
  f.port.value = s.port;
  f.username.value = s.username;
  f.password.value = s.password || "";
  f.privateKey.value = s.privateKey || "";
  f.passphrase.value = s.passphrase || "";
  const auth = s.protocol && s.protocol !== "sftp" ? "password" : s.auth;
  document.querySelector(`[data-auth="${auth}"]`).click();

  // Atlama sunucusu (jump) alanlarını temizle, kayıtta varsa doldur ve bölümü aç
  ["jumpHost", "jumpUsername", "jumpPassword", "jumpPrivateKey", "jumpPassphrase"].forEach((n) => { if (f[n]) f[n].value = ""; });
  if (f.jumpPort) f.jumpPort.value = "22";
  if (s.jump && s.jump.host && f.jumpHost) {
    f.jumpHost.value = s.jump.host;
    f.jumpPort.value = s.jump.port || 22;
    f.jumpUsername.value = s.jump.username || "";
    f.jumpPassword.value = s.jump.password || "";
    f.jumpPrivateKey.value = s.jump.privateKey || "";
    f.jumpPassphrase.value = s.jump.passphrase || "";
    if ($("jump-body")) {
      $("jump-body").hidden = false;
      const ch = $("jump-toggle") && $("jump-toggle").querySelector(".jump-chevron");
      if (ch) ch.textContent = "▾";
      $("jump-toggle").setAttribute("aria-expanded", "true");
    }
    const jt = document.querySelector(`[data-jauth="${s.jump.privateKey ? "key" : "password"}"]`);
    if (jt) jt.click();
  } else if ($("jump-body")) {
    $("jump-body").hidden = true;
    const ch = $("jump-toggle") && $("jump-toggle").querySelector(".jump-chevron");
    if (ch) ch.textContent = "▸";
  }
  const hasCreds = !!(s.password || s.privateKey);
  if (hasCreds) {
    f.requestSubmit
      ? f.requestSubmit()
      : f.dispatchEvent(new Event("submit", { cancelable: true }));
  } else {
    (s.auth === "key" ? f.privateKey : f.password).focus();
    $("login-error").textContent =
      "Bu sunucu için " + (s.auth === "key" ? "anahtar" : "parola") + " girin.";
  }
}
