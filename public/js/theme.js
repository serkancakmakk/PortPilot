// Karanlık / aydınlık tema — seçim localStorage'da kalıcı; ilk açılışta sistem
// tercihine (prefers-color-scheme) düşer.
const KEY = "theme";

function systemPref() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme() {
  return localStorage.getItem(KEY) || systemPref();
}

function apply(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const ico = document.querySelector("#btn-theme .theme-ico");
  const label = document.querySelector("#btn-theme .theme-label");
  if (ico) ico.textContent = theme === "dark" ? "☀️" : "🌙";
  if (label) label.textContent = theme === "dark" ? "Aydınlık Tema" : "Karanlık Tema";
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  apply(theme);
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

// Sayfa erken kararsın diye (FOUC azalt) modül yüklenir yüklenmez uygula.
apply(currentTheme());

export function initTheme() {
  apply(currentTheme());
  const btn = document.getElementById("btn-theme");
  if (btn) btn.addEventListener("click", toggleTheme);
}
