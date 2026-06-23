// ---- Tutarlı SVG ikon seti (emoji yerine: Mac/Windows/Linux'ta aynı görünür) ----
const ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  "folder-plus": '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  "hard-drive": '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  list: '<path d="M3 6h.01M3 12h.01M3 18h.01"/><path d="M8 6h13M8 12h13M8 18h13"/>',
  container: '<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.7 1.7 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.7 1.7 0 0 0 1.7 0l10.3-6c.5-.3.9-.9.9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  terminal: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  star: '<path d="M11.5 2.3a.5.5 0 0 1 .9 0l2.4 4.8 5.3.8a.5.5 0 0 1 .3.85l-3.8 3.7.9 5.3a.5.5 0 0 1-.73.53L12 16.5l-4.7 2.5a.5.5 0 0 1-.73-.53l.9-5.3-3.8-3.7a.5.5 0 0 1 .3-.85l5.3-.8z"/>',
};

export function icon(name, cls = "nav-ico") {
  const p = ICONS[name] || "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export function applyIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconCls || "nav-ico");
  });
}

// ---- Dosya/klasör görselleri ----
export function folderSVG(back, front) {
  return `<svg viewBox="0 0 48 48" class="ic">
    <path d="M5 13a4 4 0 0 1 4-4h10l4 4h16a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${back}"/>
    <path d="M5 19h38v18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${front}"/>
  </svg>`;
}

export function fileSVG(body, corner, label) {
  const tag = label
    ? `<text x="24" y="36" font-size="11" font-weight="700" text-anchor="middle" fill="#fff" font-family="Segoe UI,Arial">${label}</text>`
    : "";
  return `<svg viewBox="0 0 48 48" class="ic">
    <path d="M12 3h17l11 11v28a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" fill="${body}"/>
    <path d="M29 3l11 11h-8a3 3 0 0 1-3-3z" fill="${corner}"/>
    ${tag}
  </svg>`;
}

export function computerSVG() {
  return `<svg width="30" height="30" viewBox="0 0 48 48" class="srv-svg" aria-hidden="true">
    <rect x="6" y="8" width="36" height="24" rx="2.5" fill="#5b9bff"/>
    <rect x="9" y="11" width="30" height="18" rx="1.2" fill="#eaf2ff"/>
    <rect x="6" y="8" width="36" height="24" rx="2.5" fill="none" stroke="#2f6fed" stroke-width="1.4"/>
    <path d="M18 32h12l2 6H16z" fill="#cdd9ee"/>
    <rect x="13" y="38" width="22" height="3" rx="1.5" fill="#9fb3d4"/>
  </svg>`;
}

// ---- Dosya tipi ----
const EXT_CAT = {
  image: ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico", "tiff", "heic"],
  video: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v"],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"],
  archive: ["zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz"],
  pdf: ["pdf"],
  sheet: ["xls", "xlsx", "csv", "ods"],
  doc: ["doc", "docx", "rtf", "odt", "txt", "md", "markdown", "log"],
  code: ["js", "mjs", "cjs", "ts", "tsx", "jsx", "vue", "svelte", "py", "rb", "php", "pl", "lua", "sh", "bash", "zsh", "c", "h", "cpp", "hpp", "cc", "cs", "java", "kt", "go", "rs", "swift", "sql", "r", "dart", "html", "htm", "css", "scss", "sass", "less"],
  config: ["json", "json5", "xml", "yml", "yaml", "toml", "ini", "conf", "cfg", "env", "properties"],
};
const CAT_STYLE = {
  image:   ["#34d399", "#10b981", "IMG"],
  video:   ["#818cf8", "#6366f1", "VID"],
  audio:   ["#f0abfc", "#e879f9", "MP3"],
  archive: ["#fbbf24", "#f59e0b", "ZIP"],
  pdf:     ["#f87171", "#ef4444", "PDF"],
  sheet:   ["#4ade80", "#22c55e", "XLS"],
  doc:     ["#60a5fa", "#3b82f6", "DOC"],
  code:    ["#a78bfa", "#8b5cf6", "</>"],
  config:  ["#94a3b8", "#64748b", "CFG"],
  default: ["#cbd5e1", "#94a3b8", ""],
};

export function categoryOf(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  for (const cat in EXT_CAT) if (EXT_CAT[cat].includes(ext)) return cat;
  return "default";
}

export function iconFor(item) {
  if (item.type === "dir") return folderSVG("#2f6fed", "#5b9bff");
  if (item.type === "link") return folderSVG("#0ea5a4", "#2dd4bf");
  const [body, corner, label] = CAT_STYLE[categoryOf(item.name)];
  return fileSVG(body, corner, label);
}
