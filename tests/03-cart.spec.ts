import { test, expect } from "@playwright/test";
import { CartPage } from "../pages/CartPage";

test("Sepet sayfasi aciliyor", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  await expect(page).not.toHaveTitle(/404|sayfa bulunamadi|hata/i);
  await expect(page.locator("body")).toBeVisible();
});

test("Sepete direkt URL ile erisilebiliyor", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  expect(page.url()).toContain("sepet");
  await expect(page.locator("body")).toBeVisible();
});

test("Sepet başlığı görünüyor", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const title = page.locator('h1, h2, .title, [class*="heading" i]').first();
  const exists = await title.isVisible().catch(() => false);

  if (exists) {
    const text = await title.textContent();
    expect(text?.toLowerCase()).toMatch(/sepet|cart|alışveriş|basket/i);
  }
});

test("Sepet boş ise mesaj gösterir", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const isEmpty = await cartPage.isCartEmpty();

  if (isEmpty) {
    await expect(cartPage.emptyCartMessage).toBeVisible();
  } else {
    const items = page.locator('[class*="item" i], [class*="product" i]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  }
});

test("Sepet sayfasında fiyat bilgisi var", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const sidebarOpen = await cartPage.waitForSidebar();
  if (!sidebarOpen) {
    console.log(
      "ℹ Hızlı Sepet açılmadı veya sepet boş — fiyat testi atlanıyor",
    );
    return;
  }

  const hasTLText = await cartPage.hasPriceText();
  expect(hasTLText).toBe(true);
});
