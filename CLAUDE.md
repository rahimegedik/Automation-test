# NadirGold QA — Claude Code çalışma notları

Bu repo iki şeyi barındırır: **NadirGold e-ticaret sitesinin Playwright E2E suite'i** ve **yerel QA Paneli** (Jira kartlarını V1↔V2 karşılaştırmalı test etmek için). Ana iş V2 API dönüşümünün (renewal) QA'sı.

## Hızlı komutlar

```bash
npm test                      # tüm journey testleri (chromium, headless)
npm run test:sepet            # tek grup örneği (headed)
npm run panel                 # QA paneli → http://localhost:4646
npm run report:create         # koşum log'undan HTML rapor
npx playwright test tests/01-homepage.spec.ts --project=chromium --reporter=line
```

`workers: 1` (paralel yok), timeout 30s (`TEST_TIMEOUT` ile artırılabilir), `trace: on-first-retry`, `screenshot: only-on-failure`.

⚠️ `test:all:report*` script'leri **PowerShell** çağırıyor — macOS'ta çalışmaz, bileşenlerini ayrı ayrı koş.

## Ortamlar

`.env` içindeki `NADIRGOLD_ENV` aktif ortamı seçer: `prod` | `staging` | `dev` | `local`. `playwright.config.ts` buradan `BASE_URL_<ENV>` okur, yoksa hata verip durur.

| Ortam | URL | Not |
|---|---|---|
| dev | `https://www.nadirgold.dev` | **Varsayılan.** V2 testlerinin yapıldığı yer |
| prod / staging | `https://www.nadirgold.work` | Aynı host |
| local | `http://localhost:3000` | |

Oturumlar ortam başına ayrı: `playwright/.auth/<env>-user.json` (gitignore'da). `global-setup.ts` oturumu doğrular, geçersizse tam login yapar.

**Prod guard:** journey testleri gerçek sipariş açar. Prod'da koşmak için `ALLOW_PROD_ORDERS=1` gerekir — guard'ı bilmeden kaldırma.

## Repo konvansiyonları

```
tests/NN-shortname.spec.ts    # 31 spec / 79 test, numaralı sıra
pages/XxxPage.ts             # 13 Page Object (locator'lar readonly, method'lar async)
global-setup.ts              # 4 ortamlı auth + OAuth state machine
panel/                       # QA paneli (server.mjs + public/index.html + runs.json)
panel-data/                  # verdict, kanıt, alarm ve blocker durumu (çoğu gitignore'da)
scripts/                     # rapor üreticileri
.claude/agents/              # 7 özel agent
```

**Test grupları ve yıkıcılık:**
- `01–08` utility (güvenli)
- `09–21` **journey — her koşum gerçek sipariş açar** (havale, kredi kartı, gümüş, ziynet, hesaptan-fiziki + 5 düzenli birikim periyodu)
- `22–27` Hesabım CRUD — **kasıtlı olarak yıkıcı değil** (gerçek silme/şifre değişimi yok), bu tasarımı bozma
- `28–33` özel akışlar (multi-banka havale, takı, kur güncelleme)

**"Tüm testleri koş" = journey seti (09–20)**, utility'ler (01–08) değil.

## V2 (renewal) test konvansiyonu

V2'yi açmak için **URL'e `?apiV2=1`** ekle → FE `NG_API_V2=1` cookie'si set eder. `?apiV2=0` legacy'e döner.

Doğrulama zorunlu: yanıt başlığında **`x-api-version: v2`** (veya `v1`). Flag SSR'a kadar ulaşır — sitemap.xml dahil.

- Varsayılan hedef: **`/api/v2` proxy'si** (`https://www.nadirgold.dev/api/v2/...`)
- Doğrudan `https://api-v2.nadirgold.dev/api/v1/...` sadece BE izolasyonu için
- Legacy: `https://api.nadirgold.dev/...`

**Yöntem:** her senaryoyu iki modda koş, **alan alan diff** al (tip + değer + eksik/fazla alan), id bazında eşleştir. Tek sayfa/tek kayıtla yetinme — sayfalayarak tüm kümeyi karşılaştır.

Swagger: `https://api-v2.nadirgold.dev/api/docs-json/customer` (servis başına: `customer`, `content`, `product`).

## Dev ortamı tuzakları

1. **Dev tamamen Google OAuth gate'i arkasında** (`auth.nadirgold.dev`). `curl` ham sayfa/sitemap alamaz — `storageState`'li Playwright context şart.
2. **Geçici script'i repo kökünde yaz** (`.foo.mjs`), scratchpad'de değil — `@playwright/test` modül çözümlemesi dosya konumuna göre çalışır. İş bitince sil.
3. **`?apiV2=1`'i doğrudan hedef URL'e koymak yetmez** — önce normal bir sayfa aç ki cookie set olsun, sonra hedefe git.
4. **API'yi doğrudan test etmek için**: `POST https://api.nadirgold.dev/customer/login` → `data.token` → `Authorization: Bearer`. **Tarayıcı `User-Agent`'ı şart**; `python-urllib` gibi UA'lar 403 yer.
5. `ctx.request` uygulamanın Bearer header'ını taşımaz (401 alır) — kimlikli çağrıları sayfanın kendi akışından yakala ya da yukarıdaki token yöntemini kullan.

## Bilinen sorunlar (kod tarafı)

- **`global-setup.ts` → `checkSession` yanlış pozitif veriyor.** Sadece `/hesabim/siparislerim`'in login'e yönlenmediğine bakıyor; FE hesap iskeletini cookie varlığına göre render ettiği için **iptal edilmiş bir JWT bu kontrolü geçer** ("✓ Mevcut session geçerli" yazar), ama içerideki API çağrıları sessizce 401 döner ve testler alakasız yerlerde patlar. Gerçek doğrulama için kimlikli bir API yanıtının 200 olduğu da assert edilmeli.
- Logout testi token'ı sunucu tarafında iptal eder. Sonrasında oturumu yenilemek için `playwright/.auth/dev-user.json`'ı kenara al ve herhangi bir spec koş (global-setup tam login yapar).
- `zsh`'de çoklu spec'i değişkenle geçerken **`${=VAR}`** kullan, yoksa "No tests found".
- zsh fonksiyonları içinde `set -a; source .env` sonrası PATH bozulabiliyor — çok adımlı ölçümleri bash fonksiyonu yerine Python'da yaz.

## Test hijyeni (zorunlu)

- **Mutasyon yapan her testte başlangıç durumunu geri al** ve geri aldığını ölçerek doğrula (izin toggle'ı, oluşturulan adres/IBAN, sepet).
- **Yıkıcı işlemde seçiciyi daralt.** Onay modalındaki butonu global `getByRole(...).last()` ile arama — modal konteynerine kilitle ve tıklamadan önce hedef id'yi assert et. Yeniden render olan listelerde yanlış kartın "Sil"ine basmak gerçek bir risk.
- Hesabı kalıcı bozacak happy-path'ler (telefon/e-posta değişimi, hesap silme) **kullanıcı onayı olmadan koşulmaz**. Not: `phoneUpdate` OTP kapalı hesapta telefonu **doğrudan** günceller.
- Test verisi oluşturursan ayırt edilebilir isim ver (`QA-<kart>-...`) ve sonunda temizle.

## Jira / Confluence

Kimlik: `~/.jira-credentials` (`JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_HOST=https://nadirgold.atlassian.net`).

- Issue okuma/yorum: REST **v3** (`/rest/api/3/issue/<key>`, `.../comment`, `.../transitions`). Yorum gövdesi **ADF** formatında olmalı.
- **JQL'de issue type adı İngilizce**: `issuetype = Bug` çalışır, `issuetype = "Hata"` (arayüzdeki ad) **0 sonuç döner**.
- Arama: `/rest/api/3/search/jql`, sayfalama `nextPageToken` ile (`isLast` bitişi belirtir); `total` alanı yok.
- Statü geçişleri kart bazında değişir — önce `/transitions`'ı oku, adı eşleştir (`Pass Dev Test → Ready For Stage`, `Reject → Test Failed`, `Test Blocked`, `Blocked`).
- Confluence: space **NA** (id `950275`), QA sayfalarının üst kartı **`NADIRGOLD RENEWAL`** (id `198279169`). API `/wiki/api/v2/pages`.
  ⚠️ Storage format'ta **`&scedil;` gibi entity'ler kabul edilmiyor** (`&amp;scedil;` olarak kaçırılır ve ekranda düz metin görünür). Türkçe karakterleri **düz UTF-8** yaz.

## QA Paneli

`npm run panel` → `http://localhost:4646` (`PANEL_PORT` ile değişir).

Sağladıkları: 3 JQL görünümü (Test kolonu / V2 Takip=New-Backend / Tümü), kart detayı + yorumlar, **verdict kaydı** (`panel-data/verdicts/<KART>.json`) ve kanıt görselleri, **Jira'ya yorum gönderme**, **V1↔V2 karşılaştırma** (canlı iframe / snapshot / API diff), whitelist'li koşum tetikleme (`panel/runs.json` — whitelist dışı komut çalışmaz), SSE canlı log, blocker çözülünce **retest alarmı**, **yeni kart alarmı** (`known-cards.json` baseline diff'i), MobAI cihaz kuyruğu.

Eksikler: cache temizleme (`/api/refresh`) ve cihaz kuyruğu görüntüleme için UI yok.

## Agent'lar (`.claude/agents/`)

| Agent | Ne zaman |
|---|---|
| `nadirgold-explorer` | "nerede tanımlı", "hangi dosyalar X kullanıyor" — salt okuma arama |
| `nadirgold-planner` | yeni test/akış/refactor planı |
| `nadirgold-pom-generator` | yeni sayfa için POM iskeleti |
| `nadirgold-v1v2-compare` | V1↔V2 sayfa karşılaştırma (bilinen açık bug listesi içeriyor) |
| `nadirgold-env-switcher` | ortam geçişi, storage state kurulumu |
| `flaky-analyzer` | kararsız test tespiti, N kez koşum |
| `nadirgold-report-builder` | HTML+PDF koşum raporu |

Agent dosyaları repo bilgisini prompt'a gömer ("Repo Durumu (Ezbere Bil)") — keşifle zaman harcamasınlar diye. Yeni bir konvansiyon eklersen ilgili agent'ı da güncelle.

## Git

Varsayılan push hedefi **`rahim/Automation-test`** (`origin` = mirackasapoglu değil). Ana branch: `feature/playwright-tests`.
