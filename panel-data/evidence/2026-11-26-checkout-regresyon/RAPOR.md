# Stage checkout regresyonu — V2 (26.11.2026)

Ortam: stage (`www.nadirgold.work`), `API_MODE=v2`, her partide `x-api-version: v2` doğrulandı. Hesap: staging (customerId 367284).
Zincir: 7 parti + retest, sepet rate-limit'i için partiler arası 45 dk (P7, kullanıcı isteğiyle P6'dan önce koşuldu).

## Sonuç

**Yeni V2 checkout regresyonu bulunmadı.** Açık konu: kartlı ödemede 3DS hatası 4351 — V1'de de aynı, stage ödeme altyapısı.

**V2 baz alınarak sayım (kullanıcı kararı, 26.11):** takı fiyatında doğru taraf V2 (NSB-7332) → V1'e kıyasla düşen 6 taksit testi V2 açısından PASS sayılır.
**46 PASS · 4 FAIL · 12 SKIP · 2 koşulmadı.** Kalan 4 FAIL: 36 FIFA KK ve 20 ziynet KK (3DS 4351, V1'de de aynı), 38 zırhlı (stok — test verisi), 40 API-06 (`basket_hash` label, bilinen nit).

| Parti | Kapsam | Sonuç | Sipariş / talimat |
|---|---|---|---|
| P1 | 10 KK, 09 havale, 16 gümüş havale, 18 hesaba altın | 4/4 | 1727683, 86, 92, 95 |
| P2 | 11–14 düzenli birikim | 4/4 | talimat 958, 961, 964, 967 |
| P3 | 15 birikim, 19 ziynet havale, 20 ziynet KK, 17 gümüş KK | 2/4 → retest 17 PASS (1727875), 20 FAIL (4351) | talimat 970, 1727746 |
| P4 | 21 HFA, 29 takı KK, 30 takı havale, 08 | 9/9 | 1727752, 55, 58 |
| P5 | 28 çoklu banka havale, 31 takı KK, 32 sepet, 33 kur | 6/6 | 1727809, 12, 15, 18 |
| P7 | 40–42 taksit | 12 PASS / 7 FAIL / 10 SKIP | — |
| P6 | 36 FIFA, 37 ileri tarih, 38 zırhlı, 39 moto | 2 PASS / 2 FAIL / 2 SKIP | 1727848 |

## FAIL'lerin sınıflandırması

| Neden | Test | Ürün hatası? |
|---|---|---|
| 3DS 4351 "ödeme durumu callback 3ds olmalıdır", sipariş açılmıyor | 36 FIFA KK (V2 ×2, **V1 ×1 aynı**), 20 ziynet KK (retest) | Stage ödeme/3DS — V2'ye özgü değil |
| Takı V1 fiyatı cache'ten yüksek (V1 oracle hatalı) | 40 API-01/02/17/18/19, 42 KUR-01 | V1 (NSB-7332 yorumu) |
| Hata label'ı `basket_hash` (camelCase beklenen) | 40 API-06 | Bilinen nit (NSB-7245 notu) |
| 50 Gr külçe "yakında stokta" | 38 zırhlı | Test verisi |
| Kayıtlı kart `count()` render'dan önce okunuyordu | 17, 20 (P3) | Test — 9 spec'e `waitFor` eklendi |

SKIP: 41 (tasarım gereği yalnız dev), 39 moto ×2 (adres için slot yok, V1 = V2).
Test verisi: stage'de `bilezik6.4` geçersiz → `QA_TAKI_SKU="ajda 6,4"` (22 Ayar Ajda Bilezik 10 Gr, taksite açık).

## Bulgular

1. **Takı fiyatı V1 ≠ V2 (25/25 ürün, sabit +1.195,17 TL V1 yüksek).** Külçe/gümüş/ziynet/HFA/FIFA eşit. Kök (NSB-7332, Ersin 25.11): V2 düzeltildi (tek SKU opsiyonu 276 TL); V1 `MProductOption::getProductOptions` 5000 sn `product_id` cache'i ürün sayfası tarafından doldurulunca tüm beden satırlarını (1380 TL) kullanıyor. Ersin "ayrı task açılmalı" demiş — **açılmamış**. Kanıt: `kategori-fiyat-v1v2.log`, `p7.log`.
2. **3DS 4351** — FIFA KK iki V2 + bir V1 koşumunda aynı; ziynet KK retest'te aynı belirti (mesaj 3DS iframe'inde). Aynı saatlerde gümüş KK (1727875) geçti. Sipariş açılmadı, `lastPaymentResponse` son başarılı siparişi gösteriyor (yarım/tahsil edilmiş sipariş yok). Ödeme no'ları: 3304869, 3304945 (V2), 3304955 (V1).
3. **orderDetail V1 = V2** — bugünkü 19 siparişin hepsinde alan alan aynı (yalnız bilinen number→string, NSB-6375). Kanıt: `orderdetail-p*.log`.
4. **savingsSubscriptions/get** — 5 talimatta tek fark: V2 `paymentInfo.logo` dolu, V1 `null` (V2 lehine).
5. Sepet dışı okuma uçları (`customer/orders`, `bank`, `bankList`, `orders/completed`, `lastPaymentResponse`, `savingsSubscriptions/list`, `order/iban-update`): yalnız bilinen/kapalı kart farkları (NSB-6375, 6266, 6531). Kanıt: `api-diff-1.log`.
6. Ödenmeyen havale siparişleri ~1 saat içinde "İptal Edildi"ye düşüyor (1727683, 1727692, 1727746; 25.11'de 1727650). Mevcut iş kuralı gibi; V1 kıyası yapılmadı.

## Ortam notları
- 11:58 stage gate çerezi (`AUTHP_ACCESS_TOKEN`) 00:26'da dolmuştu; `auth.nadirgold.work` birkaç dakika yanıt vermedi. QA Chrome (CDP 9333) ile yenilendi, 00:03'e kadar geçerli.
- Mac ~17:30'da uykuya geçti; retest 18:12 yerine 18:51'de koştu.
- Son V1 karşılaştırma koşumu staging oturumuna `NG_API_V2=0` yazdı; sonraki koşum varsayılan `API_MODE=v2` ile geri yazar.
