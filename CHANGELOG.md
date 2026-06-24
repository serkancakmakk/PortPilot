# Sürüm Notları

## Yeni

**Dosya gezgini — yeni**
- 🗜️ **Arşivle / çıkar:** Bir veya birden çok öğeye sağ tık → "Arşivle…" ile sunucu üzerinde **.tar.gz** veya **.zip** oluştur; bir arşive sağ tık → "Buraya çıkar" ile (`.tar.gz`/`.tar`/`.zip`/`.gz` …) bulunduğu klasöre aç.
- ✏️ **Toplu yeniden adlandırma:** Birden çok öğe seçip sağ tık → "Toplu yeniden adlandır…" ile **bul/değiştir (regex)** veya **sıralı isimlendirme** (`{name}`, `{n}`, başlangıç + basamak) uygula; **canlı önizleme** ve çakışma uyarısı.
- ↧ **Sürükleyip indirme:** Dosya/klasörü listeden bilgisayarına sürükleyip bırakarak indir (klasörler `.tar.gz` olarak).

**Sunucu araçları — yeni**
- ⏰ **Cron yönetimi:** "Sunucu Araçları → Cron" ile kullanıcının `crontab`'ını doğrudan düzenle ve kaydet.
- 👥 **Kullanıcı & grup + sahiplik:** "Kullanıcılar" sekmesinde sistem kullanıcılarını listele; **chown** kutusuyla bir yolun sahibini/grubunu (gerekirse `-R`) değiştir.
- 🐳 **Docker Compose:** "Docker → Compose" sekmesinde compose projelerini (stack) çalışan/toplam sayısıyla gör; **up / down / restart / stop / pull** ile yönet.

**Bağlantı & güvenlik — yeni**
- 🛠️ **Bağlantı düzenleme:** Kayıtlı bir sunucunun üzerine gelip ✎ ile **host/port/kullanıcı/ad/grup/protokol** bilgilerini silmeden güncelle (parola/anahtar korunur).
- 🔑 **SSH anahtarı üret & kur:** "Sunucu Araçları → SSH" ile sunucuda ed25519 anahtar çifti üret, açık anahtarı `authorized_keys`'e ekle; özel anahtarı kopyalayıp bağlantına kaydederek parolasız bağlan.

**Deneyim — yeni**
- 🌗 **Karanlık / aydınlık tema:** Sidebar → "Karanlık Tema" ile geçiş; seçim hatırlanır, ilk açılışta sistem tercihine uyar.

**Dosya yönetimi**
- 💾 **İndirirken "Nereye kaydedeyim?":** Masaüstü uygulamasında dosya/klasör indirirken sistem **Kaydet** penceresi açılır; istediğin klasörü seçersin ve son seçtiğin konum sonraki indirme için hatırlanır.
- 🐛 **İndirme düzeltmesi:** Bazı durumlarda indirmenin hiç başlamamasına yol açan hata (`session is not defined`) giderildi.
- ↕️ **Sütun bazlı sıralama:** Liste görünümünde **Ad / Değiştirilme / Tür / Boyut** başlığına tıklayarak sırala; tekrar tıklayınca yön (▲/▼) değişir. Klasörler her zaman üstte kalır, tercih hatırlanır.
- ℹ️ **Özellikler paneli:** Sağ tık → "Özellikler" ile tür, konum, boyut, **sahip/grup**, izinler (sekizlik + simgesel), değiştirilme tarihi; klasörlerde **özyinelemeli toplam boyut ve öğe sayısı** (`du`/`find`).
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
- 💽 **Disk kullanım analizi:** Yeni "Disk Analizi" sekmesi — bir klasörün doğrudan alt klasör/dosyalarının boyutunu `du` ile döker, en büyükten sıralar; **oran çubuğu**, **% pay** ve **toplam** gösterir. Bir klasöre tıklayarak içine inip "hangi klasör diski doldurmuş" sorusunu adım adım çöz.
- 🔌 **Açık portlar:** dinleyen TCP/UDP portları ve hangi süreç kullanıyor (`ss`/`netstat`).
- 📊 **Süreçler:** en çok CPU kullanan süreçler (PID/kullanıcı/CPU/RAM) + tek tıkla **sonlandır**.
- ⚙️ **systemd servisleri:** durumlarıyla listele; **başlat / yeniden başlat / durdur**.
- 📜 **Log:** herhangi bir dosyanın son N satırını görüntüle (tail).

**Güvenlik**
- 🔒 **Uygulama kilidi:** Açılışta master parola iste. Parola cihazda **scrypt + rastgele tuz** ile hash'lenir (düz metin saklanmaz). **Otomatik kilit** (boşta kalınca 1 dk–1 saat), **macOS'ta Touch ID** ile açma ve giriş ekranından **kur / parola değiştir / kaldır** yönetimi.
- 🔐 **Kayıtlı sunucu parolaları artık şifreli saklanıyor.** Parola, özel anahtar ve passphrase, işletim sisteminin anahtarlığından türetilen anahtarla şifrelenir (Electron `safeStorage`); `servers.json` artık düz metin parola tutmaz. Mevcut kayıtlar ilk açılışta otomatik şifreliye taşınır. (Anahtarlık olmayan ortamlarda eski davranış sürer.)

**Diğer**
- 🔌 **Bağlantı kararlılığı:** SSH keepalive ile boşta kalan oturumların düşmesi azaltıldı.
- 🐧 **Linux'ta uygulama ikonu** düzeltildi (pencere/görev çubuğu ikonu açıkça atanıyor).
- 🎉 **"Neler yeni?"**: yeni sürüme geçince sürüm notları otomatik gösteriliyor; sidebar → "Sürüm Notları" ile her zaman açılabilir.
- 🐛 Çoklu sunucuda yerel gezgin yolunun sunucular arası karışması düzeltildi (her sunucunun yereldeki konumu kendine ait).
- 🎨 Uygulama ikonu marka logosuyla güncellendi.
- 🔢 Sürüm rozeti gerçek sürümü gösteriyor.

## Yol haritası (sıradaki sürümlerde)

**Bağlantı & sunucular**
- 🗂️ **Çoklu sekme / iki panel (split-pane):** İki sunucuyu yan yana açıp aralarında sürükle-bırakla aktarım (FileZilla tarzı çift panel).

**Güvenlik**
- 📜 **Bağlantı geçmişi & işlem log'u:** Hangi sunucuya ne zaman bağlanıldı, hangi dosya silindi/taşındı (audit trail).
