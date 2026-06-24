import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";
import { CheckoutPage } from "../pages/CheckoutPage";

test("Kullanıcı yolculuğu - Takı Yeni Havale Baştan Sona", async ({ page }) => {
  test.setTimeout(300_000);

  const homePage = new HomePage(page);
  const cartPage = new CartPage(page);
  const ordersPage = new OrdersPage(page);
  const checkoutPage = new CheckoutPage(page);
  const profilePage = new ProfilePage(page);

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
  const takiYeniLink = page
    .locator("a")
    .filter({ hasText: /TAKI\s*YENİ/i })
    .first();

  await expect(takiYeniLink).toBeVisible({ timeout: 15_000 });

  const href = await takiYeniLink.getAttribute("href");

  if (!href) {
    throw new Error("TAKI YENİ linkinin href değeri bulunamadı.");
  }

  console.log("TAKI YENİ href:", href);

  await page.goto(href, {
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

  await expect(page).not.toHaveURL("https://www.nadirgold.work/", {
    timeout: 15_000,
  });

  console.log("✓ TAKI YENİ gerçek sayfası açıldı:", page.url());
});

  await test.step("4. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();
    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("5. Takı ürününü seç", async () => {
    const sepeteEkleButton = page.getByRole("button", {
      name: "Sepete Ekle",
    });

    await expect(sepeteEkleButton).toBeVisible({ timeout: 15_000 });
    await expect(sepeteEkleButton).toBeEnabled();

    await sepeteEkleButton.click();

    console.log("✓ Takı ürünü seçildi / Sepete Ekle tıklandı");
  });

  await test.step("6. Ürün seçeneği 6.8 seç", async () => {
    const optionButton = page.getByRole("button", { name: "6.2" });

    await expect(optionButton).toBeVisible({ timeout: 15_000 });
    await expect(optionButton).toBeEnabled();

    await optionButton.click();

    console.log("✓ 6.8 ürün seçeneği seçildi");
  });

  await test.step("7. Sepete ekle", async () => {
    const addToCartButton = page.locator("#add2CartButton");

    await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
    await expect(addToCartButton).toBeEnabled();

    await addToCartButton.click();
    await page.waitForTimeout(1500);

    console.log("✓ Sepete ekle tıklandı");
  });

  await test.step("8. Checkout sayfasına geç", async () => {
    await page.goto("https://www.nadirgold.work/checkout", {
      waitUntil: "networkidle",
      timeout: 15_000,
    });

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Checkout sayfasına gidildi:", page.url());
  });

  await test.step("9. Banka Transfer sekmesini seç", async () => {
    await page
      .locator('button, div[role="tab"]')
      .filter({ hasText: /Banka Transfer|Havale/i })
      .first()
      .click();

    await page.waitForTimeout(500);

    console.log("✓ Banka Transfer sekmesi seçildi");
  });

  await test.step("10. Banka Transfer / Anında Ödeme seç", async () => {
    await checkoutPage.selectBankTransfer();

    console.log("✓ Banka Transfer sekmesi seçildi");

    await checkoutPage.selectFirstBank();

    console.log("✓ İlk banka seçildi");
  });

  await test.step("11. Sözleşmeyi onayla", async () => {
    await checkoutPage.acceptAgreement();

    const isChecked = await checkoutPage.isAgreementChecked();

    console.log(`✓ Sözleşme onaylandı (checked: ${isChecked})`);

    expect(isChecked).toBe(true);
  });

  await test.step("12. Ödeme Yap butonuna tıkla", async () => {
    await checkoutPage.pay();

    console.log("✓ Ödeme Yap tıklandı, URL:", page.url());

    await expect(page.locator("body")).toBeVisible();
  });

  await test.step("13. Tebrikler sayfasını doğrula", async () => {
    await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Tebrikler sayfası açıldı:", page.url());
  });

  await test.step("14. Siparişlerim sayfasına bak", async () => {
    await ordersPage.goto();

    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Siparişlerim sayfası açıldı");
  });

  await test.step("15. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();

    await expect(page).not.toHaveURL(/hesap\/giris/);

    const inputs = await profilePage.inputCount();
    expect(inputs).toBeGreaterThan(0);

    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});
