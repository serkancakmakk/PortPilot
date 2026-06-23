import { session } from "./state.js";

// logout fonksiyonu döngüsel bağımlılığı önlemek için geç yüklenir
let _logout = null;
export function setLogoutFn(fn) { _logout = fn; }

export async function api(pathName, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  if (session) headers["x-session"] = session;
  if (opts.json) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.json);
    delete opts.json;
  }
  let res;
  try {
    res = await fetch("/api/" + pathName, Object.assign({}, opts, { headers }));
  } catch (_) {
    throw new Error("Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm start).");
  }
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  if (!res.ok) {
    let msg = "Hata " + res.status;
    if (isJson) {
      try { msg = (await res.json()).error || msg; } catch (_) {}
    }
    if (res.status === 401 && _logout) _logout();
    throw new Error(msg);
  }
  if (!isJson) return res;
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("Sunucudan geçersiz yanıt alındı.");
  }
}
