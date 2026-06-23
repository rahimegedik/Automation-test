
import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CategoryPage } from "../pages/CategoryPage";
import { ProductPage } from "../pages/ProductPage";
import { CartPage } from "../pages/CartPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

// =============================================================================
// 10-credit-card-journey.spec.ts
//
// 09 ile aynı yolculuk — ödeme yöntemi farkı:
// Banka Transfer yerine Kayıtlı Kredi Kartı + 3D Secure OTP
// =============================================================================

const OTP = "201409";

test("Kullanıcı yolculuğu - Kredi Kartı ile Ödeme", async ({ page }) => {
  test.setTimeout(300_000);

  const homePage = new HomePage(page);
  const categoryPage = new CategoryPage(page);
  const productPage = new ProductPage(page);
  const cartPage = new CartPage(page);
  const checkoutPage = new CheckoutPage(page);
  const ordersPage = new OrdersPage(page);
  const profilePage = new ProfilePage(page);

  await test.step("1. Ana sayfayı aç ve sepeti temizle", async () => {
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

    await expect(altinLink).toBeVisible({ timeout: 15_000 });

    console.log("✓ Kategori menüsü görünüyor");
  });

  await test.step("4. GRAM KÜLÇE ALTIN kategorisine git", async () => {
    await categoryPage.goto("kulce-altin");

    expect(page.url()).toContain("kulce-altin");

    console.log("✓ Kategori sayfasına gidildi:", page.url());
  });

  await test.step("5. Ürün listesini gör", async () => {
    await categoryPage.closeSidebarIfOpen();
    await categoryPage.waitForProducts();

    const count = await categoryPage.productCount();

    console.log(`✓ ${count} ürün listelendi`);

    expect(count).toBeGreaterThan(0);
  });

  let productUrl = "";

  await test.step("6. İlk ürünün detayına git", async () => {
    productUrl = await categoryPage.getFirstProductUrl();

    await productPage.goto(productUrl);

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Ürün detay sayfası açıldı:", page.url());
  });

  await test.step("7. Ürünü sepete ekle", async () => {
    await productPage.addToCart();

    console.log("✓ Sepete ekle butonuna tıklandı");

    const closed = await productPage.closeSidebarIfOpen();

    if (closed) {
      console.log("✓ Sepet sidebar kapatıldı");
    }
  });

  await test.step("8. Sepete git ve ürünü kontrol et", async () => {
    await cartPage.goto();

    const silBtnCount = await cartPage.deleteButtonCount();
    const hasTLText = await cartPage.hasPriceText();

    console.log(
      `✓ Sepet — Ürün sayısı: ${silBtnCount}, Fiyat görünüyor: ${hasTLText}`,
    );

    expect(silBtnCount > 0 || hasTLText).toBe(true);
  });

  await test.step("9. Checkout sayfasına geç", async () => {
    await checkoutPage.goto();

    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Checkout sayfası açıldı:", page.url());
  });

  await test.step("10. Banka / Kredi Kartı ile ödeme seç", async () => {
    const creditCardPaymentButton = page.getByRole("button", {
      name: "Banka / Kredi Kartı İle Ödeme",
    });

    await expect(creditCardPaymentButton).toBeVisible({ timeout: 15_000 });
    await expect(creditCardPaymentButton).toBeEnabled();

    await creditCardPaymentButton.scrollIntoViewIfNeeded();
    await creditCardPaymentButton.click();

    await page.waitForTimeout(1500);

    console.log("✓ Banka / Kredi Kartı ile ödeme seçildi");
  });

  await test.step("11. Kayıtlı kredi kartını seç", async () => {
    await page.waitForLoadState("domcontentloaded").catch(() => { });
    await page.waitForTimeout(1500);

    // Sadece kredi kartı alanındaki kart satırlarını yakala.
    // Motokurye / teslimat seçeneklerini yakalamamak için kart metni filtreleniyor.
    const savedCardRows = page
      .locator(".cursor-pointer.flex.items-center.gap-3")
      .filter({
        hasText: /\*{2,}|SKT|Son Kullanma|Kart|Bankanız|\/\d{2}/i,
      });

    const cardCount = await savedCardRows.count();

    console.log(`ℹ Kayıtlı kredi kartı satırı sayısı: ${cardCount}`);

    if (cardCount === 0) {
      throw new Error("Kayıtlı kredi kartı satırı bulunamadı. Locator kart alanını yakalayamadı.");
    }

    // İki kart varsa ilk kartı seçer.
    // İkinci kartı seçmek istersen .first() yerine .nth(1) yap.
    const savedCardRow = savedCardRows.first();

    await expect(savedCardRow).toBeVisible({ timeout: 15_000 });

    await savedCardRow.scrollIntoViewIfNeeded();
    await savedCardRow.click({ force: true });

    await page.waitForTimeout(1500);

    console.log("✓ Kayıtlı kredi kartı seçildi");
  });

  await test.step("12. Ön bilgilendirme formunu onayla", async () => {
    const agreementCheckbox = page
      .locator("label")
      .filter({ hasText: "Ön bilgilendirme formu" })
      .locator(".flex-shrink-0")
      .first();

    await expect(agreementCheckbox).toBeVisible({ timeout: 15_000 });

    await agreementCheckbox.scrollIntoViewIfNeeded();
    await agreementCheckbox.click({ force: true });

    await page.waitForTimeout(1500);

    console.log("✓ Ön bilgilendirme formu onaylandı");
  });

  await test.step("13. Ödeme Yap butonuna tıkla", async () => {
    const paymentButton = page.getByRole("button", {
      name: "ÖDEME YAP",
    });

    await expect(paymentButton).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(
        async () => await paymentButton.isEnabled().catch(() => false),
        {
          timeout: 30_000,
        },
      )
      .toBe(true);

    await paymentButton.scrollIntoViewIfNeeded();
    await paymentButton.click();

    await expect(page.locator("iframe").nth(1)).toBeVisible({
      timeout: 30_000,
    });

    console.log("✓ ÖDEME YAP tıklandı");
  });

  await test.step("14. 3D Secure OTP gir", async () => {
    const otpFrame = page.locator("iframe").nth(1).contentFrame();

    await otpFrame
      .getByRole("textbox")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    await otpFrame.getByRole("textbox").first().click();
    await otpFrame.getByRole("textbox").first().fill(OTP[0]);
    await otpFrame.getByRole("textbox").nth(1).fill(OTP[1]);
    await otpFrame.getByRole("textbox").nth(2).fill(OTP[2]);
    await otpFrame.getByRole("textbox").nth(3).fill(OTP[3]);
    await otpFrame.getByRole("textbox").nth(4).fill(OTP[4]);
    await otpFrame.getByRole("textbox").nth(5).fill(OTP[5]);

    await page.waitForTimeout(5000);

    console.log("✓ OTP girildi");
  });

  await test.step("15. Tebrikler sayfasını doğrula", async () => {
    await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Tebrikler sayfası açıldı:", page.url());
  });

  await test.step("16. Siparişlerim sayfasına bak", async () => {
    await ordersPage.goto();

    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Siparişlerim sayfası açıldı");
  });

  await test.step("17. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();

    await expect(page).not.toHaveURL(/hesap\/giris/);

    const inputs = await profilePage.inputCount();

    expect(inputs).toBeGreaterThan(0);

    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});

