# EsF arkadaş odası sunucusu

Bu küçük Node.js servisi yalnızca Apinator presence oda üyeliğini imzalar. Gizli anahtar sunucuda kalır; HTML dosyasına yazılmaz.

## Render ile dağıtım (Android telefondan da yapılabilir)
1. Bu klasörü GitHub deposuna yükle veya ZIP içeriğini bir depoya aktar.
2. Render'da **New → Web Service** seçip depoyu bağla.
3. Runtime: Node; Build Command: `npm install`; Start Command: `npm start`.
4. Environment bölümüne şu değişkenleri ekle: `APINATOR_APP_ID`, `APINATOR_KEY`, `APINATOR_SECRET`, `APINATOR_CLUSTER=eu`. Değerleri Apinator panelindeki aynı uygulamadan al. Secret değerini HTML'ye veya herkese açık depoya koyma.
5. Deploy tamamlanınca `https://...onrender.com/health` adresi `ok:true` döndürmeli.
6. `EsF_Arkadas_Online.html` dosyasında `ESF_AUTH_SERVER` değerini Render adresinle değiştir. HTML dosyasını arkadaşlarınla paylaş.

## Oyun
Menüde ODA OLUŞTUR ile kod üret; arkadaşların aynı kodu ODAYA KATIL alanına girsin. Oda üyeleri görünür, oyuncuların konumları canlı aktarılır ve oda sohbeti mesajları bağlı oyunculara iletilir. Sohbet kutusu 2 saniyede bir yenilenir. Aynı haritayı seçip operasyonu başlatın. Bu ilk çevrim içi sürüm oda/presence ve oyuncu konum senkronizasyonudur; hasar, mermi, C4 ve raund otoritesi henüz sunucuya taşınmış değildir.
