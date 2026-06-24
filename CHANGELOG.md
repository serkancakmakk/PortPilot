# Sürüm Notları

## Yeni

**Dosya yönetimi**
- 🔀 **Sunucudan sunucuya aktarım:** Bir öğeye sağ tık → "Başka sunucuya aktar…" ile aktif sunucudaki dosya/klasörü başka bir bağlı sunucuya gönder (hedef + klasör seçilir; transfer kuyruğunda ilerler).
- 👁 **Dosya önizleme:** Resim ve PDF dosyalarını indirmeden pencere içinde görüntüle (sağ tık → "Önizle").
- ⌨️ **Klavye kısayolları:** F2 yeniden adlandır · Delete sil · F5 yenile · Backspace üst klasör.
- 🔒 **Dosya/klasör izinleri (chmod):** Sağ tık → "İzinler…" ile sekizlik izinleri (ör. 755/644) değiştir; klasörlerde sona `-R` ekleyerek içindekilere de uygula.
- 📋 **Kopyala / Kes / Yapıştır (sunucu içi):** Bir veya birden çok öğeyi kopyalayıp/keserek başka klasöre yapıştır (hedef klasörde sağ tık → Yapıştır).
- 🔎 **Sunucuda özyinelemeli arama:** Sağ tık (boş alan) → "Bu klasörde ara…" ile alt klasörler dahil ada göre dosya/klasör bul; sonuca tıklayınca konuma git.

**Yükleme / yerel gezgin**
- 📥 **Transfer kuyruğu:** Birden çok yükleme artık sıraya alınıp tek tek yapılıyor (üst üste binmez); sağ alttaki panelde durumları görünür. **Duraklat** sıradakileri bekletir, **Devam Et** sürdürür. (Kuyruk-seviyesi duraklatma; çalışan dosya tamamlanır.)
- 🔁 **Klasör senkronizasyonu:** "Senkronize Et" ile yalnızca **değişen/yeni** dosyaları gönder (boyut/tarih aynıysa atlanır). Hem yerel gezginde hem "son klasörler" kartlarında.
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
- 🔌 **Bağlantı kararlılığı:** SSH keepalive ile boşta kalan oturumların düşmesi azaltıldı.
- 🐧 **Linux'ta uygulama ikonu** düzeltildi (pencere/görev çubuğu ikonu açıkça atanıyor).
- 🎉 **"Neler yeni?"**: yeni sürüme geçince sürüm notları otomatik gösteriliyor; sidebar → "Sürüm Notları" ile her zaman açılabilir.
- 🐛 Çoklu sunucuda yerel gezgin yolunun sunucular arası karışması düzeltildi (her sunucunun yereldeki konumu kendine ait).
- 🎨 Uygulama ikonu marka logosuyla güncellendi.
- 🔢 Sürüm rozeti gerçek sürümü gösteriyor.

## Yol haritası (sıradaki sürümlerde)
- Dosyayı listeden bilgisayara sürükleyip indirme
