import { test, expect, Page } from "@playwright/test";
import { CategoryPage } from "../pages/CategoryPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import {
  BasketStateWatcher,
  ensureApiMode,
  startWithEmptyBasket,
  selectFirstSavedCard,
  enter3dsOtp,
  orderIdFromUrl,
} from "../pages/CheckoutFlow";

/**
 * Düzenli Birikim — İLERİ TARİHLİ talimat (kayıtlı kart).
 * Gönderim tarihi = bugün + DAYS_AHEAD (FE en fazla +90 gün izin veriyor).
 * ⚠️ Gerçek talimat açar (journey grubu). 1 basket/add harcar.
 * Talimat adı ayırt edilebilir: QA-REG-ILERI-<ts>.
 */

const DAYS_AHEAD = Number(process.env.BIRIKIM_DAYS_AHEAD ?? 7);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** day/month/year alanlarını (native select ya da özel dropdown) ayarlar. */
async function setPart(page: Page, name: string, value: string) {
  const sel = page.locator(`select[name="${name}"]`);
  if ((await sel.count()) > 0) {
    await sel.first().selectOption(value);
    return;
  }
  const trigger = page.locator(`[name="${name}"]`).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page
    .getByRole("option", { name: new RegExp(`^${value}$`) })
    .first()
    .click();
}

test("Düzenli Birikim — ileri tarihli talimat", async ({ page }) => {
  test.setTimeout(300_000);
  new BasketStateWatcher(page);
  const target = new Date(Date.now() + DAYS_AHEAD * 86_400_000);
  const dd = pad(target.getDate());
  const mm = pad(target.getMonth() + 1);
  const yyyy = String(target.getFullYear());
  const name = `QA-REG-ILERI-${Date.now()}`;

  await test.step("1. API modu + boş sepet", async () => {
    await ensureApiMode(page);
    await startWithEmptyBasket(page);
  });

  await test.step("2. Stoktaki külçeyi Düzenli Birikim ile sepete ekle", async () => {
    const cat = new CategoryPage(page);
    await cat.goto("kulce-altin");
    const url = await cat.getFirstInStockProductUrl();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const add = page.locator("#add2CartButton");
    await expect(add).toBeEnabled({ timeout: 15_000 });
    await page.locator("div").filter({ hasText: /^Düzenli Birikim$/ }).first().click();
    await add.click();
    await expect(page.getByText(/Sepetim\s*\(\s*[1-9]/i).first()).toBeVisible({ timeout: 15_000 });
    console.log("✓ Birikim sepete eklendi:", url);
  });

  await test.step("3. Checkout: talimat adı + ileri gönderim tarihi", async () => {
    await new CheckoutPage(page).goto();
    await page.getByPlaceholder("Talimat Adı Giriniz").fill(name);
    await setPart(page, "year", yyyy);
    await setPart(page, "month", mm);
    await setPart(page, "day", dd);
    await expect(page.getByText("Gönderim tarihi olarak geçmiş bir tarih seçemezsiniz.")).toHaveCount(0);
    console.log(`✓ Talimat: ${name}, gönderim tarihi ${dd}/${mm}/${yyyy}`);
  });

  await test.step("4. Kayıtlı kart + sözleşme", async () => {
    await selectFirstSavedCard(page);
    await page.getByRole("checkbox", { name: /Ön bilgilendirme formu/ }).check();
  });

  await test.step("5. Talimat oluştur → özet tarihini doğrula → onayla", async () => {
    await page.getByRole("button", { name: "TALİMAT OLUŞTUR" }).click();
    // Onay özeti "Gönderim Tarihi" alanı seçilen tarihi göstermeli.
    await expect(page.getByText(`${dd} / ${mm} / ${yyyy}`).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "TALİMATI ONAYLA" }).first().click();
    // İleri tarihte tahsilat yok; kart doğrulaması için 3DS çıkabilir.
    const threeDs = page.locator("iframe").last();
    const done = await Promise.race([
      page.waitForURL(/tebrikler\/birikim/, { timeout: 30_000 }).then(() => "ok"),
      threeDs.waitFor({ state: "visible", timeout: 30_000 }).then(() => "3ds"),
    ]).catch(() => "none");
    if (done === "3ds" && !/tebrikler/.test(page.url())) {
      console.log("ℹ 3DS istendi");
      await enter3dsOtp(page);
    }
    await expect(page).toHaveURL(/tebrikler\/birikim/, { timeout: 60_000 });
    const id = orderIdFromUrl(page);
    test.info().annotations.push({ type: "talimat", description: `${id} ${name} ${dd}.${mm}.${yyyy}` });
  });
});
