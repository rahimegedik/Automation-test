import { test, expect, Page } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";
import { CheckoutPage } from "../pages/CheckoutPage";

test("Kullanıcı yolculuğu - Ziynet Altın Havale Baştan Sona", async ({
  page,
}) => {
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

  await test.step("3. ZİYNET ALTIN kategorisine git", async () => {
    const ziynetAltinLink = page
      .locator("a")
      .filter({ hasText: /ZİYNET\s*ALTIN|ZIYNET\s*ALTIN/i })
      .first();

    await expect(ziynetAltinLink).toBeVisible({ timeout: 15_000 });

    const href = await ziynetAltinLink.getAttribute("href");

    if (!href) {
      throw new Error("ZİYNET ALTIN linkinin href değeri bulunamadı.");
    }

    const targetUrl = new URL(href, page.url()).toString();

    console.log("ZİYNET ALTIN target URL:", targetUrl);

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(1500);
    await closeAllPopups(page);

    expect(page.url()).not.toBe("https://www.nadirgold.work/");

    console.log("✓ Ziynet Altın sayfası açıldı:", page.url());
  });

  await test.step("4. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();

    await closeAllPopups(page);

    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("5. Reşat Lira Altın 2022 Kulplu ürünü seç", async () => {
    await closeAllPopups(page);

    const productLink = page
      .getByRole("link", { name: /Reşat Lira Altın 2022 Kulplu/i })
      .first();

    await expect(productLink).toBeVisible({ timeout: 20_000 });

    const href = await productLink.getAttribute("href");

    if (!href) {
      throw new Error("Reşat Lira Altın 2022 Kulplu ürün linkinin href değeri bulunamadı.");
    }

    const targetUrl = new URL(href, page.url()).toString();

    console.log("Ürün target URL:", targetUrl);

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(1500);
    await closeAllPopups(page);

    console.log("✓ Ürün detay sayfasına gidildi:", page.url());
  });

  await test.step("6. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();

    await closeAllPopups(page);

    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

  await test.step("7. Sepete ekle", async () => {
    await closeAllPopups(page);

    const addToCartButton = page.locator("#add2CartButton");

    await expect(addToCartButton).toBeVisible({ timeout: 20_000 });
    await expect(addToCartButton).toBeEnabled({ timeout: 20_000 });

    await addToCartButton.scrollIntoViewIfNeeded();
    await addToCartButton.click();

    await page.waitForTimeout(2000);

    console.log("✓ Sepete ekle tıklandı");
  });

  await test.step("8. Checkout sayfasına geç", async () => {
    await page.goto("https://www.nadirgold.work/checkout", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(1500);
    await closeAllPopups(page);

    console.log("✓ Checkout sayfasına gidildi:", page.url());
  });

  await test.step("9. Banka Transfer sekmesini seç", async () => {
    await closeAllPopups(page);

    const bankTransferTab = page
      .locator('button, div[role="tab"]')
      .filter({ hasText: /Banka Transfer|Havale/i })
      .first();

    await expect(bankTransferTab).toBeVisible({ timeout: 20_000 });

    await bankTransferTab.scrollIntoViewIfNeeded();
    await bankTransferTab.click();

    await page.waitForTimeout(1000);

    console.log("✓ Banka Transfer sekmesi seçildi");
  });

  await test.step("10. Banka Transfer / Anında Ödeme seç", async () => {
    await closeAllPopups(page);

    await checkoutPage.selectBankTransfer();

    console.log("✓ Banka Transfer seçildi");

    await checkoutPage.selectFirstBank();

    console.log("✓ İlk banka seçildi");
  });

  await test.step("11. Sözleşmeyi onayla", async () => {
    await closeAllPopups(page);

    await checkoutPage.acceptAgreement();

    const isChecked = await checkoutPage.isAgreementChecked();

    console.log(`✓ Sözleşme onaylandı (checked: ${isChecked})`);

    expect(isChecked).toBe(true);
  });

  await test.step("12. Ödeme Yap butonuna tıkla", async () => {
    await closeAllPopups(page);

    const payButton = page.getByRole("button", {
      name: /ÖDEME YAP|Ödeme Yap/i,
    });

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

    console.log("✓ Ödeme Yap tıklandı, URL:", page.url());

    await expect(page.locator("body")).toBeVisible();
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
  ];

  for (const button of popupButtons) {
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(700);
}

