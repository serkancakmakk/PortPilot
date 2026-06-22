# 🦖 Serkanzilla

![version](https://img.shields.io/badge/sürüm-v1-2563eb) ![node](https://img.shields.io/badge/node-%3E%3D18-339933) ![license](https://img.shields.io/badge/lisans-MIT-555)

Uzak sunuculara **SSH/SFTP** ile bağlanıp tarayıcıdan, tıpkı Windows Dosya Gezgini gibi
dosya yönetimi yapmanı sağlayan, çapraz platform (macOS · Windows · Linux) bir web aracı.
Üstüne bir de **Docker konteyner yönetim paneli** içerir.

> Sunucuya SSH ile bağlanır, tüm işlemleri SFTP ve uzaktan komut (`df`, `tar`, `docker`) üzerinden yapar.
> Hiçbir kimlik bilgisi internete gönderilmez; her şey kendi makinende çalışır.

---

## ✨ Özellikler

### 📁 Dosya yönetimi
- **İki görünüm:** Masaüstü tarzı **simge (ızgara)** ve detaylı **liste** — tercih hatırlanır
- Klasör gezme, adres çubuğu (breadcrumb), geri / üst / yenile
- **Sürükle-bırak** ile veya tıklanabilir alanla **dosya yükleme** (çoklu)
- **İndirme:** tek dosya, klasör (`.tar.gz`) veya **checkbox ile çoklu seçip** tek arşiv
- **Yeni klasör**, yeniden adlandırma / taşıma, özyinelemeli silme
- **Yerleşik metin düzenleyici:** dosyayı indirmeden aç, düzenle, `Ctrl/Cmd+S` ile kaydet
- Sol kenar çubuğunda **hızlı erişim** (Ana Dizin, /, /var, /etc, /tmp) ve **disk kullanım** göstergesi

### 🐳 Docker yönetimi
- Konteynerleri listele; **başlat · durdur · duraklat · yeniden başlat · sil**
- Canlı **log görüntüleyici**
- **Görüntü (image)** listesi ve silme

### 🔐 Bağlantı
- **Parola** veya **SSH özel anahtarı** (PEM) ile kimlik doğrulama
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
| `npm start` | Sunucuyu başlatır |
| `npm run dev` | Otomatik yeniden başlatmalı geliştirme modu |
| `PORT=8080 npm start` | Farklı portta çalıştırır |

---

## 📖 Kullanım

1. **Bağlan:** Sunucu adresi, port (varsayılan 22) ve kullanıcı adını gir; parola veya SSH anahtarıyla doğrula.
2. **Gezin:** Klasöre çift tıkla; metin dosyaları düzenleyicide açılır, diğerleri indirilir.
3. **Yükle:** Dosyaları pencereye sürükle ya da yükleme alanına tıkla.
4. **İndir:** Bir öğe seç ve ⬇ İndir'e bas; ya da kutucuklarla çoklu seçip tek `.tar.gz` indir.
5. **Docker:** Sol menüden **🐳 Docker Yönetimi** ile konteynerleri yönet.
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
