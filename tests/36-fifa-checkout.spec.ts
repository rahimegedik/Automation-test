import { test, expect } from "@playwright/test";
import { triggerAdd } from "../pages/CartTypeHelpers";
import { CheckoutPage } from "../pages/CheckoutPage";
import {
  BasketStateWatcher,
  ensureApiMode,
  startWithEmptyBasket,
  payWithBankTransfer,
  payWithSavedCard,
} from "../pages/CheckoutFlow";

/**
 * FIFA World Cup 2026 ürünleri — havale ve kayıtlı kredi kartı ile sipariş.
 * ⚠️ Gerçek sipariş açar (journey grubu). Her test 1 basket/add harcar.
 * Varsayılan V2; V1 için API_MODE=v1.
 */

for (const method of ["havale", "kredi-karti"] as const) {
  test(`FIFA ${method} siparişi`, async ({ page }) => {
    test.setTimeout(240_000);
    const basket = new BasketStateWatcher(page);

    await test.step("1. API modu + boş sepet", async () => {
      await ensureApiMode(page);
      await startWithEmptyBasket(page);
    });

    await test.step("2. Stoktaki FIFA ürününü sepete ekle", async () => {
      const t = await triggerAdd(page, "fifa");
      console.log("ℹ PDP:", t.source);
      expect(t.source).toContain("fifa-world-cup-2026");
      await t.click();
      await expect
        .poll(() => basket.last?.basketType ?? null, { timeout: 15_000 })
        .not.toBeNull();
      console.log(`✓ Sepet: tür=${basket.last?.basketType} kargo=${basket.last?.alias} toplam=${basket.last?.grandTotal}`);
    });

    await test.step("3. Checkout + adres", async () => {
      const co = new CheckoutPage(page);
      await co.goto();
      await co.ensureAddressSelected();
    });

    await test.step(`4. ${method} ile öde`, async () => {
      const id =
        method === "havale"
          ? await payWithBankTransfer(page)
          : await payWithSavedCard(page);
      test.info().annotations.push({ type: "order", description: id });
    });
  });
}
