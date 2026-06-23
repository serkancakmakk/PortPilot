# 🦖 Serkanzilla

![version](https://img.shields.io/badge/sürüm-v1-2563eb) ![node](https://img.shields.io/badge/node-%3E%3D18-339933) ![license](https://img.shields.io/badge/lisans-MIT-555)

Uzak sunuculara **SFTP, FTP veya FTPS** ile bağlanıp tarayıcıdan, tıpkı Windows Dosya Gezgini gibi
dosya yönetimi yapmanı sağlayan, çapraz platform (macOS · Windows · Linux) bir web aracı.
Üstüne bir de **Docker konteyner yönetim paneli** içerir.

> Bağlantı ekranından protokolü seç (SFTP / FTP / FTPS) ve istediğin portu gir.
> Docker, disk kullanımı ve `.tar.gz` indirme gibi komut tabanlı özellikler yalnızca SFTP (SSH) bağlantılarında çalışır.
> Hiçbir kimlik bilgisi internete gönderilmez; her şey kendi makinende çalışır.

---

## 📸 Ekran Görüntüleri

### Dosya Gezgini
Masaüstü tarzı simge görünümü, kenar çubuğunda hızlı erişim ve disk kullanımı.

![Dosya Gezgini](screenshots/02-explorer.png)

### Docker Yönetimi
Konteynerleri başlat / durdur / yeniden başlat / sil; canlı log görüntüleyici.

![Docker Yönetimi](screenshots/03-docker.png)

### Bağlantı Ekranı
Parola veya SSH anahtarı; kayıtlı sunucularla tek tıkla bağlanma.

<p align="center"><img src="screenshots/01-login.png" alt="Bağlantı Ekranı" width="420"></p>

---

## ✨ Özellikler

### 📁 Dosya yönetimi
- **İki görünüm:** Masaüstü tarzı **simge (ızgara)** ve detaylı **liste** — tercih hatırlanır
- Klasör gezme, adres çubuğu (breadcrumb), geri / üst / yenile
- **Sürükle-bırak** ile **dosya ve klasör** yükleme — klasörler alt klasörleriyle birlikte (yapı korunur)
- **Paralel yükleme:** dosyalar aynı anda (varsayılan 4) ve **akış (stream)** olarak gider — büyük dosyalar/klasörler RAM'i şişirmez
- **Aktarım seçenekleri (FileZilla tarzı):** yükleme öncesi çakışma davranışı seçilir — **Üzerine yaz · Atla · Her ikisini tut (yeniden adlandır)** + aynı anda yükleme sayısı; "bu oturumda tekrar sorma"
- Yükleme sırasında **canlı ilerleme çubuğu** (%)
- **İndirme:** tek dosya, klasör (`.tar.gz`) veya **checkbox ile çoklu seçip** tek arşiv
- **Yeni klasör**, yeniden adlandırma / taşıma, özyinelemeli silme
- **Yerleşik metin düzenleyici:** dosyayı indirmeden aç, düzenle, `Ctrl/Cmd+S` ile kaydet
- Sol kenar çubuğunda **hızlı erişim** (Ana Dizin, /, /var, /etc, /tmp) ve **disk kullanım** göstergesi

### 🐳 Docker yönetimi
- Konteynerleri listele; **başlat · durdur · duraklat · yeniden başlat · sil**
- **Canlı CPU ve RAM kullanımı** her konteyner için tabloda (RAM yüzdesiyle birlikte)
- Canlı **log görüntüleyici**
- **Görüntü (image)** listesi ve silme

### 🔐 Bağlantı
- **SFTP / FTP / FTPS** protokol desteği (bağlantı ekranından seçilir)
- **Parola** veya **SSH özel anahtarı** (PEM) ile kimlik doğrulama (anahtar yalnızca SFTP'de)
- **Kayıtlı sunucular:** bağlantıları kaydet, tek tıkla geri bağlan (sunucuda `servers.json` dosyasında kalıcı)
- Boşta kalan oturum 30 dk sonra otomatik kapanır

---

## 🚀 Kurulum

Gereksinim: **Node.js 18+**

```bash
git clone <repo-adresi>
cd sftp-gezgini
npm install
npm start
```

Tarayıcıdan **http://localhost:3000** adresini aç.

| Komut | Açıklama |
|-------|----------|
| `npm start` | Web sunucusunu başlatır (tarayıcı) |
| `npm run dev` | Otomatik yeniden başlatmalı geliştirme modu |
| `PORT=8080 npm start` | Farklı portta çalıştırır |
| `npm run app` | Masaüstü (Electron) penceresinde çalıştırır |

---

## 🖥️ Masaüstü uygulaması (Mac · Windows · Linux)

Serkanzilla, web aracının yanı sıra **çapraz platform bir masaüstü uygulaması** olarak da paketlenebilir
(Electron). Kurulum dosyalarını **kendi makinende sen derlersin** — depoda hazır ikili (binary) gönderilmez.

```bash
npm install          # electron + electron-builder dahil bağımlılıklar
npm run dist         # bulunduğun işletim sistemi için derler
```

Belirli platformlar için:

| Komut | Çıktı (`dist/` klasörüne) |
|-------|---------------------------|
| `npm run dist:mac` | `.dmg` (Intel + Apple Silicon) ve `.zip` |
| `npm run dist:win` | `Setup .exe` (kurulumlu) ve taşınabilir `.exe` |
| `npm run dist:linux` | `.AppImage`, `.deb`, `.rpm`, `.pacman` (x64 + arm64) |
| `npm run dist` | Geçerli işletim sistemi için hepsi |

> **Not:** Windows derlemesi macOS/Linux üzerinde electron-builder'ın gömülü wine'ı ile yapılabilir.
> macOS hedefleri yalnızca macOS'ta üretilebilir. Linux `.rpm` için `rpmbuild`, `.pacman` için
> `bsdtar` (libarchive-tools) + `zstd` gerekir; bunlar CI'da (Ubuntu) otomatik kurulur.

### Linux dağıtımı — hangi paketi kim kurar?

| Dağıtım | Dosya | Kurulum |
|---------|-------|---------|
| **CachyOS / Arch / Manjaro** | `.pacman` | `sudo pacman -U Serkanzilla-*-x86_64.pacman` |
| **Ubuntu / Debian** | `.deb` | `sudo apt install ./Serkanzilla_*_amd64.deb` |
| **Fedora / RHEL / openSUSE** | `.rpm` | `sudo dnf install ./Serkanzilla-*.x86_64.rpm` |
| **Her dağıtım (kurulumsuz)** | `.AppImage` | `chmod +x *.AppImage && ./*.AppImage` |

> AppImage FUSE2 ister; Arch tabanlılarda `sudo pacman -S fuse2` ya da
> `./*.AppImage --appimage-extract-and-run` ile çalıştırılır.

#### 🔁 CachyOS / Arch için otomatik güncellenen pacman deposu (önerilen)

AUR'a gerek yok. Her sürümde CI, x86_64 pacman paketini bir depoya çevirip `arch-repo`
release'inde yayımlar. Kullanıcı `/etc/pacman.conf` sonuna **bir kez** şunu ekler:

```ini
[serkanzilla]
SigLevel = Optional TrustAll
Server = https://github.com/serkancakmakk/Serkanzilla/releases/download/arch-repo
```

Sonra kurar ve bundan sonra normal sistem güncellemeleriyle otomatik güncel kalır:

```sh
sudo pacman -Sy serkanzilla     # kur
sudo pacman -Syu                # güncelle (yeni sürümler otomatik gelir)
```

### Web'den indirme (kullanıcılar için)
Web arayüzü (`npm start`) açıkken giriş ekranındaki **"💻 Masaüstü uygulamasını indir"** ile
kullanıcılar **kendi işletim sistemine uygun** kurulumu indirebilir (sistem otomatik algılanır).
Bu liste sunucudaki `dist/` klasörünü okur — yani **web sunucusunu barındıran makinede**
`npm run dist` çalıştırılmış (ya da `dist/` kopyalanmış) olmalıdır.

> `dist/` klasörü `.gitignore` ile dışlanmıştır; ikili dosyalar depoyu şişirir.
> Hazır kurulumları dağıtmak istersen **GitHub Releases**'e yükle (git geçmişine ekleme).

---

## 📖 Kullanım

1. **Bağlan:** Sunucu adresi, port (varsayılan 22) ve kullanıcı adını gir; parola veya SSH anahtarıyla doğrula.
2. **Gezin:** Klasöre çift tıkla; metin dosyaları düzenleyicide açılır, diğerleri indirilir.
3. **Yükle:** Dosya veya **klasörü** pencereye sürükle (ya da Yükle / Klasör Yükle butonları). Açılan **aktarım seçenekleri** penceresinden çakışma davranışını (üzerine yaz / atla / yeniden adlandır) ve paralel sayısını seç.
4. **İndir:** Bir öğe seç ve ⬇ İndir'e bas; ya da kutucuklarla çoklu seçip tek `.tar.gz` indir.
5. **Docker:** Sol menüden **🐳 Docker Yönetimi** ile konteynerleri yönet; **CPU/RAM** kullanımını canlı izle.
6. **Kaydet:** Giriş ekranında "Bu sunucuyu kaydet" ile bağlantıyı kalıcı hale getir.

### Klavye kısayolları
| Tuş | İşlev |
|-----|-------|
| `F5` | Yenile |
| `Backspace` | Üst klasör |
| `Ctrl/Cmd + S` | Düzenleyicide kaydet |
| `Esc` | Düzenleyiciyi/paneli kapat |

---

## 🛠 Teknolojiler

- **Backend:** Node.js · [Express](https://expressjs.com/) · [ssh2](https://github.com/mscdex/ssh2) (SFTP + exec) · [multer](https://github.com/expressjs/multer)
- **Frontend:** Saf HTML/CSS/JavaScript (bağımlılık yok)

## 📂 Proje yapısı

```
.
├── server.js          # Express + SSH/SFTP backend ve tüm API uçları
├── public/
│   ├── index.html     # Arayüz iskeleti
│   ├── style.css      # Tasarım (Fluent/Win11 esinli)
│   └── app.js         # Tüm istemci mantığı
├── package.json
├── .gitignore
└── README.md
```

---

## 🔒 Güvenlik notları

- Kimlik bilgileri yalnızca aktif bağlantı için bellekte tutulur; SFTP işlemleri dışında diske yazılmaz.
- **Kayıtlı sunucularda parolayı saklamayı seçersen**, bilgiler `servers.json` dosyasına **düz metin** olarak yazılır. Bu dosya `.gitignore` ile dışlanmıştır — **asla paylaşma/commit etme.**
- Araç yerel/güvenilir ağ için tasarlanmıştır. İnternete açacaksan önüne **HTTPS (ters proxy)** ve bir **kimlik doğrulama katmanı** koy.

---

## 📄 Lisans

MIT
