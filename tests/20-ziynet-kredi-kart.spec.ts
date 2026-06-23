import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CategoryPage } from "../pages/CategoryPage";
import { ProductPage } from "../pages/ProductPage";
import { CartPage } from "../pages/CartPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

// =============================================================================
// 19-ziynet-credit-card-journey.spec.ts
//
// Ziynet kategorisinden baştan sona kredi kartı ile ödeme:
//   1. Ana sayfa aç            9. Checkout sayfasına geç
//   2. Popup kapat            10. Kredi Kartı seç
//   3. Kategori menüsünü gör  11. Kayıtlı kartı seç
//   4. Ziynet kategorisine git 12. Sözleşmeyi onayla
//   5. Ürün listesini gör     13. Ödeme Yap
//   6. Ürün detayına gir      14. 3D Secure OTP
//   7. Sepete ekle            15. Siparişlerim
//   8. Sepeti kontrol et      16. Profil
// =============================================================================

const OTP = "201409";

test("Kullanıcı yolculuğu - Ziynet Kredi Kartı Baştan Sona", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const homePage = new HomePage(page);
  const categoryPage = new CategoryPage(page);
  const productPage = new ProductPage(page);
  const cartPage = new CartPage(page);
  const checkoutPage = new CheckoutPage(page);
  const ordersPage = new OrdersPage(page);
  const profilePage = new ProfilePage(page);

  // ─── ADIM 1: Ana Sayfa ──────────────────────────────────────────────────────
  await test.step("1. Ana sayfayı aç", async () => {
    await homePage.goto();
    await expect(page).toHaveURL(/nadirgold\.work/);
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Ana sayfa açıldı:", page.url());
    await cartPage.clearAll();
    await homePage.goto();
    console.log("✓ Sepet temizlendi, ana sayfaya dönüldü");
  });

  // ─── ADIM 2: Popup Kapat ────────────────────────────────────────────────────
  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();
    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  // ─── ADIM 3: Kategori Menüsünü Gör ──────────────────────────────────────────
  await test.step("3. Kategori menüsünü kontrol et", async () => {
    const ziynetLink = homePage.categoryLink("ZİYNET ALTIN");
    await expect(ziynetLink).toBeVisible({ timeout: 5000 });
    console.log("✓ Kategori menüsü görünüyor");
  });

  // ─── ADIM 4: Ziynet Kategorisine Git ────────────────────────────────────────
  await test.step("4. ZİYNET ALTIN kategorisine git", async () => {
    await categoryPage.goto("ziynet");
    expect(page.url()).toContain("ziynet");
    console.log("✓ Ziynet kategori sayfasına gidildi:", page.url());
  });

  // ─── ADIM 5: Ürün Listesini Gör ─────────────────────────────────────────────
  await test.step("5. Ürün listesini gör", async () => {
    await categoryPage.closeSidebarIfOpen();
    await categoryPage.waitForProducts();
    const count = await categoryPage.productCount();
    console.log(`✓ ${count} ürün listelendi`);
    expect(count).toBeGreaterThan(0);
  });

  // ─── ADIM 6: Ürün Detayına Gir ──────────────────────────────────────────────
  let productUrl = "";
  await test.step("6. İlk ürünün detayına git", async () => {
    productUrl = await categoryPage.getFirstProductUrl();
    await productPage.goto(productUrl);
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Ürün detay sayfası açıldı:", page.url());
  });

  // ─── ADIM 7: Sepete Ekle ────────────────────────────────────────────────────
  await test.step("7. Ürünü sepete ekle", async () => {
    await productPage.addToCart();
    console.log("✓ Sepete ekle butonuna tıklandı");
    const closed = await productPage.closeSidebarIfOpen();
    if (closed) console.log("✓ Sepet sidebar kapatıldı");
  });

  // ─── ADIM 8: Sepeti Kontrol Et ──────────────────────────────────────────────
  await test.step("8. Sepete git ve ürünü kontrol et", async () => {
    await cartPage.goto();
    await cartPage.waitForSidebar(8000);
    const silBtnCount = await cartPage.deleteButtonCount();
    const hasTLText = await cartPage.hasPriceText();
    console.log(
      `✓ Sepet — Ürün sayısı: ${silBtnCount}, Fiyat görünüyor: ${hasTLText}`,
    );
    expect(silBtnCount > 0 || hasTLText).toBe(true);
  });

  // ─── ADIM 9: Checkout Sayfası ────────────────────────────────────────────────
  await test.step("9. Checkout sayfasına geç", async () => {
    await checkoutPage.goto();
    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Checkout sayfası açıldı:", page.url());
  });

  // ─── ADIM 10: Kredi Kartı Seç ────────────────────────────────────────────────
  await test.step("10. Banka / Kredi Kartı İle Ödeme seç", async () => {
    await checkoutPage.selectCreditCard();
    console.log("✓ Kredi Kartı sekmesi seçildi");
  });

  // ─── ADIM 11: Kayıtlı Kartı Seç ──────────────────────────────────────────────
  await test.step("11. Kayıtlı kartı seç", async () => {
    await checkoutPage.selectSavedCard();
    console.log("✓ Kayıtlı kart seçildi");
  });

  // ─── ADIM 12: Sözleşmeyi Onayla ──────────────────────────────────────────────
  await test.step("12. Sözleşmeyi onayla", async () => {
    await checkoutPage.acceptAgreement();
    const isChecked = await checkoutPage.isAgreementChecked();
    console.log(`✓ Sözleşme onaylandı (checked: ${isChecked})`);
    expect(isChecked).toBe(true);
  });

  // ─── ADIM 13: Ödeme Yap ───────────────────────────────────────────────────────
  await test.step("13. Ödeme Yap butonuna tıkla", async () => {
    await checkoutPage.pay();
    console.log("✓ Ödeme Yap tıklandı, URL:", page.url());
    await expect(page.locator("body")).toBeVisible();
  });

  // ─── ADIM 14: 3D Secure OTP ───────────────────────────────────────────────────
  await test.step("14. 3D Secure OTP gir", async () => {
    await checkoutPage.enterOtp(OTP);
    console.log("✓ OTP girildi, URL:", page.url());
    await expect(page.locator("body")).toBeVisible();
  });

  // ─── ADIM 15: Siparişlerim ────────────────────────────────────────────────────
  await test.step("15. Siparişlerim sayfasına bak", async () => {
    await ordersPage.goto();
    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();
    console.log("✓ Siparişlerim sayfası açıldı");
  });

  // ─── ADIM 16: Profil ──────────────────────────────────────────────────────────
  await test.step("16. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();
    await expect(page).not.toHaveURL(/hesap\/giris/);
    const inputs = await profilePage.inputCount();
    expect(inputs).toBeGreaterThan(0);
    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});
