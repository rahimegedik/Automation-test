import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

test("Kullanıcı yolculuğu - Takı Yeni Kredi Kartı Baştan Sona", async ({
  page,
}) => {
  test.setTimeout(300_000);

  const homePage = new HomePage(page);
  const cartPage = new CartPage(page);
  const ordersPage = new OrdersPage(page);
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
    await page.getByRole("link", { name: "TAKI YENİ", exact: true }).click();

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

  await test.step("4. Sepete Ekle butonuna tıkla", async () => {
    const addBasketButton = page.getByRole("button", {
      name: "Sepete Ekle",
    });

    await expect(addBasketButton).toBeVisible({ timeout: 15_000 });
    await expect(addBasketButton).toBeEnabled();

    await addBasketButton.click();

    console.log("✓ Sepete Ekle butonuna tıklandı");
  });

  await test.step("5. Ürün seçeneği 6.8 seç", async () => {
    const productOptionButton = page.getByRole("button", { name: "6.8" });

    await expect(productOptionButton).toBeVisible({ timeout: 15_000 });
    await expect(productOptionButton).toBeEnabled();

    await productOptionButton.click();

    console.log("✓ 6.8 ürün seçeneği seçildi");
  });

  await test.step("6. Ürünü sepete ekle", async () => {
    const addToCartButton = page.locator("#add2CartButton");

    await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
    await expect(addToCartButton).toBeEnabled();

    await addToCartButton.click();

    await expect(page.getByRole("link", { name: "Sepete Git" })).toBeVisible({
      timeout: 15_000,
    });

    console.log("✓ Ürün sepete eklendi");
  });

  await test.step("7. Sepete git", async () => {
    const goToCartButton = page.getByRole("link", { name: "Sepete Git" });

    await expect(goToCartButton).toBeVisible({ timeout: 15_000 });
    await goToCartButton.click();

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Sepete gidildi:", page.url());
  });

  await test.step("8. Sepetten devam et", async () => {
    const continueButton = page.getByRole("link", { name: "Devam et" });

    await expect(continueButton).toBeVisible({ timeout: 15_000 });
    await expect(continueButton).toBeEnabled();

    await continueButton.click();

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Devam et tıklandı");
  });

  await test.step("9. Banka / Kredi Kartı ile ödeme seç", async () => {
    const creditCardButton = page.getByRole("button", {
      name: "Banka / Kredi Kartı İle Ödeme",
    });

    await expect(creditCardButton).toBeVisible({ timeout: 15_000 });
    await expect(creditCardButton).toBeEnabled();

    await creditCardButton.click();

    console.log("✓ Banka / Kredi Kartı ile ödeme seçildi");
  });

  await test.step("11. Ön bilgilendirme formunu onayla", async () => {
    const agreementCheckbox = page.getByRole("checkbox", {
      name: "Ön bilgilendirme formu ,",
    });

    await expect(agreementCheckbox).toBeVisible({ timeout: 15_000 });

    if (!(await agreementCheckbox.isChecked())) {
      await agreementCheckbox.check();
    }

    console.log("✓ Ön bilgilendirme formu onaylandı");
  });

  await test.step("12. Ödeme yap", async () => {
    const paymentButton = page.getByRole("button", { name: "ÖDEME YAP" });

    await expect(paymentButton).toBeVisible({ timeout: 15_000 });
    await expect(paymentButton).toBeEnabled();

    await paymentButton.click();

    await expect(page.locator("iframe").nth(1)).toBeVisible({
      timeout: 30_000,
    });

    console.log("✓ ÖDEME YAP tıklandı");
  });

  await test.step("13. 3D Secure OTP gir", async () => {
    const otpFrame = page.locator("iframe").nth(1).contentFrame();

    await otpFrame
      .getByRole("textbox")
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    await otpFrame.getByRole("textbox").first().click();
    await otpFrame.getByRole("textbox").first().fill("2");
    await otpFrame.getByRole("textbox").nth(1).fill("0");
    await otpFrame.getByRole("textbox").nth(2).fill("1");
    await otpFrame.getByRole("textbox").nth(3).fill("4");
    await otpFrame.getByRole("textbox").nth(4).fill("0");
    await otpFrame.getByRole("textbox").nth(5).fill("9");

    await page.waitForTimeout(5000);

    console.log("✓ OTP girildi");
  });

  await test.step("14. Tebrikler sayfasını doğrula", async () => {
    await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Tebrikler sayfası açıldı:", page.url());
  });

  await test.step("15. Siparişlerim sayfasına bak", async () => {
    await ordersPage.goto();

    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Siparişlerim sayfası açıldı");
  });

  await test.step("16. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();

    await expect(page).not.toHaveURL(/hesap\/giris/);

    const inputs = await profilePage.inputCount();
    expect(inputs).toBeGreaterThan(0);

    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});