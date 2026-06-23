// ---- Uygulama durumu (paylaşılan tek kaynak) ----

// Aktif bağlantının anlık durumu (sekme değişince swap edilir)
export let session = null;
export let cwd = "/";
export let homePath = "/";
export let history = [];

// Çoklu bağlantı: bağlı oturumlar listesi
// Her bağlantı: { id, session, info:{host,username,port,protocol,name}, cwd, homePath, history }
export let connections = [];
export let activeConnId = null;

// Dosya listesi durumu
export let currentItems = [];
export let allItems = [];
export let fileFilter = "";
export let showHidden = localStorage.getItem("showHidden") !== "0";
export let selectedItem = null;
export let viewMode = localStorage.getItem("viewMode") || "grid";

// Yükleme tercihleri (oturum boyunca hatırla)
export let uploadPrefs = null;

// Docker
export let diskInfo = null;

// Sık kullanılanlar (kalıcı, host bazlı): [{ host, path, name }]
export let favorites = (() => {
  try { return JSON.parse(localStorage.getItem("favorites") || "[]"); } catch (_) { return []; }
})();
export function setFavorites(v) {
  favorites = v;
  try { localStorage.setItem("favorites", JSON.stringify(v)); } catch (_) {}
}

// Transfer geçmişi (oturumluk): [{ type:'upload'|'download', label, bytes, time }]
export let transferLog = [];
export function pushTransfer(e) {
  transferLog.unshift(e);
  if (transferLog.length > 50) transferLog.length = 50;
}

// Setter'lar — modüller doğrudan export'u mutate edemez
export function setSession(v)       { session = v; }
export function setCwd(v)           { cwd = v; }
export function setHomePath(v)      { homePath = v; }
export function setHistory(v)       { history = v; }
export function setConnections(v)   { connections = v; }
export function setActiveConnId(v)  { activeConnId = v; }
export function setCurrentItems(v)  { currentItems = v; }
export function setAllItems(v)      { allItems = v; }
export function setFileFilter(v)    { fileFilter = v; }
export function setShowHidden(v)    { showHidden = v; }
export function setSelectedItem(v)  { selectedItem = v; }
export function setViewMode(v)      { viewMode = v; }
export function setUploadPrefs(v)   { uploadPrefs = v; }
export function setDiskInfo(v)      { diskInfo = v; }
