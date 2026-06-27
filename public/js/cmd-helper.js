// Komut yardımcısı (cheat-sheet): terminal ve Docker panelinde, kullanıcıların
// ezberlemeden iş görmesi için kategorize, aranabilir, iki dilli hazır komut listesi.
// Bir komuta tıklamak onu terminale yazar (otomatik çalıştırmaz — kullanıcı
// <konteyner>, <dosya> gibi yer tutucuları doldurup Enter'a basar).

import { currentLang } from "./i18n.js";
import { escapeHtml, escapeAttr } from "./dom.js";

// d: { tr, en } açıklama · cmd: komut (yer tutucular <...> ile)
export const SHELL_GROUPS = [
  { t: { tr: "📁 Dosya & Klasör", en: "📁 Files & Folders" }, items: [
    { c: "ls -lah", d: { tr: "Dosyaları detaylı listele (gizliler + boyut)", en: "List files with details (hidden + size)" } },
    { c: "cd <klasör>", d: { tr: "Klasöre gir", en: "Change directory" } },
    { c: "pwd", d: { tr: "Bulunduğun klasörün tam yolu", en: "Print working directory" } },
    { c: "mkdir -p <yol>", d: { tr: "Klasör (gerekirse iç içe) oluştur", en: "Create directory (nested)" } },
    { c: "cp -r <kaynak> <hedef>", d: { tr: "Kopyala (klasörü -r ile)", en: "Copy (folders with -r)" } },
    { c: "mv <kaynak> <hedef>", d: { tr: "Taşı / yeniden adlandır", en: "Move / rename" } },
    { c: "rm -rf <yol>", d: { tr: "Sil (klasörü ve içindekileri) — DİKKAT", en: "Remove recursively — CAUTION" } },
    { c: "cat <dosya>", d: { tr: "Dosya içeriğini göster", en: "Show file contents" } },
    { c: "tail -f <dosya>", d: { tr: "Dosyanın sonunu canlı izle (loglar)", en: "Follow file end live (logs)" } },
    { c: "nano <dosya>", d: { tr: "Basit metin düzenleyicide aç", en: "Open in simple editor" } },
  ] },
  { t: { tr: "🔍 Arama", en: "🔍 Search" }, items: [
    { c: 'grep -rn "<metin>" .', d: { tr: "Klasörde metni özyinelemeli ara (satır no ile)", en: "Recursively search text (with line no.)" } },
    { c: "find . -name '<ad>'", d: { tr: "Ada göre dosya bul", en: "Find files by name" } },
    { c: "find . -size +100M", d: { tr: "100 MB'tan büyük dosyaları bul", en: "Find files larger than 100MB" } },
    { c: "which <komut>", d: { tr: "Komutun nerede kurulu olduğunu göster", en: "Show where a command is installed" } },
  ] },
  { t: { tr: "📊 Sistem & İzleme", en: "📊 System & Monitoring" }, items: [
    { c: "top", d: { tr: "Canlı süreç/CPU/RAM izleyici (q ile çık)", en: "Live process/CPU/RAM monitor (q to quit)" } },
    { c: "htop", d: { tr: "Renkli, gelişmiş süreç izleyici", en: "Colorful advanced process monitor" } },
    { c: "free -h", d: { tr: "Bellek (RAM) kullanımı", en: "Memory (RAM) usage" } },
    { c: "df -h", d: { tr: "Disk doluluk oranları", en: "Disk usage by filesystem" } },
    { c: "du -sh *", d: { tr: "Bu klasördeki öğelerin boyutu", en: "Size of items in this folder" } },
    { c: "uptime", d: { tr: "Açık kalma süresi + yük ortalaması", en: "Uptime + load average" } },
    { c: "ps aux --sort=-%mem | head", d: { tr: "En çok bellek kullanan süreçler", en: "Top memory-consuming processes" } },
  ] },
  { t: { tr: "⚙️ Servisler (systemd)", en: "⚙️ Services (systemd)" }, items: [
    { c: "systemctl status <servis>", d: { tr: "Servis durumu", en: "Service status" } },
    { c: "systemctl restart <servis>", d: { tr: "Servisi yeniden başlat", en: "Restart service" } },
    { c: "systemctl start <servis>", d: { tr: "Servisi başlat", en: "Start service" } },
    { c: "systemctl stop <servis>", d: { tr: "Servisi durdur", en: "Stop service" } },
    { c: "systemctl enable <servis>", d: { tr: "Açılışta otomatik başlat", en: "Enable on boot" } },
    { c: "journalctl -u <servis> -n 100 --no-pager", d: { tr: "Servisin son 100 log satırı", en: "Last 100 log lines of service" } },
    { c: "journalctl -f", d: { tr: "Tüm sistem loglarını canlı izle", en: "Follow all system logs live" } },
  ] },
  { t: { tr: "📦 Paket Yönetimi", en: "📦 Package Management" }, items: [
    { c: "sudo apt update", d: { tr: "Paket listesini güncelle (Debian/Ubuntu)", en: "Update package list (Debian/Ubuntu)" } },
    { c: "sudo apt upgrade -y", d: { tr: "Kurulu paketleri yükselt", en: "Upgrade installed packages" } },
    { c: "sudo apt install <paket>", d: { tr: "Paket kur", en: "Install a package" } },
    { c: "sudo apt remove <paket>", d: { tr: "Paketi kaldır", en: "Remove a package" } },
    { c: "apt list --upgradable", d: { tr: "Güncellenebilir paketler", en: "Upgradable packages" } },
    { c: "sudo yum install <paket>", d: { tr: "Paket kur (RHEL/CentOS)", en: "Install a package (RHEL/CentOS)" } },
  ] },
  { t: { tr: "🌐 Ağ", en: "🌐 Network" }, items: [
    { c: "ip a", d: { tr: "Ağ arayüzleri ve IP adresleri", en: "Network interfaces and IPs" } },
    { c: "ss -tulnp", d: { tr: "Dinleyen portlar ve süreçleri", en: "Listening ports and processes" } },
    { c: "ping -c 4 <host>", d: { tr: "Bağlantıyı 4 paketle test et", en: "Test connectivity with 4 packets" } },
    { c: "curl -I <url>", d: { tr: "Bir URL'nin HTTP başlıklarını al", en: "Fetch HTTP headers of a URL" } },
    { c: "wget <url>", d: { tr: "Dosya indir", en: "Download a file" } },
    { c: "sudo ufw status", d: { tr: "Güvenlik duvarı (ufw) durumu", en: "Firewall (ufw) status" } },
  ] },
  { t: { tr: "🔄 Süreç & İş", en: "🔄 Processes & Jobs" }, items: [
    { c: "ps aux | grep <ad>", d: { tr: "İsme göre süreç bul", en: "Find a process by name" } },
    { c: "kill <pid>", d: { tr: "Süreci nazikçe sonlandır", en: "Gracefully terminate a process" } },
    { c: "kill -9 <pid>", d: { tr: "Süreci zorla sonlandır", en: "Force kill a process" } },
    { c: "nohup <komut> &", d: { tr: "Komutu arka planda (oturum kapansa da) çalıştır", en: "Run in background (survives logout)" } },
  ] },
  { t: { tr: "🗜 Arşiv & İzin", en: "🗜 Archive & Permissions" }, items: [
    { c: "tar -czf <ad>.tar.gz <klasör>", d: { tr: "Klasörü sıkıştır (.tar.gz)", en: "Compress a folder (.tar.gz)" } },
    { c: "tar -xzf <ad>.tar.gz", d: { tr: "Arşivi aç", en: "Extract an archive" } },
    { c: "chmod 755 <dosya>", d: { tr: "İzinleri ayarla (rwxr-xr-x)", en: "Set permissions (rwxr-xr-x)" } },
    { c: "chown <kullanıcı>:<grup> <yol>", d: { tr: "Sahip/grup değiştir (-R ile özyinelemeli)", en: "Change owner/group (-R for recursive)" } },
  ] },
  { t: { tr: "🔧 Git", en: "🔧 Git" }, items: [
    { c: "git status", d: { tr: "Çalışma dizinindeki değişiklikler", en: "Working tree changes" } },
    { c: "git pull", d: { tr: "Uzaktan en son değişiklikleri çek", en: "Pull latest changes from remote" } },
    { c: "git add .", d: { tr: "Tüm değişiklikleri sahnele", en: "Stage all changes" } },
    { c: 'git commit -m "<mesaj>"', d: { tr: "Sahnelenenleri kaydet (commit)", en: "Commit staged changes" } },
    { c: "git push", d: { tr: "Commit'leri uzağa gönder", en: "Push commits to remote" } },
    { c: "git log --oneline -10", d: { tr: "Son 10 commit'i özet göster", en: "Show last 10 commits" } },
    { c: "git checkout <dal>", d: { tr: "Dala geç", en: "Switch branch" } },
    { c: "git clone <url>", d: { tr: "Depoyu klonla", en: "Clone a repository" } },
  ] },
  { t: { tr: "🌐 Nginx / Web", en: "🌐 Nginx / Web" }, items: [
    { c: "sudo nginx -t", d: { tr: "Nginx yapılandırmasını test et", en: "Test Nginx configuration" } },
    { c: "sudo systemctl reload nginx", d: { tr: "Nginx'i kesintisiz yeniden yükle", en: "Reload Nginx gracefully" } },
    { c: "tail -f /var/log/nginx/error.log", d: { tr: "Nginx hata loglarını canlı izle", en: "Follow Nginx error logs" } },
    { c: "tail -f /var/log/nginx/access.log", d: { tr: "Nginx erişim loglarını canlı izle", en: "Follow Nginx access logs" } },
    { c: "sudo certbot renew --dry-run", d: { tr: "SSL yenilemesini deneme amaçlı test et", en: "Test SSL renewal (dry run)" } },
    { c: "sudo certbot --nginx -d <alan-adı>", d: { tr: "Alan adı için Let's Encrypt SSL kur", en: "Get Let's Encrypt SSL for a domain" } },
  ] },
];

export const DOCKER_GROUPS = [
  { t: { tr: "🐳 Konteyner", en: "🐳 Containers" }, items: [
    { c: "docker ps", d: { tr: "Çalışan konteynerler", en: "Running containers" } },
    { c: "docker ps -a", d: { tr: "Tüm konteynerler (durmuşlar dahil)", en: "All containers (incl. stopped)" } },
    { c: "docker start <konteyner>", d: { tr: "Konteyneri başlat", en: "Start a container" } },
    { c: "docker stop <konteyner>", d: { tr: "Konteyneri durdur", en: "Stop a container" } },
    { c: "docker restart <konteyner>", d: { tr: "Konteyneri yeniden başlat", en: "Restart a container" } },
    { c: "docker rm <konteyner>", d: { tr: "Konteyneri sil", en: "Remove a container" } },
    { c: "docker logs -f <konteyner>", d: { tr: "Konteyner loglarını canlı izle", en: "Follow container logs" } },
    { c: "docker exec -it <konteyner> bash", d: { tr: "Konteyner içinde kabuk aç", en: "Open a shell inside a container" } },
    { c: "docker stats", d: { tr: "Canlı CPU/RAM kullanımı", en: "Live CPU/RAM usage" } },
    { c: "docker inspect <konteyner>", d: { tr: "Detaylı yapılandırma (JSON)", en: "Detailed config (JSON)" } },
  ] },
  { t: { tr: "📀 Görüntü (Image)", en: "📀 Images" }, items: [
    { c: "docker images", d: { tr: "İndirilmiş görüntüleri listele", en: "List downloaded images" } },
    { c: "docker pull <görüntü>", d: { tr: "Görüntü indir (ör. nginx:latest)", en: "Pull an image (e.g. nginx:latest)" } },
    { c: "docker rmi <görüntü>", d: { tr: "Görüntüyü sil", en: "Remove an image" } },
    { c: "docker build -t <ad> .", d: { tr: "Dockerfile'dan görüntü oluştur", en: "Build image from Dockerfile" } },
    { c: "docker history <görüntü>", d: { tr: "Görüntü katmanları", en: "Image layers" } },
  ] },
  { t: { tr: "📦 Compose", en: "📦 Compose" }, items: [
    { c: "docker compose up -d", d: { tr: "Stack'i arka planda başlat", en: "Start stack in background" } },
    { c: "docker compose down", d: { tr: "Stack'i durdur ve kaldır", en: "Stop and remove stack" } },
    { c: "docker compose ps", d: { tr: "Stack servislerinin durumu", en: "Status of stack services" } },
    { c: "docker compose logs -f", d: { tr: "Stack loglarını canlı izle", en: "Follow stack logs" } },
    { c: "docker compose restart", d: { tr: "Stack'i yeniden başlat", en: "Restart stack" } },
    { c: "docker compose pull", d: { tr: "Görüntüleri güncelle", en: "Pull updated images" } },
  ] },
  { t: { tr: "🧹 Temizlik & Disk", en: "🧹 Cleanup & Disk" }, items: [
    { c: "docker system df", d: { tr: "Docker disk kullanımı", en: "Docker disk usage" } },
    { c: "docker system prune -a", d: { tr: "Kullanılmayan her şeyi temizle — DİKKAT", en: "Remove all unused data — CAUTION" } },
    { c: "docker image prune", d: { tr: "Artık (dangling) görüntüleri sil", en: "Remove dangling images" } },
    { c: "docker container prune", d: { tr: "Durmuş konteynerleri sil", en: "Remove stopped containers" } },
    { c: "docker volume prune", d: { tr: "Kullanılmayan birimleri (volume) sil", en: "Remove unused volumes" } },
  ] },
  { t: { tr: "💾 Volume & Ağ", en: "💾 Volumes & Network" }, items: [
    { c: "docker volume ls", d: { tr: "Birimleri (volume) listele", en: "List volumes" } },
    { c: "docker network ls", d: { tr: "Ağları listele", en: "List networks" } },
    { c: "docker run -d --name <ad> -p 8080:80 <görüntü>", d: { tr: "Yeni konteyner çalıştır (port eşle)", en: "Run a new container (map port)" } },
  ] },
  { t: { tr: "🔎 Bilgi & Hata Ayıklama", en: "🔎 Info & Debug" }, items: [
    { c: "docker version", d: { tr: "Docker sürüm bilgisi", en: "Docker version info" } },
    { c: "docker info", d: { tr: "Docker kurulum özeti", en: "Docker installation summary" } },
    { c: "docker top <konteyner>", d: { tr: "Konteyner içindeki süreçler", en: "Processes inside a container" } },
    { c: "docker cp <konteyner>:<yol> <yerel>", d: { tr: "Konteynerden dosya kopyala", en: "Copy a file from a container" } },
    { c: "docker exec <konteyner> env", d: { tr: "Konteynerin ortam değişkenleri", en: "Container environment variables" } },
  ] },
];

const L = () => (currentLang() === "en" ? "en" : "tr");

// Komutta yer tutucu (<...>) var mı? Yoksa tek tıkla çalıştırılabilir.
function hasPlaceholder(cmd) { return /<[^>]+>/.test(cmd); }

// Arama kutusu + kategorize liste oluştur.
// onPick(cmd, run): komut seçilince çağrılır. run=true ise doğrudan çalıştır.
export function renderCmdPanel(container, groups, onPick, opts = {}) {
  const lang = L();
  const ph = lang === "en" ? "Filter commands…" : "Komut ara…";
  const hint = opts.hint || (lang === "en" ? "Click a command to insert it; ▶ runs it directly."
    : "Komuta tıkla → yazılır · ▶ ile doğrudan çalıştır.");
  const runTitle = lang === "en" ? "Run now" : "Şimdi çalıştır";
  container.innerHTML = `
    <div class="cmd-help-top">
      <input type="search" class="cmd-search" placeholder="${escapeAttr(ph)}" autocomplete="off">
      <div class="cmd-hint dk-sub">${escapeHtml(hint)}</div>
    </div>
    <div class="cmd-groups"></div>`;
  const groupsEl = container.querySelector(".cmd-groups");

  const draw = (filter) => {
    const f = (filter || "").toLowerCase().trim();
    const parts = [];
    for (const g of groups) {
      const items = g.items.filter((it) =>
        !f || it.c.toLowerCase().includes(f) || (it.d[lang] || "").toLowerCase().includes(f));
      if (!items.length) continue;
      parts.push(`<div class="cmd-grp"><div class="cmd-grp-h">${escapeHtml(g.t[lang])}</div>` +
        items.map((it) => {
          const runnable = !hasPlaceholder(it.c);
          return `<div class="cmd-row">
            <button class="cmd-main" data-cmd="${escapeAttr(it.c)}" title="${escapeAttr(it.c)}">
              <code class="cmd-code">${escapeHtml(it.c)}</code>
              <span class="cmd-desc">${escapeHtml(it.d[lang] || "")}</span>
            </button>
            ${runnable ? `<button class="cmd-run" data-cmd="${escapeAttr(it.c)}" title="${escapeAttr(runTitle)}">▶</button>` : ""}
          </div>`;
        }).join("") + `</div>`);
    }
    groupsEl.innerHTML = parts.length ? parts.join("")
      : `<div class="dk-sub" style="padding:12px">${lang === "en" ? "No matching command." : "Eşleşen komut yok."}</div>`;
    groupsEl.querySelectorAll(".cmd-main").forEach((b) =>
      b.addEventListener("click", () => onPick(b.dataset.cmd, false)));
    groupsEl.querySelectorAll(".cmd-run").forEach((b) =>
      b.addEventListener("click", () => onPick(b.dataset.cmd, true)));
  };

  const search = container.querySelector(".cmd-search");
  search.addEventListener("input", () => draw(search.value));
  draw("");
  setTimeout(() => { try { search.focus(); } catch (_) {} }, 30);
}
