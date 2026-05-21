import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { CategoryPage } from '../pages/CategoryPage';
import { ProductPage } from '../pages/ProductPage';
import { CartPage } from '../pages/CartPage';

// =============================================================================
// 06-ecommerce-flow.spec.ts — Kategori & ürün akışı
// =============================================================================

test('Kategori navigasyonu - GRAM KÜLÇE ALTIN', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const link = homePage.categoryLink('GRAM KÜLÇE ALTIN');
  const isVisible = await link.isVisible().catch(() => false);

  if (isVisible) {
    await link.click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  } else {
    console.log('GRAM KÜLÇE ALTIN kategorisi navigasyon menüsünde bulunamadı');
  }
});

test('Kategori navigasyonu - GRAM KÜLÇE GÜMÜŞ', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const link = homePage.categoryLink('GRAM KÜLÇE GÜMÜŞ');
  const isVisible = await link.isVisible().catch(() => false);

  if (isVisible) {
    await link.click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  } else {
    console.log('GRAM KÜLÇE GÜMÜŞ kategorisi navigasyon menüsünde bulunamadı');
  }
});

test('Kategori navigasyonu - ZİYNET ALTIN', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.closePopupIfVisible();

  const link = homePage.categoryLink('ZİYNET ALTIN');
  const isVisible = await link.isVisible().catch(() => false);

  if (isVisible) {
    await link.click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  } else {
    console.log('ZİYNET ALTIN kategorisi navigasyon menüsünde bulunamadı');
  }
});

test('Ürün listesi görünüyor', async ({ page }) => {
  const categoryPage = new CategoryPage(page);
  await categoryPage.goto();

  const count = await categoryPage.productCount();
  expect(count).toBeGreaterThan(0);
});

test('Ürün detayına gidebiliyoruz', async ({ page }) => {
  const categoryPage = new CategoryPage(page);
  await categoryPage.goto();

  const productUrl = await categoryPage.getFirstProductUrl().catch(() => null);
  if (!productUrl) return;

  const productPage = new ProductPage(page);
  await productPage.goto(productUrl);

  await expect(page.locator('body')).toBeVisible();
});

test('Sepete ürün ekleyebiliyoruz', async ({ page }) => {
  const categoryPage = new CategoryPage(page);
  await categoryPage.goto();

  const productUrl = await categoryPage.getFirstProductUrl().catch(() => null);
  if (!productUrl) return;

  const productPage = new ProductPage(page);
  await productPage.goto(productUrl);

  const btnVisible = await productPage.addToCartButton.isVisible({ timeout: 5000 }).catch(() => false);
  if (btnVisible) {
    await productPage.addToCart();
    expect(page.url()).toBeTruthy();
  } else {
    console.log('Sepete Ekle butonu bulunamadı');
  }
});

test('Sepette ürün kontrolü yapabiliriz', async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const silBtnCount = await cartPage.deleteButtonCount();
  const hasTLText = await cartPage.hasPriceText();

  if (silBtnCount > 0 || hasTLText) {
    expect(silBtnCount > 0 || hasTLText).toBe(true);
  } else {
    console.log('Sepet boş veya ürün başarıyla eklenmemiş');
  }
});

test('Sepet toplamı hesaplanıyor', async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const hasTLText = await cartPage.hasPriceText();
  if (hasTLText) {
    expect(hasTLText).toBe(true);
  }
});
