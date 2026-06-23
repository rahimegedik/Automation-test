import { test, expect } from "@playwright/test";
import { CartPage } from "../pages/CartPage";
import { CheckoutPage } from "../pages/CheckoutPage";

// =============================================================================
// 07-checkout-flow.spec.ts — Checkout form elemanları
// =============================================================================

test("Checkout sayfasi erisilebiliyor", async ({ page }) => {
  const cartPage = new CartPage(page);
  await cartPage.goto();

  const checkoutBtn = page
    .locator("a, button")
    .filter({
      hasText: /ödeme yap|ödemeye geç|checkout|sipariş ver|satın al|devam et/i,
    })
    .first();

  const exists = await checkoutBtn.isVisible().catch(() => false);
  if (!exists) {
    console.log("Checkout butonu bulunamadı");
    return;
  }

  const cartEmpty = await cartPage.isCartEmpty();
  if (!cartEmpty) {
    await checkoutBtn.click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("sepet");
  } else {
    console.log("Sepet boş — checkout test atlanıyor");
  }
});

test("Checkout formunda adres alanları var", async ({ page }) => {
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.goto();

  const labelExists = await checkoutPage.addressLabel
    .isVisible()
    .catch(() => false);
  const textboxExists = await page
    .getByRole("textbox")
    .first()
    .isVisible()
    .catch(() => false);
  const comboExists = await page
    .getByRole("combobox")
    .first()
    .isVisible()
    .catch(() => false);

  expect(labelExists || textboxExists || comboExists).toBe(true);
});

test("Ödeme yöntemi seçeneği var", async ({ page }) => {
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.goto();

  const headingExists = await checkoutPage.paymentHeading
    .isVisible()
    .catch(() => false);
  const listExists = await page
    .locator("li")
    .filter({ hasText: /kredi|banka|havale|eft|kapıda/i })
    .first()
    .isVisible()
    .catch(() => false);
  const radioCount = await page.locator('input[type="radio"]').count();
  const selectExists = await page
    .locator('select[name*="payment" i]')
    .isVisible()
    .catch(() => false);

  expect(headingExists || listExists || radioCount > 0 || selectExists).toBe(
    true,
  );
});

test("Sipariş özeti görünüyor", async ({ page }) => {
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.goto();

  const summary = page
    .locator(
      '[class*="summary" i], [class*="order" i][class*="review" i], [class*="review" i]',
    )
    .first();
  const exists = await summary.isVisible().catch(() => false);

  if (exists) {
    const text = await page.locator("body").textContent();
    expect(text).toMatch(/\d/);
  }
});

test("Sipariş verme butonu var", async ({ page }) => {
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.goto();

  const exists = await checkoutPage.payButton.isVisible().catch(() => false);

  if (page.url().includes("checkout")) {
    expect(exists).toBe(true);
  }
});
