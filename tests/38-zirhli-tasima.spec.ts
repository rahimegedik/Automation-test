import { test, expect } from "@playwright/test";
import { ProductPage } from "../pages/ProductPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import {
  BasketStateWatcher,
  ensureApiMode,
  startWithEmptyBasket,
  payWithBankTransfer,
} from "../pages/CheckoutFlow";

/**
 * Standart zırhlı taşıma — yüksek tutarlı sepet (highValueOrderThreshold) havale ile.
 * Eşik stage'de basketLimit (185.000 TL) civarı; 50 Gr külçe (~318K) eşiği aşar.
 * Tek #checkout-agreement kutusu hem sözleşmeyi hem bigMoneyAgreement'ı işaretler.
 * ⚠️ Gerçek sipariş açar; havale ödenmezse ~20-36 dk'da otomatik iptal olur. 1 basket/add.
 */

const GRAM = process.env.ZIRHLI_GRAM ?? "50";

test(`Zırhlı taşıma — ${GRAM} Gr külçe havale`, async ({ page }) => {
  test.setTimeout(300_000);
  const basket = new BasketStateWatcher(page);

  await test.step("1. API modu + boş sepet", async () => {
    await ensureApiMode(page);
    await startWithEmptyBasket(page);
  });

  await test.step(`2. ${GRAM} Gr külçeyi sepete ekle`, async () => {
    if (process.env.ZIRHLI_PATH) {
      // Çipler 100 Gr'da bitiyor; 250 gr+ ayrı ürün (ör. /nadirgold-250-gr-kulce-altin).
      await page.goto(process.env.ZIRHLI_PATH, { waitUntil: "domcontentloaded" });
    } else {
      await page.goto("/1-gram-altin-kulce-altin", { waitUntil: "domcontentloaded" });
      // Stage'de gramaj çipleri mutlak prod linki (www.nadirgold.com/...) veriyor (V1=V2, 23.11) →
      // tıklamak yerine path'i alıp stage host'unda aç.
      const href = await page.getByRole("link", { name: new RegExp(`^${GRAM} Gr$`) }).first().getAttribute("href", { timeout: 15_000 });
      await page.goto(new URL(href!, page.url()).pathname, { waitUntil: "domcontentloaded" });
    }
    console.log("ℹ PDP:", page.url());
    await new ProductPage(page).addToCart();
    await expect.poll(() => basket.last?.grandTotal ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    console.log(`✓ Sepet: toplam=${basket.last?.grandTotal} highValue=${basket.last?.highValue} alias=${basket.last?.alias} text=${basket.last?.text}`);
  });

  await test.step("3. Yüksek tutar → zırhlı taşıma işaretleri", async () => {
    expect(basket.last?.highValue, "highValueOrderThreshold").toBe(true);
    await new CheckoutPage(page).goto();
    await new CheckoutPage(page).ensureAddressSelected();
    // V1 metni "Ücretsiz Zırhlı Taşıma" (NSB-6897: V2'de "Ücretsiz" kalıyordu).
    await expect(page.getByText(/Zırhlı/i).first()).toBeVisible({ timeout: 15_000 });
    console.log(`✓ Checkout zırhlı metni görünüyor (alias=${basket.last?.alias}, text=${basket.last?.text})`);
  });

  await test.step("4. Havale ile öde", async () => {
    const id = await payWithBankTransfer(page);
    test.info().annotations.push({ type: "order", description: id });
  });
});
