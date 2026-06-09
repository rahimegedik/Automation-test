import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

test("Kullanıcı yolculuğu - Hesaba Altın Havale Baştan Sona", async ({
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

  await test.step("3. HESABA ALTIN HAVALE sayfasına git", async () => {
    await page
      .getByRole("link", { name: "HESABA ALTIN HAVALE", exact: true })
      .click();

    // Dengage push notification overlay'i tıklamaları engelliyor — DOM'dan kaldır
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
    console.log("✓ Hesaba Altın Havale sayfası açıldı:", page.url());
  });
  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();
    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("4. Banka seç ve 20000 TL tutar gir", async () => {
    await page.getByRole("img", { name: "T.GARANTİ BANKASI A.Ş" }).click();

    const tlInput = page.getByRole("textbox", { name: "TL" });
    await tlInput.click();
    await tlInput.fill("20000");

    console.log("✓ Garanti Bankası seçildi ve 20000 TL girildi");
  });

  await test.step("5. Hesaba havale yap", async () => {
    await page.getByRole("button", { name: "HESABA HAVALE YAP" }).click();
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ HESABA HAVALE YAP tıklandı");
  });

  await test.step("6. Banka, adres ve sözleşme onaylama", async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(5000);

    // 1) Banka radio — ilk görünür .flex-shrink-0 (yuvarlak radio kutusu)
    await page.locator(".flex-shrink-0").first().click();
    await page.waitForTimeout(6000);

    // 2) Test adresi — gizli input yerine label içindeki görünür .flex-shrink-0 tıkla
    await page
      .locator("#address-section label")
      .filter({ hasText: "Test adresi" })
      .locator(".flex-shrink-0")
      .first()
      .click();
    await page.waitForTimeout(6000);

    // 3) Ön bilgilendirme — aynı pattern
    await page
      .locator("label")
      .filter({ hasText: "Ön bilgilendirme formu" })
      .locator(".flex-shrink-0")
      .first()
      .click();
    await page.waitForTimeout(6000);

    console.log("✓ Banka + adres + sözleşme onaylandı");
  });

  await test.step("7. Açılan modal varsa kapat", async () => {
    // Sözleşme link metni tıklanmışsa modal açılmış olabilir — ESC ile kapat
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1500);
    console.log("✓ Modal kontrol edildi");
  });

  await test.step("8. Ödeme yap", async () => {
    const payBtn = page.getByRole("button", { name: "ÖDEME YAP" });
    await payBtn.waitFor({ state: "visible", timeout: 15_000 });
    await payBtn.click();
    await page.waitForTimeout(3000);

    console.log("✓ ÖDEME YAP tıklandı");
  });

  await test.step("9. 3D Secure OTP gir", async () => {
    // 3D Secure iframe yüklenmesini bekle
    await page.waitForTimeout(3000);
    const otpFrame = page.locator("iframe").nth(1).contentFrame();

    await otpFrame
      .getByRole("textbox")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    await otpFrame.getByRole("textbox").first().click();
    await otpFrame.getByRole("textbox").first().fill("2");
    await otpFrame.getByRole("textbox").nth(1).fill("0");
    await otpFrame.getByRole("textbox").nth(2).fill("1");
    await otpFrame.getByRole("textbox").nth(3).fill("4");
    await otpFrame.getByRole("textbox").nth(4).fill("0");
    await otpFrame.getByRole("textbox").nth(5).fill("9");

    // OTP otomatik submit ediliyorsa biraz bekle
    await page.waitForTimeout(5000);

    console.log("✓ OTP girildi");
  });

  await test.step("10. Tebrikler sayfasını doğrula", async () => {
    await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Tebrikler sayfası açıldı:", page.url());
  });

  await test.step("11. Siparişlerim sayfasına bak", async () => {
    await ordersPage.goto();
    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Siparişlerim sayfası açıldı");
  });

  await test.step("12. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();
    await expect(page).not.toHaveURL(/hesap\/giris/);

    const inputs = await profilePage.inputCount();
    expect(inputs).toBeGreaterThan(0);

    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});
