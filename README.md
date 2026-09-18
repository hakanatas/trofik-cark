# Trofik Çark — Besin Ağı Rogue-lite

Öğrencilerin **biyoçeşitliliği** deneyimleyerek öğrenmesi için tasarlanmış, tarayıcıda
oynanan, kurulum gerektirmeyen bir denge/rogue-lite oyunu.

Oyuncu tek bir karakteri değil, ekosistemin kendisini yönetir: otçul, karnivor ve
ayrıştırıcı formları arasında geçiş yaparak **Biyoçeşitlilik Endeksi**'ni olabildiğince
yüksek ve uzun süre tutmaya çalışır.

## Nasıl oynanır

Herhangi bir kurulum gerekmez — `index.html` dosyasını bir tarayıcıda açmak yeterlidir
(veya bir yerel sunucu ile, ör. `python3 -m http.server` ve tarayıcıdan adrese gidilir).

**Kontroller**
- `WASD` / Ok Tuşları: Hareket
- `1` Tavşan (Otçul) · `2` Tilki (Karnivor) · `3` Mantar (Ayrıştırıcı): Form değiştir
- `Boşluk`: Seçili formun özel yeteneği
- `P`: Duraklat

**Formlar ve rolleri**
| Form | Amaç | Özel Yetenek |
|---|---|---|
| 🐇 Tavşan | Otları yiyerek aşırı büyümeyi ve yangın riskini azaltır | Sıçrayış — hızlı kaçış/dash |
| 🦊 Tilki | Tavşanları avlayarak aşırı çoğalmayı ve çölleşmeyi engeller | Hamle — uzun menzilli avlanma |
| 🍄 Mantar | Leşleri ayrıştırıp toprağı besler, hastalık riskini azaltır | Spor Patlaması — alan etkili ayrıştırma |

## Tasarım / eğitim mantığı

- **Biyoçeşitlilik Endeksi (0-100%)**: Bitki örtüsü, otçul sayısı, karnivor sayısı ve
  toprak sağlığının her biri bir "ideal aralığa" sahiptir; çok az *veya* çok fazla
  olması endeksi düşürür. Bu, gerçek ekosistemlerdeki dengenin tek yönlü değil çift
  yönlü (eksiklik ve aşırılık) bir kırılganlık olduğunu gösterir.
- **Rastgele olaylar**: Kuraklık, istilacı tür yayılımı, hastalık salgını ve ani
  yangınlar — gerçek dünyadaki biyoçeşitlilik tehditlerini simgeler.
- **Tur (round) sistemi**: Her 45 saniyede zorluk artar (rogue-lite eğrisi).
- **Oyun sonu özeti**: Ekosistem çöktüğünde, çöküşün asıl nedenini (hangi trofik
  seviyenin dengesinin bozulduğunu) öğrenciye gösterir — bu, dersin tartışma noktası
  olarak kullanılabilir.

## Dosyalar

- `index.html` — sayfa iskeleti ve HUD
- `style.css` — görünüm
- `game.js` — oyun mantığı: ızgara tabanlı ekosistem simülasyonu, oyuncu kontrolü,
  NPC otçul/karnivor davranışları, biyoçeşitlilik hesaplaması, olaylar

## Olası genişletmeler

- Öğretmen paneli: olay sıklığını/başlangıç zorluğunu ayarlama
- Ekosistem türlerinin (biyom) değişmesi: orman, savan, tundra
- Çok oyunculu / sınıf içi liderlik tablosu
