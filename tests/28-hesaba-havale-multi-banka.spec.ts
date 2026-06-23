import { test, expect, Page } from "@playwright/test";
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

      await closeAllPopups(page);

      await cartPage.clearAll();
      await homePage.goto();

      await closeAllPopups(page);

      console.log(`✓ [${bank.id}] Ana sayfa açıldı, sepet temizlendi`);
    });

    await test.step("2. Popup varsa kapat", async () => {
      await homePage.closePopupIfVisible().catch(() => false);
      await closeAllPopups(page);

      console.log(`✓ [${bank.id}] Popup kontrol edildi`);
    });

    await test.step("3. HESABA ALTIN HAVALE sayfasına git", async () => {
      await closeAllPopups(page);

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

      console.log(`[${bank.id}] HESABA ALTIN HAVALE target URL:`, targetUrl);

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      await closeAllPopups(page);

      await expect(page.locator("body")).toBeVisible();

      console.log(`✓ [${bank.id}] Hesaba Altın Havale sayfası açıldı`);
    });

    await test.step(`4. ${bank.label} seç ve 20000 TL gir`, async () => {
      await closeAllPopups(page);

      await page.getByRole("img", { name: bank.imageName }).click();

      const tlInput = page.getByRole("textbox", { name: "TL" });

      await tlInput.click();
      await tlInput.fill("20000");

      console.log(`✓ [${bank.id}] ${bank.label} seçildi, 20000 TL girildi`);
    });

    await test.step("5. HESABA HAVALE YAP tıkla", async () => {
      await closeAllPopups(page);

      await page.getByRole("button", { name: "HESABA HAVALE YAP" }).click();

      await expect(page.locator("body")).toBeVisible();

      console.log(`✓ [${bank.id}] HESABA HAVALE YAP tıklandı`);
    });

    await test.step("6. Banka + adres + kredi kartı + sözleşme onaylama", async () => {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(5000);

      await closeAllPopups(page);

      // 1) Havale yapılacak banka radio — ilk görünür .flex-shrink-0
      await page.locator(".flex-shrink-0").first().click();

      await page.waitForTimeout(6000);

      await closeAllPopups(page);

      // 2) Test adresi — label içindeki görünür .flex-shrink-0
      await page
        .locator("#address-section label")
        .filter({ hasText: "Test adresi" })
        .locator(".flex-shrink-0")
        .first()
        .click();

      await page.waitForTimeout(6000);

      await closeAllPopups(page);

      // 3) Kayıtlı kredi kartı — ekrandaki 2. kart: 479680******0003 VISA
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

      // 4) Ön bilgilendirme — aynı pattern
      await page
        .locator("label")
        .filter({ hasText: "Ön bilgilendirme formu" })
        .locator(".flex-shrink-0")
        .first()
        .click();

      await page.waitForTimeout(6000);

      console.log(
        `✓ [${bank.id}] Banka + adres + kredi kartı + sözleşme onaylandı`,
      );
    });

    await test.step("7. Açılan modal varsa kapat", async () => {
      await closeAllPopups(page);

      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(1500);

      console.log(`✓ [${bank.id}] Modal / popup kontrol edildi`);
    });

    await test.step("8. Ödeme yap", async () => {
      await closeAllPopups(page);

      const payBtn = page.getByRole("button", { name: "ÖDEME YAP" });

      await payBtn.waitFor({ state: "visible", timeout: 15_000 });

      await expect
        .poll(
          async () => await payBtn.isEnabled().catch(() => false),
          {
            timeout: 30_000,
          },
        )
        .toBe(true);

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

async function closeAllPopups(page: Page) {
  await page.evaluate(() => {
    document.querySelector("#dengage-push-prompt-container")?.remove();
    document.querySelector(".dengage-push-prompt-container")?.remove();
    document.querySelector('[id*="dengage"]')?.remove();
    document.querySelector('[class*="dengage"]')?.remove();

    const selectors = [
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="modal"]',
      '[class*="Modal"]',
      '[class*="overlay"]',
      '[class*="Overlay"]',
      '[role="dialog"]',
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const element = el as HTMLElement;
        const text = element.innerText || "";

        if (
          text.includes("Kapat") ||
          text.includes("Fırsat") ||
          text.includes("Duyuru") ||
          text.includes("Bildirim") ||
          text.includes("kampanya") ||
          text.includes("KAMPANYA")
        ) {
          element.remove();
        }
      });
    });

    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
  });

  const closeButtons = [
    page.getByRole("button", { name: "Popup kapat butonu" }),
    page.getByRole("button", { name: /Kapat|Close|×|X/i }).first(),
    page.locator('button[aria-label*="kapat" i]').first(),
    page.locator('button[aria-label*="close" i]').first(),
    page.locator('[role="dialog"] button').first(),
    page.locator('[class*="popup"] button').first(),
    page.locator('[class*="Popup"] button').first(),
    page.locator('[class*="modal"] button').first(),
    page.locator('[class*="Modal"] button').first(),
    page.locator("button").filter({ hasText: /Kapat|Tamam|Anladım/i }).first(),
  ];

  for (const button of closeButtons) {
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  await page.keyboard.press("Escape").catch(() => {});

  await page.evaluate(() => {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
  });

  await page.waitForTimeout(700);
}
