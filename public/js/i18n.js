// Basit, bağımlılıksız i18n: TR/EN. Seçim localStorage'da kalıcı; ilk açılışta
// tarayıcı diline (yoksa TR) düşer.
//
// Statik HTML: data-i18n (metin), data-i18n-html (HTML), data-i18n-ph (placeholder),
//              data-i18n-title (title) öznitelikleriyle çevrilir.
// Dinamik (JS) metinler: t("anahtar") çağrısıyla.
//
// Kapsam kademeli: çekirdek arayüz (sidebar, araç çubuğu, paneller, sekmeler, giriş)
// çevrilidir; eksik anahtar için TR metni (ya da anahtarın kendisi) döner.

const KEY = "lang";

const DICT = {
  tr: {
    // Sidebar / genel
    "side.quickAccess": "Hızlı Erişim",
    "side.favorites": "Sık Kullanılanlar",
    "side.tools": "Araçlar",
    "nav.dashboard": "Sunucu Paneli",
    "nav.terminal": "Sunucu Terminali",
    "nav.docker": "Docker Yönetimi",
    "nav.serverTools": "Sunucu Araçları",
    "nav.audit": "İşlem Günlüğü",
    "nav.whatsnew": "Sürüm Notları",
    "nav.update": "Güncellemeleri Denetle",
    "nav.theme.dark": "Karanlık Tema",
    "nav.theme.light": "Aydınlık Tema",
    "nav.lang": "English",
    "nav.disconnect": "Bağlantıyı Kes",
    "side.savedServers": "Kayıtlı Sunucular",
    // Araç çubuğu
    "tb.hidden": "Gizli",
    "tb.view": "Görünüm",
    "tb.newFolder": "Yeni Klasör",
    "tb.download": "İndir",
    "tb.upload": "Yükle",
    "tb.uploadFolder": "Klasör Yükle",
    "tb.search": "Ara…",
    // Paneller (başlıklar)
    "panel.serverTools": "Sunucu Araçları",
    "panel.dashboard": "Sunucu Paneli",
    "panel.docker": "Docker Yönetimi",
    "common.refresh": "Yenile",
    "common.close": "Kapat",
    "common.files": "Dosyalar",
    "common.save": "Kaydet",
    "common.minimize": "Küçült",
    "term.commands": "Komutlar",
    // Sunucu Araçları sekmeleri
    "sys.tab.ports": "Açık Portlar",
    "sys.tab.procs": "Süreçler",
    "sys.tab.services": "Servisler",
    "sys.tab.cron": "⏰ Cron",
    "sys.tab.users": "👥 Kullanıcılar",
    "sys.tab.ssh": "🔑 SSH",
    "sys.tab.tunnel": "🚇 Tünel",
    "sys.tab.firewall": "🔥 Firewall",
    "sys.tab.web": "🌐 Web",
    "sys.tab.diskusage": "Disk Analizi",
    "sys.tab.log": "Log",
    // Dashboard kart başlıkları
    "dash.cpu": "CPU Yükü",
    "dash.ram": "Bellek (RAM)",
    "dash.disk": "Disk (/)",
    "dash.connection": "Bağlantı",
    "dash.system": "Sistem",
    "dash.transfers": "Transfer Geçmişi (bu oturum)",
    // Tünel
    "tun.help": "Sunucu ağındaki bir servisi (veritabanı, dahili panel…) <b>bu bilgisayara</b> güvenle taşı. <code>localhost:yerel</code> → sunucu üzerinden → <code>uzak:port</code>. SSH oturumu boyunca açık kalır.",
    "tun.remoteHost": "Uzak host",
    "tun.remotePort": "Uzak port",
    "tun.localPort": "Yerel port",
    "tun.localAuto": "(boş = otomatik)",
    "tun.open": "Tüneli aç",
    "tun.quick": "Hızlı:",
    "tun.colLocal": "Yerel",
    "tun.colRemote": "→ Uzak",
    "tun.colConns": "Bağlantı",
    "tun.colTraffic": "Trafik",
    "tun.btnClose": "Kapat",
    "tun.onlySsh": "Tünel yalnızca <b>SFTP (SSH)</b> bağlantılarında çalışır.",
    "tun.none": "Henüz açık tünel yok.",
    "tun.active": "aktif tünel",
    "tun.copied": "Kopyalandı: ",
    "tun.needPort": "Uzak port gir.",
    "tun.opened": "Tünel açıldı: ",
    // Cron (sunucu geneli)
    "cron.allTitle": "🗄️ Sunucudaki tüm cron'lar",
    "cron.scan": "Tara",
    "cron.scanning": "Taranıyor… (cron.d ve diğer kullanıcılar için root yetkisi gerekir)",
    "cron.colSchedule": "Zamanlama",
    "cron.colUser": "Kullanıcı",
    "cron.colCommand": "Komut",
    "cron.none": "Görünür cron bulunamadı. Sistem cron'larını (cron.d, diğer kullanıcılar) görmek için <b>root</b> ile bağlanman gerekebilir.",
  },
  en: {
    "side.quickAccess": "Quick Access",
    "side.favorites": "Favorites",
    "side.tools": "Tools",
    "nav.dashboard": "Server Dashboard",
    "nav.terminal": "Server Terminal",
    "nav.docker": "Docker Management",
    "nav.serverTools": "Server Tools",
    "nav.audit": "Activity Log",
    "nav.whatsnew": "Release Notes",
    "nav.update": "Check for Updates",
    "nav.theme.dark": "Dark Theme",
    "nav.theme.light": "Light Theme",
    "nav.lang": "Türkçe",
    "nav.disconnect": "Disconnect",
    "side.savedServers": "Saved Servers",
    "tb.hidden": "Hidden",
    "tb.view": "View",
    "tb.newFolder": "New Folder",
    "tb.download": "Download",
    "tb.upload": "Upload",
    "tb.uploadFolder": "Upload Folder",
    "tb.search": "Search…",
    "panel.serverTools": "Server Tools",
    "panel.dashboard": "Server Dashboard",
    "panel.docker": "Docker Management",
    "common.refresh": "Refresh",
    "common.close": "Close",
    "common.files": "Files",
    "common.save": "Save",
    "common.minimize": "Minimize",
    "term.commands": "Commands",
    "sys.tab.ports": "Open Ports",
    "sys.tab.procs": "Processes",
    "sys.tab.services": "Services",
    "sys.tab.cron": "⏰ Cron",
    "sys.tab.users": "👥 Users",
    "sys.tab.ssh": "🔑 SSH",
    "sys.tab.tunnel": "🚇 Tunnel",
    "sys.tab.firewall": "🔥 Firewall",
    "sys.tab.web": "🌐 Web",
    "sys.tab.diskusage": "Disk Usage",
    "sys.tab.log": "Log",
    "dash.cpu": "CPU Load",
    "dash.ram": "Memory (RAM)",
    "dash.disk": "Disk (/)",
    "dash.connection": "Connection",
    "dash.system": "System",
    "dash.transfers": "Transfer History (this session)",
    "tun.help": "Securely bring a service on the server network (database, internal panel…) to <b>this computer</b>. <code>localhost:local</code> → via server → <code>remote:port</code>. Stays open for the SSH session.",
    "tun.remoteHost": "Remote host",
    "tun.remotePort": "Remote port",
    "tun.localPort": "Local port",
    "tun.localAuto": "(empty = auto)",
    "tun.open": "Open tunnel",
    "tun.quick": "Quick:",
    "tun.colLocal": "Local",
    "tun.colRemote": "→ Remote",
    "tun.colConns": "Conns",
    "tun.colTraffic": "Traffic",
    "tun.btnClose": "Close",
    "tun.onlySsh": "Tunneling only works on <b>SFTP (SSH)</b> connections.",
    "tun.none": "No open tunnels yet.",
    "tun.active": "active tunnels",
    "tun.copied": "Copied: ",
    "tun.needPort": "Enter a remote port.",
    "tun.opened": "Tunnel opened: ",
    "cron.allTitle": "🗄️ All cron jobs on the server",
    "cron.scan": "Scan",
    "cron.scanning": "Scanning… (root required for cron.d and other users)",
    "cron.colSchedule": "Schedule",
    "cron.colUser": "User",
    "cron.colCommand": "Command",
    "cron.none": "No visible cron jobs found. You may need to connect as <b>root</b> to see system crons (cron.d, other users).",
  },
};

let lang = null;

function detect() {
  const saved = localStorage.getItem(KEY);
  if (saved === "tr" || saved === "en") return saved;
  const nav = (navigator.language || "tr").toLowerCase();
  return nav.startsWith("en") ? "en" : "tr";
}

export function currentLang() {
  if (!lang) lang = detect();
  return lang;
}

// Çeviri. Eksikse TR'ye, o da yoksa anahtara düşer. {var} yer tutucularını destekler.
export function t(key, vars) {
  const l = currentLang();
  let s = (DICT[l] && DICT[l][key]) ?? (DICT.tr && DICT.tr[key]) ?? key;
  if (vars) for (const k in vars) s = s.replaceAll("{" + k + "}", vars[k]);
  return s;
}

// Sayfadaki tüm data-i18n* öğelerini çevir
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.dataset.i18nPh)); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.setAttribute("title", t(el.dataset.i18nTitle)); });
  document.documentElement.lang = currentLang();
}

export function setLang(next) {
  lang = next === "en" ? "en" : "tr";
  localStorage.setItem(KEY, lang);
  applyI18n();
  updateLangButton();
  // Tema etiketi dile bağlı → tema modülüne yeniden uygula sinyali
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang } }));
}

export function toggleLang() {
  setLang(currentLang() === "tr" ? "en" : "tr");
}

function updateLangButton() {
  const label = document.querySelector("#btn-lang .lang-label");
  const ico = document.querySelector("#btn-lang .lang-ico");
  if (label) label.textContent = t("nav.lang");        // diğer dilin adı
  if (ico) ico.textContent = currentLang() === "tr" ? "🇬🇧" : "🇹🇷";
}

// Erken uygula (FOUC azalt)
document.documentElement.lang = currentLang();

export function initLang() {
  applyI18n();
  updateLangButton();
  const btn = document.getElementById("btn-lang");
  if (btn) btn.addEventListener("click", toggleLang);
}
