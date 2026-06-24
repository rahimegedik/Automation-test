import { test, expect, Page } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";

test("TC-CARTP-005/006/007/009 - Külçe altın hızlı sepette adet artırma, azaltma ve ürün silme", async ({
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
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Ana sayfa açıldı ve sepet temizlendi:", page.url());
  });

  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();

    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("3. GRAM KÜLÇE ALTIN kategorisine git", async () => {
    const gramKulceAltinLink = page.getByRole("link", {
      name: "GRAM KÜLÇE ALTIN",
      exact: true,
    });

    await expect(gramKulceAltinLink).toBeVisible({ timeout: 15_000 });

    const href = await gramKulceAltinLink.getAttribute("href");

    if (!href) {
      throw new Error("GRAM KÜLÇE ALTIN linkinin href değeri bulunamadı.");
    }

    const targetUrl = new URL(href, page.url()).toString();

    console.log("GRAM KÜLÇE ALTIN target URL:", targetUrl);

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    });

    const popupCloseButton = page.getByRole("button", {
      name: "Popup kapat butonu",
    });

    if (await popupCloseButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await popupCloseButton.click();
    }

    expect(page.url()).not.toBe("https://www.nadirgold.work/");

    console.log("✓ GRAM KÜLÇE ALTIN sayfası açıldı:", page.url());
  });

  await test.step("4. İlk külçe altın ürününü seç", async () => {
    const sepeteEkleButton = page
      .getByRole("button", { name: "Sepete Ekle" })
      .first();

    await expect(sepeteEkleButton).toBeVisible({ timeout: 20_000 });
    await expect(sepeteEkleButton).toBeEnabled();

    await sepeteEkleButton.scrollIntoViewIfNeeded();
    await sepeteEkleButton.click();

    await page.waitForTimeout(1500);

    console.log("✓ İlk külçe altın ürünü seçildi");
  });

  await test.step("5. Ürünü sepete ekle ve hızlı sepet kulakçığını bekle", async () => {
    const addToCartButton = page.locator("#add2CartButton");

    await expect(addToCartButton).toBeVisible({ timeout: 20_000 });
    await expect(addToCartButton).toBeEnabled({ timeout: 20_000 });

    await addToCartButton.scrollIntoViewIfNeeded();
    await addToCartButton.click();

    await waitForQuickCart(page);

    console.log("✓ Ürün sepete eklendi ve hızlı sepet kulakçığı açıldı");
  });

  await test.step("6. Hızlı sepette ürün olduğunu kontrol et", async () => {
    const deleteButton = page.getByRole("button", { name: "Sil" }).first();

    await expect(deleteButton).toBeVisible({ timeout: 20_000 });

    const hasPrice = await page.evaluate(() =>
      /\d[\d.,]*\s*TL/i.test(document.body.textContent || ""),
    );

    expect(hasPrice).toBe(true);

    console.log("✓ Hızlı sepette ürün ve fiyat bilgisi görünüyor");
  });

  await test.step("7. TC-CARTP-005 - Hızlı sepette adet artır", async () => {
    const increaseButton = page
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(2);

    await expect(increaseButton).toBeVisible({ timeout: 15_000 });
    await expect(increaseButton).toBeEnabled();

    await increaseButton.scrollIntoViewIfNeeded();
    await increaseButton.click();

    await page.waitForTimeout(1000);

    console.log("✓ Hızlı sepette adet artırıldı");
  });

  await test.step("8. TC-CARTP-006 - Hızlı sepette adet azalt", async () => {
    const decreaseButton = page
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(1);

    await expect(decreaseButton).toBeVisible({ timeout: 15_000 });
    await expect(decreaseButton).toBeEnabled();

    await decreaseButton.scrollIntoViewIfNeeded();
    await decreaseButton.click();

    await page.waitForTimeout(1000);

    console.log("✓ Hızlı sepette adet azaltıldı");
  });

  await test.step("9. TC-CARTP-009 - Hızlı sepetten ürünü sil", async () => {
    const deleteButton = page.getByRole("button", { name: "Sil" }).first();

    await expect(deleteButton).toBeVisible({ timeout: 15_000 });
    await expect(deleteButton).toBeEnabled();

    await deleteButton.scrollIntoViewIfNeeded();
    await deleteButton.click();

    const confirmButton = page
      .getByRole("button")
      .filter({ hasText: /Evet|Onayla|Tamam|Sil/i })
      .last();

    if (await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmButton.click();
      console.log("✓ Silme onaylandı");
    }

    console.log("✓ Hızlı sepette Sil butonuna tıklandı");
  });

  await test.step("10. Hızlı sepetin boşaldığını kontrol et", async () => {
    const emptyMessage = page.getByText(
      /Sepetiniz boş|Sepet boş|0 ürün|Ürün bulunmamaktadır|Sepetinizde ürün bulunmamaktadır/i,
    );

    const deleteButton = page.getByRole("button", { name: "Sil" }).first();

    await expect
      .poll(
        async () => {
          const emptyVisible = await emptyMessage
            .isVisible({ timeout: 1000 })
            .catch(() => false);

          const deleteVisible = await deleteButton
            .isVisible({ timeout: 1000 })
            .catch(() => false);

          return emptyVisible || !deleteVisible;
        },
        {
          timeout: 20_000,
        },
      )
      .toBe(true);

    console.log("✓ Ürün hızlı sepetten silindi");
  });
});

async function waitForQuickCart(page: Page) {
  const quickCartCloseButton = page.getByRole("button", {
    name: "Hızlı Sepeti Kapat",
  });

  const deleteButton = page.getByRole("button", { name: "Sil" }).first();

  const cartDrawerText = page.getByText(/Sepetim|Sepet Özeti|Sepete Git/i);

  await expect
    .poll(
      async () => {
        const closeVisible = await quickCartCloseButton
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        const deleteVisible = await deleteButton
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        const drawerTextVisible = await cartDrawerText
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        return closeVisible || deleteVisible || drawerTextVisible;
      },
      {
        timeout: 20_000,
      },
    )
    .toBe(true);

  await page.waitForTimeout(1500);
}