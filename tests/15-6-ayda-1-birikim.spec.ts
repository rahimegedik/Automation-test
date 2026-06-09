import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CategoryPage } from "../pages/CategoryPage";
import { ProductPage } from "../pages/ProductPage";
import { CartPage } from "../pages/CartPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

test("Düzenli Birikim Akışı - 6 Ayda 1", async ({ page }) => {
  test.setTimeout(240_000);

  const homePage = new HomePage(page);
  const categoryPage = new CategoryPage(page);
  const productPage = new ProductPage(page);
  const cartPage = new CartPage(page);
  const checkoutPage = new CheckoutPage(page);
  const ordersPage = new OrdersPage(page);
  const profilePage = new ProfilePage(page);

  await test.step("1. Ana sayfayı aç", async () => {
    await homePage.goto();
    await expect(page).toHaveURL(/nadirgold\.work/);
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Ana sayfa açıldı:", page.url());
    await cartPage.clearAll();
    await homePage.goto();
    console.log("✓ Sepet temizlendi, ana sayfaya dönüldü");
  });

  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();
    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("3. Kategori menüsünü kontrol et", async () => {
    const altinLink = homePage.categoryLink("GRAM KÜLÇE ALTIN");
    await expect(altinLink).toBeVisible({ timeout: 5000 });
    console.log("✓ Kategori menüsü görünüyor");
  });

  await test.step("4. GRAM KÜLÇE ALTIN kategorisine git", async () => {
    await page
      .getByRole("link", { name: "GRAM KÜLÇE ALTIN", exact: true })
      .click();
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Kategori sayfasına gidildi:", page.url());
  });

  await test.step("5. Ürün listesini gör", async () => {
    const acceptButton = page.getByRole("button", { name: "Kabul Et" });

    if (await acceptButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await acceptButton.click();
      console.log("✓ Kabul Et butonuna tıklandı");
    }

    await categoryPage.closeSidebarIfOpen();
    await categoryPage.waitForProducts();

    const count = await categoryPage.productCount();
    console.log(`✓ ${count} ürün listelendi`);
    expect(count).toBeGreaterThan(0);
  });

  await test.step("6. İlk ürünü sepete ekle", async () => {
    await page.getByRole("button", { name: "Sepete Ekle" }).first().click();
    console.log("✓ İlk ürün sepete eklendi");

    const popupCloseButton = page.getByRole("button", {
      name: "Popup kapat butonu",
    });

    if (
      await popupCloseButton.isVisible({ timeout: 5000 }).catch(() => false)
    ) {
      await popupCloseButton.click();
      console.log("✓ Popup kapatıldı");
    }
  });

  await test.step("7. NadirGold 1 Gr Külçe Altın ürün detayına git", async () => {
    await page
      .getByRole("link", {
        name: "NadirGold 1 Gr Külçe Altın ürünü incele",
        exact: true,
      })
      .click();
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Ürün detay sayfası açıldı:", page.url());
  });

  await test.step("8. Düzenli Birikim seç ve sepete ekle", async () => {
    await page
      .locator("div")
      .filter({ hasText: /^Düzenli Birikim$/ })
      .click();
    await page.locator("#add2CartButton").click();
    await page.waitForTimeout(1500);

    console.log("✓ Düzenli Birikim seçildi ve sepete eklendi");
  });

  await test.step("9. Sepete git", async () => {
    await cartPage.goto();
    await cartPage.waitForSidebar(8000);

    const silBtnCount = await cartPage.deleteButtonCount();
    const hasTLText = await cartPage.hasPriceText();

    console.log(
      `✓ Sepet — Ürün sayısı: ${silBtnCount}, Fiyat görünüyor: ${hasTLText}`,
    );
    expect(silBtnCount > 0 || hasTLText).toBe(true);
  });

  await test.step("10. Sepeti kontrol et", async () => {
    const silBtnCount = await cartPage.deleteButtonCount();
    const hasTLText = await cartPage.hasPriceText();

    console.log(
      `✓ Sepet — Ürün sayısı: ${silBtnCount}, Fiyat görünüyor: ${hasTLText}`,
    );
    expect(silBtnCount > 0 || hasTLText).toBe(true);
  });

  await test.step("11. Checkout sayfasına geç", async () => {
    await page.getByRole("link", { name: "Devam et" }).click();

    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Checkout sayfası açıldı:", page.url());
  });

  await test.step("12. 6 Ayda 1 düzenli birikim talimatını seç", async () => {
    await page
      .getByPlaceholder("Talimat Adı Giriniz")
      .fill(`test-6-ayda-1-${Date.now()}`);

    await page.waitForTimeout(500);

    // Slider'ı en sola resetle, sonra hedefe git (Her Ay → 2 → 3 → 4 → 6)
    // Hedef: 6 Ayda 1 = offset 4
    const sliderHandle = page.locator(".rc-slider-handle").first();
    const slider = page.locator(".rc-slider");

    // Önce en sola resetle
    for (let i = 0; i < 15; i++) {
      await sliderHandle.press("ArrowLeft");
    }
    await page.waitForTimeout(500);

    // Hedefe ulaşana kadar sağa kaydır
    for (let attempt = 0; attempt < 10; attempt++) {
      const currentText = (await slider.textContent()) ?? "";
      if (currentText.includes("6 Ayda 1")) break;
      await sliderHandle.press("ArrowRight");
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500);

    await expect(page.locator(".rc-slider")).toContainText("6 Ayda 1");

    const acceptButton = page.getByRole("button", { name: "Kabul Et" });
    if (await acceptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acceptButton.click();
    }

    console.log("✓ 6 Ayda 1 düzenli birikim seçildi");
  });

  await test.step("13. Ön bilgilendirme formunu onayla", async () => {
    await page
      .getByRole("checkbox", { name: "Ön bilgilendirme formu ," })
      .check();
    console.log("✓ Ön bilgilendirme formu onaylandı");
  });

  await test.step("14. Talimat oluştur", async () => {
    await page.getByRole("button", { name: "TALİMAT OLUŞTUR" }).click();
    console.log("✓ Talimat oluştur tıklandı");
  });

  await test.step("15. Talimatı onayla", async () => {
    await page.getByRole("button", { name: "TALİMATI ONAYLA" }).first().click();
    console.log("✓ Talimat onaylandı");
  });

  await test.step("16. 3D Secure OTP gir", async () => {
    const otpFrame = page.locator("iframe").nth(1).contentFrame();

    await otpFrame.getByRole("textbox").first().click();
    await otpFrame.getByRole("textbox").first().fill("2");
    await otpFrame.getByRole("textbox").nth(1).fill("0");
    await otpFrame.getByRole("textbox").nth(2).fill("1");
    await otpFrame.getByRole("textbox").nth(3).fill("4");
    await otpFrame.getByRole("textbox").nth(4).fill("0");
    await otpFrame.getByRole("textbox").nth(5).fill("9");

    console.log("✓ OTP girildi");
  });

  await test.step("17. Birikim Başlatıldı Doğrulaması", async () => {
    await expect(page).toHaveURL(/tebrikler\/birikim/, { timeout: 30_000 });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Birikim başarı sayfası açıldı:", page.url());
  });

  await test.step("18. Siparişlerim / Birikim Planlarım sayfasına bak", async () => {
    await ordersPage.goto();
    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    const recurringPlan = page.locator("body").textContent();
    const hasPlan = await recurringPlan
      .then(
        (text) =>
          text?.toLowerCase().includes("birikim") ||
          text?.toLowerCase().includes("recurring"),
      )
      .catch(() => false);

    console.log(
      `✓ Siparişlerim sayfası açıldı${hasPlan ? " - Birikim planı görülüyor" : ""}`,
    );
  });

  await test.step("19. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();
    await expect(page).not.toHaveURL(/hesap\/giris/);

    const inputs = await profilePage.inputCount();
    expect(inputs).toBeGreaterThan(0);

    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});
