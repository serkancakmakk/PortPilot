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

// Sıralama: anahtar (name|mtime|type|size) ve yön (asc|desc)
export let sortKey = localStorage.getItem("sortKey") || "name";
export let sortDir = localStorage.getItem("sortDir") || "asc";

// Yükleme tercihleri (oturum boyunca hatırla)
export let uploadPrefs = null;

// Docker
export let diskInfo = null;

// Sık kullanılanlar (kalıcı, host bazlı): [{ host, path, name }]
// Kaynak artık sunucudaki prefs.json (güncelleme/port değişiminde kaybolmaz).
// localStorage yalnızca açılışta anında göstermek için önbellek olarak tutulur.
export let favorites = (() => {
  try { return JSON.parse(localStorage.getItem("favorites") || "[]"); } catch (_) { return []; }
})();
export function setFavorites(v) {
  favorites = v;
  try { localStorage.setItem("favorites", JSON.stringify(v)); } catch (_) {}
  // Sunucuya kalıcı yaz (en iyi çaba; hata olsa da UI etkilenmez)
  try {
    fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites: v }),
    }).catch(() => {});
  } catch (_) {}
}

// Açılışta favorileri sunucudan yükle. Sunucu kaynaktır; ancak sunucuda henüz
// favori yoksa (yeni dosya) ve localStorage önbelleğinde eski favoriler varsa,
// kaybolmamaları için onları bir kez sunucuya taşı (migrasyon).
export async function loadFavoritesFromServer() {
  try {
    const res = await fetch("/api/prefs");
    if (!res.ok) return false;
    const data = await res.json();
    const fav = data && data.prefs && data.prefs.favorites;
    if (Array.isArray(fav)) {
      favorites = fav;
      try { localStorage.setItem("favorites", JSON.stringify(fav)); } catch (_) {}
      return true;
    }
    // Sunucuda favori yok → localStorage'daki eskileri taşı
    if (favorites.length) setFavorites(favorites);
    return true;
  } catch (_) {}
  return false;
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
export function setSort(key, dir)   {
  sortKey = key; sortDir = dir;
  try { localStorage.setItem("sortKey", key); localStorage.setItem("sortDir", dir); } catch (_) {}
}
export function setUploadPrefs(v)   { uploadPrefs = v; }
export function setDiskInfo(v)      { diskInfo = v; }
