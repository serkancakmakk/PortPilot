# Sürüm Notları

## Yeni

**Dosya yönetimi**
- 🔒 **Dosya/klasör izinleri (chmod):** Sağ tık → "İzinler…" ile sekizlik izinleri (ör. 755/644) değiştir; klasörlerde sona `-R` ekleyerek içindekilere de uygula.
- 📋 **Kopyala / Kes / Yapıştır (sunucu içi):** Bir veya birden çok öğeyi kopyalayıp/keserek başka klasöre yapıştır (hedef klasörde sağ tık → Yapıştır).
- 🔎 **Sunucuda özyinelemeli arama:** Sağ tık (boş alan) → "Bu klasörde ara…" ile alt klasörler dahil ada göre dosya/klasör bul; sonuca tıklayınca konuma git.

**Yükleme / yerel gezgin**
- 🖥️ Uygulama içi **yerel dosya gezgini** ("Klasör Seç"): bilgisayarını gez, çoklu klasör/dosya seç, ızgara/liste görünümü, tarih & boyut, sürükle-bırakla yükleme.
- 🕘 **Son kullanılan yerel klasörler** ve **bu sunucu için son yerel konum** (sunucu bazlı, kalıcı). "Tekrar Yükle" ile bir klasörün güncel halini yeniden gönder.

**Sunucu araçları** (yeni "Sunucu Araçları" paneli)
- 🔌 **Açık portlar:** dinleyen TCP/UDP portları ve hangi süreç kullanıyor (`ss`/`netstat`).
- 📊 **Süreçler:** en çok CPU kullanan süreçler (PID/kullanıcı/CPU/RAM) + tek tıkla **sonlandır**.
- ⚙️ **systemd servisleri:** durumlarıyla listele; **başlat / yeniden başlat / durdur**.
- 📜 **Log:** herhangi bir dosyanın son N satırını görüntüle (tail).

**Güvenlik**
- 🔐 **Kayıtlı sunucu parolaları artık şifreli saklanıyor.** Parola, özel anahtar ve passphrase, işletim sisteminin anahtarlığından türetilen anahtarla şifrelenir (Electron `safeStorage`); `servers.json` artık düz metin parola tutmaz. Mevcut kayıtlar ilk açılışta otomatik şifreliye taşınır. (Anahtarlık olmayan ortamlarda eski davranış sürer.)

**Diğer**
- 🎉 **"Neler yeni?"**: yeni sürüme geçince sürüm notları otomatik gösteriliyor; sidebar → "Sürüm Notları" ile her zaman açılabilir.
- 🐛 Çoklu sunucuda yerel gezgin yolunun sunucular arası karışması düzeltildi (her sunucunun yereldeki konumu kendine ait).
- 🎨 Uygulama ikonu marka logosuyla güncellendi.
- 🔢 Sürüm rozeti gerçek sürümü gösteriyor.

## Yol haritası (sıradaki sürümlerde)
- Transfer kuyruğu + duraklat/devam, klasör senkronizasyonu, sunucudan sunucuya aktarım
- Dosya önizleme (resim/PDF), sürükleyip bilgisayara indirme, klavye kısayolları, otomatik yeniden bağlanma
