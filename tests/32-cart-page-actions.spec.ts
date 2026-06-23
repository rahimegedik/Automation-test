import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";

test("TC-CARTP-005/006/007/009 - Takı ürün seçenekleri, adet artırma azaltma ve ürün silme", async ({
  page,
}) => {
  test.setTimeout(300_000);

  const homePage = new HomePage(page);
  const cartPage = new CartPage(page);

  await test.step("1. Ana sayfayı aç ve sepeti temizle", async () => {
    await homePage.goto();
    await expect(page).toHaveURL(/nadirgold\.work/);
    await expect(page.locator("body")).toBeVisible();

    await cartPage.clearAll();
    await homePage.goto();

    console.log("✓ Ana sayfa açıldı ve sepet temizlendi:", page.url());
  });

  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();

    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("3. TAKI YENİ sayfasına git", async () => {
    const takiYeniLink = page.getByRole("link", {
      name: "TAKI YENİ",
      exact: true,
    });

    await expect(takiYeniLink).toBeVisible({ timeout: 15_000 });
    await takiYeniLink.click();

    await page.evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    });

    const popupCloseButton = page.getByRole("button", {
      name: "Popup kapat butonu",
    });

    if (
      await popupCloseButton.isVisible({ timeout: 5000 }).catch(() => false)
    ) {
      await popupCloseButton.click();
    }

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ TAKI YENİ sayfası açıldı:", page.url());
  });

  await test.step("5. Sepete Ekle butonuna tıkla", async () => {
    const sepeteEkleButton = page.getByRole("button", {
      name: "Sepete Ekle",
    });

    await expect(sepeteEkleButton).toBeVisible({ timeout: 15_000 });
    await expect(sepeteEkleButton).toBeEnabled();

    await sepeteEkleButton.click();

    console.log("✓ Sepete Ekle butonuna tıklandı");
  });

  await test.step("6. Ürün seçeneği 6.4 seç", async () => {
    const optionButton = page.getByRole("button", { name: "6.4" });

    await expect(optionButton).toBeVisible({ timeout: 15_000 });
    await expect(optionButton).toBeEnabled();

    await optionButton.click();

    console.log("✓ 6.8 ürün seçeneği seçildi");
  });
  await test.step("7. Ürünü sepete ekle", async () => {
    const addToCartButton = page.locator("#add2CartButton");

    await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
    await expect(addToCartButton).toBeEnabled();

    await addToCartButton.click();

    await expect(page.getByRole("link", { name: "Sepete Git" })).toBeVisible({
      timeout: 15_000,
    });

    console.log("✓ Ürün sepete eklendi");
  });

  await test.step("6. 6.6 seçeneğini seç ve adet artır/azalt kontrolü yap", async () => {
  
    const increaseButton = page
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(2);

    const decreaseButton = page
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(1);

    await expect(increaseButton).toBeVisible({ timeout: 15_000 });
    await expect(decreaseButton).toBeVisible({ timeout: 15_000 });

    await increaseButton.click();
    await page.waitForTimeout(500);

    await decreaseButton.click();
    await page.waitForTimeout(500);

    console.log("✓ 6.6 için adet artırma/azaltma yapıldı");
  });

  await test.step("10. TC-CARTP-009 - Ürünü sepetten sil", async () => {
    const deleteButton = page.getByRole("button", { name: "Sil" });

    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
    await expect(deleteButton).toBeEnabled();

    await deleteButton.click();

    const confirmButton = page.getByRole("button", {
      name: /Evet|Onayla|Tamam|Sil/i,
    });

    if (await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmButton.click();
      console.log("✓ Silme onaylandı");
    }

    console.log("✓ Sil butonuna tıklandı");
  });

  await test.step("11. Sepetin boşaldığını kontrol et", async () => {
    await expect(
      page.getByText(/Sepetiniz boş|Sepet boş|0 ürün|Ürün bulunmamaktadır/i),
    ).toBeVisible({ timeout: 20_000 });

    console.log("✓ Ürün sepetten silindi ve sepet boş görünüyor");
  });
});