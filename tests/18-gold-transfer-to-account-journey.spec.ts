
import { test, expect, Page } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

const OTP = "201409";

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

    await closeAllPopups(page);

    console.log("✓ Ana sayfa açıldı ve sepet temizlendi:", page.url());
  });

  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();

    await closeAllPopups(page);

    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("3. HESABA ALTIN HAVALE sayfasına git", async () => {
    const hesabaAltinHavaleLink = page
      .locator("a")
      .filter({ hasText: /HESABA\s*ALTIN\s*HAVALE/i })
      .first();

    await expect(hesabaAltinHavaleLink).toBeVisible({ timeout: 15_000 });

    const href = await hesabaAltinHavaleLink.getAttribute("href");

    if (!href) {
      throw new Error("HESABA ALTIN HAVALE linkinin href değeri bulunamadı.");
    }

    const targetUrl = new URL(href, page.url()).toString();

    console.log("HESABA ALTIN HAVALE target URL:", targetUrl);

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(1500);
    await closeAllPopups(page);

    expect(page.url()).not.toBe("https://www.nadirgold.work/");

    console.log("✓ Hesaba Altın Havale sayfası açıldı:", page.url());
  });

  await test.step("4. Garanti Bankası seç ve 20000 TL tutar gir", async () => {
    await closeAllPopups(page);

    const garantiBank = page
      .getByRole("img", { name: /GARANTİ|GARANTI/i })
      .first();

    await expect(garantiBank).toBeVisible({ timeout: 20_000 });

    await garantiBank.scrollIntoViewIfNeeded();
    await garantiBank.click({ force: true });

    await page.waitForTimeout(1000);

    const tlInput = page.getByRole("textbox", { name: "TL" });

    await expect(tlInput).toBeVisible({ timeout: 15_000 });

    await tlInput.click();
    await tlInput.fill("20000");

    await page.waitForTimeout(1000);

    console.log("✓ Garanti Bankası seçildi ve 20000 TL girildi");
  });

  await test.step("5. HESABA HAVALE YAP butonuna tıkla", async () => {
    await closeAllPopups(page);

    const transferButton = page.getByRole("button", {
      name: "HESABA HAVALE YAP",
    });

    await expect(transferButton).toBeVisible({ timeout: 20_000 });
    await expect(transferButton).toBeEnabled({ timeout: 20_000 });

    await transferButton.scrollIntoViewIfNeeded();
    await transferButton.click();

    await page.waitForLoadState("domcontentloaded").catch(() => { });
    await page.waitForTimeout(3000);

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ HESABA HAVALE YAP tıklandı");
  });

  await test.step("6. Banka seç", async () => {
    await closeAllPopups(page);

    await page.waitForTimeout(2000);

    const bankOption = page
      .locator(".cursor-pointer.flex.items-center.gap-3 > .flex-shrink-0")
      .first();

    if (await bankOption.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await bankOption.scrollIntoViewIfNeeded();
      await bankOption.click({ force: true });
      await page.waitForTimeout(1500);

      console.log("✓ Banka seçildi");
      return;
    }

    const fallbackBankOption = page.locator(".flex-shrink-0").first();

    await expect(fallbackBankOption).toBeVisible({ timeout: 15_000 });
    await fallbackBankOption.scrollIntoViewIfNeeded();
    await fallbackBankOption.click({ force: true });

    await page.waitForTimeout(1500);

    console.log("✓ Banka fallback locator ile seçildi");
  });

  await test.step("7. Test adresini seç", async () => {
    await closeAllPopups(page);

    const testAddress = page
      .locator("#address-section label")
      .filter({ hasText: "Test adresi" })
      .locator(".flex-shrink-0")
      .first();

    if (await testAddress.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await testAddress.scrollIntoViewIfNeeded();
      await testAddress.click({ force: true });
      await page.waitForTimeout(1500);

      console.log("✓ Test adresi seçildi");
      return;
    }

    const firstAddress = page
      .locator("#address-section label .flex-shrink-0")
      .first();

    await expect(firstAddress).toBeVisible({ timeout: 15_000 });
    await firstAddress.scrollIntoViewIfNeeded();
    await firstAddress.click({ force: true });

    await page.waitForTimeout(1500);

    console.log("✓ İlk adres seçildi");
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
    const savedCardRow = savedCardRows.nth(1);

    await expect(savedCardRow).toBeVisible({ timeout: 15_000 });

    await savedCardRow.scrollIntoViewIfNeeded();
    await savedCardRow.click({ force: true });

    await page.waitForTimeout(1500);

    console.log("✓ Kayıtlı kredi kartı seçildi");
  });




  await test.step("8. Ön bilgilendirme formunu onayla", async () => {
    await closeAllPopups(page);

    const agreementCheckbox = page
      .locator("label")
      .filter({ hasText: "Ön bilgilendirme formu" })
      .locator(".flex-shrink-0")
      .first();

    await expect(agreementCheckbox).toBeVisible({ timeout: 20_000 });

    await agreementCheckbox.scrollIntoViewIfNeeded();
    await agreementCheckbox.click({ force: true });

    await page.waitForTimeout(1500);

    console.log("✓ Ön bilgilendirme formu onaylandı");
  });

  await test.step("9. Açılan modal varsa kapat", async () => {
    await closeAllPopups(page);

    console.log("✓ Modal / popup kontrol edildi");
  });

  await test.step("10. ÖDEME YAP butonuna tıkla", async () => {
    await closeAllPopups(page);

    const payButton = page.getByRole("button", { name: "ÖDEME YAP" });

    await expect(payButton).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(
        async () => await payButton.isEnabled().catch(() => false),
        {
          timeout: 30_000,
        },
      )
      .toBe(true);

    await payButton.scrollIntoViewIfNeeded();
    await payButton.click();

    await page.waitForTimeout(3000);

    console.log("✓ ÖDEME YAP tıklandı");
  });

  await test.step("11. 3D Secure OTP gir", async () => {
    await page.waitForTimeout(3000);

    const iframeCount = await page.locator("iframe").count();

    if (iframeCount === 0) {
      console.log("ℹ OTP iframe görünmedi, devam ediliyor");
      return;
    }

    const otpFrameElement = page.locator("iframe").nth(1);

    await expect(otpFrameElement).toBeVisible({ timeout: 30_000 });

    const otpFrame = otpFrameElement.contentFrame();

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

  await test.step("12. Tebrikler sayfasını doğrula", async () => {
    await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Tebrikler sayfası açıldı:", page.url());
  });

  await test.step("13. Siparişlerim sayfasına bak", async () => {
    await ordersPage.goto();

    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Siparişlerim sayfası açıldı");
  });

  await test.step("14. Profil sayfasına bak", async () => {
    await profilePage.gotoSafe();

    await expect(page).not.toHaveURL(/hesap\/giris/);

    const inputs = await profilePage.inputCount();

    expect(inputs).toBeGreaterThan(0);

    console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
  });
});

async function closeAllPopups(page: Page) {
  await page.evaluate(() => {
    document.querySelector("#dengage-push-prompt-container")?.remove();
    document.querySelector(".dengage-push-prompt-container")?.remove();
    document.querySelector('[id*="dengage"]')?.remove();
    document.querySelector('[class*="dengage"]')?.remove();

    const possiblePopups = document.querySelectorAll(
      '[class*="popup"], [class*="modal"], [class*="Modal"], [role="dialog"]',
    );

    possiblePopups.forEach((popup) => {
      const element = popup as HTMLElement;
      const text = element.innerText || "";

      if (
        text.includes("Kapat") ||
        text.includes("Fırsat") ||
        text.includes("Duyuru") ||
        text.includes("Bildirim")
      ) {
        element.style.display = "none";
      }
    });
  });

  const popupButtons = [
    page.getByRole("button", { name: "Popup kapat butonu" }),
    page.getByRole("button", { name: /Kapat|Close|×|X/i }).first(),
    page.locator('button[aria-label*="kapat" i]').first(),
    page.locator('button[aria-label*="close" i]').first(),
    page.locator("[role='dialog'] button").first(),
    page.locator('[class*="modal"] button').first(),
    page.locator('[class*="popup"] button').first(),
    page.locator("svg").last(),
  ];

  for (const button of popupButtons) {
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click({ force: true }).catch(() => { });
      await page.waitForTimeout(500);
    }
  }

  await page.keyboard.press("Escape").catch(() => { });
  await page.waitForTimeout(700);
}
