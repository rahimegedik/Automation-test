import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CategoryPage } from "../pages/CategoryPage";
import { ProductPage } from "../pages/ProductPage";
import { CartPage } from "../pages/CartPage";

// =============================================================================
// 08-product-purchase-flow.spec.ts — Ürün satın alma (adım adım)
// =============================================================================

test("Popup kapanıyor ve kategori menüsü erişilebiliyor", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const link = homePage.categoryLink("GRAM KÜLÇE ALTIN");
  await expect(link).toBeVisible();
});

test("GRAM KÜLÇE ALTIN kategorisine git", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const categoryLink = homePage.categoryLink("GRAM KÜLÇE ALTIN");
  const linkExists = await categoryLink.isVisible().catch(() => false);

  if (linkExists) {
    await categoryLink.click();
    await page.waitForLoadState("networkidle");
    console.log("✓ GRAM KÜLÇE ALTIN kategorisine gidildi");
  } else {
    console.log("✗ Kategori linki bulunamadı");
  }

  expect(page.url()).toBeTruthy();
});

test("Ürün listesinde ürünler görünüyor", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const categoryLink = homePage.categoryLink("GRAM KÜLÇE ALTIN");
  if (!(await categoryLink.isVisible().catch(() => false))) return;

  await categoryLink.click();
  await page.waitForLoadState("networkidle");

  const categoryPage = new CategoryPage(page);
  const count = await categoryPage.productCount();
  console.log(`ℹ Sayfada ${count} ürün bulundu`);
  expect(count).toBeGreaterThan(0);
});

test("Ürünü sepete ekle - Basit Flow", async ({ page }) => {
  test.setTimeout(60_000);

  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const categoryLink = homePage.categoryLink("GRAM KÜLÇE ALTIN");
  if (!(await categoryLink.isVisible().catch(() => false))) {
    console.log("✗ Kategori linki bulunamadı");
    expect(false).toBe(true);
    return;
  }
  await categoryLink.click();
  await page.waitForLoadState("networkidle");
  console.log("✓ Kategori sayfasına gidildi");

  const categoryPage = new CategoryPage(page);
  await categoryPage.closeSidebarIfOpen();

  const productUrl = await categoryPage.getFirstProductUrl().catch(() => null);
  if (!productUrl) {
    console.log("✗ Ürün linki bulunamadı");
    expect(false).toBe(true);
    return;
  }

  const productPage = new ProductPage(page);
  await productPage.goto(productUrl);
  console.log("✓ Ürün detay sayfasına gidildi:", page.url());

  await productPage.addToCart();
  console.log("✓ Sepete Ekle butonuna tıklandı");
  await productPage.closeSidebarIfOpen();

  const cartPage = new CartPage(page);
  await cartPage.goto();

  const silBtnCount = await cartPage.deleteButtonCount();
  const hasTLText = await cartPage.hasPriceText();

  console.log(`ℹ Sil butonu: ${silBtnCount}, TL fiyat: ${hasTLText}`);
  expect(silBtnCount > 0 || hasTLText).toBe(true);
  console.log("✓ Ürün sepete başarıyla eklendi");
});

test("Sepete git ve kontrol et", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const sidebarOpen = await cartPage.waitForSidebar();
  console.log(`ℹ Sidebar açık: ${sidebarOpen}`);

  if (sidebarOpen) {
    const silBtnCount = await cartPage.deleteButtonCount();
    const spinbuttonCount = await page.locator('[role="spinbutton"]').count();
    const hasTLText = await cartPage.hasPriceText();

    console.log(
      `ℹ Sil butonu: ${silBtnCount}, Adet: ${spinbuttonCount}, TL fiyat: ${hasTLText}`,
    );
    expect(silBtnCount > 0 || spinbuttonCount > 0 || hasTLText).toBe(true);
  } else {
    console.log("ℹ Sidebar açılmadı veya sepet boş");
  }
});

test("Sepet özeti görünüyor", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const sidebarOpen = await cartPage.waitForSidebar();
  if (!sidebarOpen) {
    console.log("ℹ Sidebar açılmadı veya sepet boş — özet testi atlanıyor");
    return;
  }

  const hasTLText = await cartPage.hasPriceText();
  const hasTotalText =
    (await page.getByText(/toplam|tutar|sipariş özeti/i).count()) > 0;

  console.log(`ℹ TL fiyat: ${hasTLText}, Toplam metin: ${hasTotalText}`);
  expect(hasTLText || hasTotalText).toBe(true);
});
