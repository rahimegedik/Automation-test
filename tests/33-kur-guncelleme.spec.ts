import { test, expect, Page } from "@playwright/test";
import { HomePage } from "../pages/HomePage";

// =============================================================================
// 33-kur-guncelleme.spec.ts — KUR GÜNCELLEME sayacı & fiyat güncelleme kontrolü
// -----------------------------------------------------------------------------
// Sağ üstteki "KUR GÜNCELLEME: MM:SS" sayacı ~4 dakikada bir sıfırlanıyor.
// Sayaç sıfırlandığında ürün fiyatlarının (tek çekim + havale) güncellenip
// güncellenmediğini izler. Toplam ~17 dk boyunca birden fazla döngü yakalar.
//
// Pass kriteri (kullanıcı kararı): en az BİR sıfırlama gözlenmeli (kur
// mekanizmasının çalıştığının kanıtı). Fiyat değişimi LOGLANIR ama fail etmez
// (kur gece/hafta sonu sabit kalabileceği için flaky olmasın).
// =============================================================================

// İzlenecek ürün — sayaç header'da global; ürün fiyatları bu sayfadan okunur.
const PRODUCT_URL = "/resat-5lik-altin-darphane-basimi-kulplu";

// Kaç sıfırlama yakalanınca yeterli sayılsın (4 dk döngü → 17 dk'da ~3-4 olur).
const TARGET_RESETS = 3;

// Aktif izleme penceresi (test timeout 17 dk; buffer için 16 dk).
const MAX_MONITOR_MS = 16 * 60 * 1000;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// "Tek çekim fiyatı 225.048,98 TL" → "225.048,98"
function parseTL(text: string): string | null {
  const m = text.match(/([\d.]+,\d{2})\s*TL/);
  return m ? m[1] : null;
}

async function readTimerSeconds(page: Page): Promise<number | null> {
  const txt = await page
    .getByText(/KUR GÜNCELLEME/i)
    .first()
    .innerText()
    .catch(() => "");
  const m = txt.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

async function readPrices(
  page: Page,
): Promise<{ tek: string | null; havale: string | null }> {
  const tekBlock = await page
    .getByText(/Tek çekim fiyatı/i)
    .first()
    .evaluate((el) => (el.parentElement?.innerText ?? el.textContent) || "")
    .catch(() => "");
  const havBlock = await page
    .getByText(/Havale fiyatı/i)
    .first()
    .evaluate((el) => (el.parentElement?.innerText ?? el.textContent) || "")
    .catch(() => "");
  return { tek: parseTL(tekBlock), havale: parseTL(havBlock) };
}

test("KUR GÜNCELLEME sayacı sıfırlanınca fiyat güncelleniyor mu", async ({
  page,
}) => {
  // 17 dk toplam test süresi.
  test.setTimeout(17 * 60 * 1000);

  const homePage = new HomePage(page);

  await test.step("1. Ürün sayfasını aç", async () => {
    await page.goto(PRODUCT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);
    await homePage.closePopupIfVisible().catch(() => {});
    console.log("✓ Ürün sayfası açıldı:", page.url());
  });

  await test.step("2. Sayaç ve başlangıç fiyatlarını oku", async () => {
    const timer = page.getByText(/KUR GÜNCELLEME/i).first();
    await expect(timer, "KUR GÜNCELLEME sayacı görünmüyor").toBeVisible({
      timeout: 15_000,
    });
    const sec = await readTimerSeconds(page);
    const prices = await readPrices(page);
    console.log(
      `▶ Başlangıç — Sayaç: ${sec != null ? fmt(sec) : "?"} | Tek çekim: ${prices.tek} | Havale: ${prices.havale}`,
    );
    expect(sec, "Sayaç MM:SS okunamadı").not.toBeNull();
    expect(prices.tek, "Tek çekim fiyatı okunamadı").toBeTruthy();
    expect(prices.havale, "Havale fiyatı okunamadı").toBeTruthy();
  });

  await test.step("3. Sayaç sıfırlamalarını izle ve fiyat güncellemesini kontrol et", async () => {
    const start = Date.now();
    let prevSec = await readTimerSeconds(page);
    let prevPrices = await readPrices(page);
    let resetCount = 0;
    let changedCount = 0;

    while (Date.now() - start < MAX_MONITOR_MS && resetCount < TARGET_RESETS) {
      await page.waitForTimeout(3000);
      const curSec = await readTimerSeconds(page);
      if (curSec == null || prevSec == null) {
        prevSec = curSec;
        continue;
      }

      // Sıfırlama = sayaç belirgin şekilde yukarı sıçradı (örn. 00:02 → 03:5x).
      const isReset = curSec > prevSec + 20;
      if (isReset) {
        resetCount++;
        // Fiyatların yeniden render olması için kısa bekle.
        await page.waitForTimeout(5000);
        const newPrices = await readPrices(page);
        const tekChanged = newPrices.tek !== prevPrices.tek;
        const havChanged = newPrices.havale !== prevPrices.havale;
        if (tekChanged || havChanged) changedCount++;

        console.log(
          `🔄 Sıfırlama #${resetCount} (sayaç ${fmt(prevSec)} → ${fmt(curSec)}) | t+${Math.round(
            (Date.now() - start) / 1000,
          )}s`,
        );
        console.log(
          `   Tek çekim: ${prevPrices.tek} → ${newPrices.tek} ${tekChanged ? "✓ DEĞİŞTİ" : "= aynı"}`,
        );
        console.log(
          `   Havale:    ${prevPrices.havale} → ${newPrices.havale} ${havChanged ? "✓ DEĞİŞTİ" : "= aynı"}`,
        );

        // Sıfırlama sonrası fiyatlar hâlâ geçerli (boş/null olmamalı).
        expect(newPrices.tek, "Sıfırlama sonrası tek çekim fiyatı kayboldu").toBeTruthy();
        expect(newPrices.havale, "Sıfırlama sonrası havale fiyatı kayboldu").toBeTruthy();

        prevPrices = newPrices;
        prevSec = await readTimerSeconds(page);
        continue;
      }

      prevSec = curSec;
    }

    console.log(
      `\n📊 Özet: ${resetCount} sıfırlama gözlendi | fiyat değişen döngü: ${changedCount}/${resetCount}`,
    );

    // Hard assert: kur güncelleme mekanizması en az bir kez çalışmış olmalı.
    expect(
      resetCount,
      `${Math.round(MAX_MONITOR_MS / 60000)} dk içinde hiç sayaç sıfırlaması gözlenmedi`,
    ).toBeGreaterThan(0);
  });
});
