# NadirGold Test Automation

Playwright ile yazılmış E2E test suite'i.

## Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Playwright tarayıcılarını yükle

```bash
npx playwright install chromium
```

> **Not:** Google Chrome yüklüyse login daha güvenilir çalışır. [chrome.google.com](https://www.google.com/chrome) adresinden indirebilirsiniz.

### 3. `.env` dosyasını oluştur

```bash
cp .env.example .env
```

Ardından `.env` içindeki değerleri doldurun:

```
TEST_EMAIL=nadirgold_hesap_emaili
TEST_PASSWORD=nadirgold_hesap_sifresi
```

---

## Testleri çalıştırma

### Headless (arka planda)

```bash
npm test
```

### Headed (tarayıcı görünür)

```bash
npm run test:headed
```

### Sadece E2E yolculuk testi

```bash
npx playwright test tests/09-full-user-journey.spec.ts --headed
```

### HTML raporu görüntüle

```bash
npm run report
```

---

## Test dosyaları

| Dosya                              | Kapsam                      |
| ---------------------------------- | --------------------------- |
| `01-homepage.spec.ts`              | Ana sayfa                   |
| `02-login.spec.ts`                 | Login formu                 |
| `03-cart.spec.ts`                  | Sepet                       |
| `04-orders.spec.ts`                | Siparişler                  |
| `05-profile.spec.ts`               | Profil                      |
| `06-ecommerce-flow.spec.ts`        | Kategori & ürün akışı       |
| `07-checkout-flow.spec.ts`         | Checkout form elemanları    |
| `08-product-purchase-flow.spec.ts` | Ürün satın alma (adım adım) |
| `09-full-user-journey.spec.ts`     | Baştan sona E2E yolculuk    |

---

## İlk çalıştırma

İlk çalıştırmada `global-setup.ts` otomatik olarak login yapar ve session'ı `playwright/.auth/user.json` dosyasına kaydeder. Sonraki çalıştırmalarda session geçerliyse login adımı atlanır.
