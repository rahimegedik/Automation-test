import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";

// 3 farklı banka × 1 Hesaba Altın Havale akışı.
// Her test = 1 gerçek havale → toplam 3 sipariş açar.
// Test 18 (Garanti tek) korunmuştur; bu spec ek koverage için.
const BANKS = [
  {
    id: "yapikredi",
    label: "Yapı ve Kredi Bankası",
    imageName: "YAPI VE KREDİ BANKASI A.Ş",
    iban: "TR51 0006 7010 0000 0051 8547 98",
  },
  {
    id: "garanti",
    label: "Garanti BBVA",
    imageName: "T.GARANTİ BANKASI A.Ş",
    iban: "TR88 0006 2001 6360 0006 6441 87",
  },
  {
    id: "kuveyt",
    label: "Kuveyt Türk Katılım",
    imageName: "KUVEYT TÜRK KATILIM BANKASI A.Ş",
    iban: "TR27 0020 5000 0954 3929 3001 03",
  },
];

for (const bank of BANKS) {
  test(`Hesaba Altın Havale - ${bank.label} (${bank.id})`, async ({ page }) => {
    test.setTimeout(300_000);

    const homePage = new HomePage(page);
    const cartPage = new CartPage(page);
    const ordersPage = new OrdersPage(page);
    const profilePage = new ProfilePage(page);

    await test.step("1. Ana sayfayı aç ve sepeti temizle", async () => {
      await homePage.goto();
      await expect(page).toHaveURL(/nadirgold\.work/);
      await cartPage.clearAll();
      await homePage.goto();
      console.log(`✓ [${bank.id}] Ana sayfa açıldı, sepet temizlendi`);
    });

    await test.step("2. Popup varsa kapat", async () => {
      await homePage.closePopupIfVisible();
    });

    await test.step("3. HESABA ALTIN HAVALE sayfasına git", async () => {
      await page
        .getByRole("link", { name: "HESABA ALTIN HAVALE", exact: true })
        .click();

      // Dengage overlay'i kaldır
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
      console.log(`✓ [${bank.id}] Hesaba Altın Havale sayfası açıldı`);
    });

    await test.step(`4. ${bank.label} seç ve 20000 TL gir`, async () => {
      await page.getByRole("img", { name: bank.imageName }).click();

      const tlInput = page.getByRole("textbox", { name: "TL" });
      await tlInput.click();
      await tlInput.fill("20000");

      console.log(`✓ [${bank.id}] ${bank.label} seçildi, 20000 TL girildi`);
    });

    await test.step("5. HESABA HAVALE YAP tıkla", async () => {
      await page.getByRole("button", { name: "HESABA HAVALE YAP" }).click();
      await expect(page.locator("body")).toBeVisible();
      console.log(`✓ [${bank.id}] HESABA HAVALE YAP tıklandı`);
    });

    await test.step("6. Banka + adres + sözleşme onaylama", async () => {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(5000);

      // 1) Banka radio — ilk görünür .flex-shrink-0
      await page.locator(".flex-shrink-0").first().click();
      await page.waitForTimeout(6000);

      // 2) Test adresi — label içindeki görünür .flex-shrink-0
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

      console.log(`✓ [${bank.id}] Banka + adres + sözleşme onaylandı`);
    });

    await test.step("7. Açılan modal varsa kapat", async () => {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(1500);
    });

    await test.step("8. Ödeme yap", async () => {
      const payBtn = page.getByRole("button", { name: "ÖDEME YAP" });
      await payBtn.waitFor({ state: "visible", timeout: 15_000 });
      await payBtn.click();
      await page.waitForTimeout(3000);
      console.log(`✓ [${bank.id}] ÖDEME YAP tıklandı`);
    });

    await test.step("9. 3D Secure OTP gir", async () => {
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
      await page.waitForTimeout(5000);
      console.log(`✓ [${bank.id}] OTP girildi`);
    });

    await test.step("10. Tebrikler sayfasını doğrula", async () => {
      await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
      console.log(`✓ [${bank.id}] Tebrikler sayfası: ${page.url()}`);
    });

    await test.step("11. Siparişlerim sayfası", async () => {
      await ordersPage.goto();
      await expect(page).not.toHaveURL(/hesap\/giris/);
      console.log(`✓ [${bank.id}] Siparişlerim açıldı`);
    });

    await test.step("12. Profil sayfası", async () => {
      await profilePage.gotoSafe();
      await expect(page).not.toHaveURL(/hesap\/giris/);
      const inputs = await profilePage.inputCount();
      expect(inputs).toBeGreaterThan(0);
      console.log(`✓ [${bank.id}] Profil sayfası açıldı (${inputs} alan)`);
    });
  });
}
