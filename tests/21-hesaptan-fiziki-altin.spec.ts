import { test, expect } from "@playwright/test";
import { startWithEmptyBasket, selectFirstTransferBank } from "../pages/CheckoutFlow";
import { HomePage } from "../pages/HomePage";
import { CartPage } from "../pages/CartPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";
import { CheckoutPage } from "../pages/CheckoutPage";

test("Kullanıcı yolculuğu - Hesaptan Fiziki Altına Baştan Sona", async ({
  page,
}) => {
  test.setTimeout(300_000);

  const homePage = new HomePage(page);
  const cartPage = new CartPage(page);
  const ordersPage = new OrdersPage(page);
  const profilePage = new ProfilePage(page);
  const checkoutPage = new CheckoutPage(page);

  await test.step("1. Ana sayfayı aç ve sepeti temizle", async () => {
    await homePage.goto();
    await expect(page).toHaveURL(/nadirgold\.(work|dev)|localhost/);
    await expect(page.locator("body")).toBeVisible();

    await cartPage.clearAll();
    // clearAll sunucudaki eski sepeti garanti etmiyor (NSB-7231) → sıkı temizlik.
    await startWithEmptyBasket(page);
    await homePage.goto();

    console.log("✓ Ana sayfa açıldı ve sepet temizlendi:", page.url());
  });

  await test.step("2. Popup varsa kapat", async () => {
    const closed = await homePage.closePopupIfVisible();
    console.log(
      closed ? "✓ Popup kapatıldı" : "ℹ Popup görünmüyor, devam ediliyor",
    );
  });

await test.step("3. HESAPTAN FİZİKİ ALTINA sayfasına git", async () => { const hesaptanFizikiLink = page .locator("a") .filter({ hasText: /HESAPTAN\s*FİZİKİ\s*ALTINA/i }) .first(); await expect(hesaptanFizikiLink).toBeVisible({ timeout: 15_000 }); const href = await hesaptanFizikiLink.getAttribute("href"); if (!href) { throw new Error( "HESAPTAN FİZİKİ ALTINA linkinin href değeri bulunamadı.", ); } const targetUrl = new URL(href, page.url()).toString(); console.log("HESAPTAN FİZİKİ ALTINA target URL:", targetUrl); await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000, }); await expect(page.locator("body")).toBeVisible({ timeout: 15_000 }); await page.waitForTimeout(1500); expect(new URL(page.url()).pathname).not.toBe("/"); console.log("✓ Hesaptan Fiziki Altına sayfası açıldı:", page.url()); });
  await test.step("4. Fiziki çevrilebilir ilk külçeyi seç", async () => {
    // Sabit "1 Gr" stage'de fiziki tarafta "Yakında Stokta" (V1=V2, 22.11.2026) →
    // listede "Fiziki Altına Çevir" butonu olan ilk ürünün linkine git.
    const convertOnList = page
      .getByRole("button", { name: /Fiziki Altına Çevir/i })
      .first();
    await expect(convertOnList).toBeVisible({ timeout: 15_000 });
    const href = await convertOnList.evaluate((el) => {
      let x: HTMLElement | null = el as HTMLElement;
      while (x && !x.querySelector("a[href]")) x = x.parentElement;
      return x?.querySelector("a[href]")?.getAttribute("href") ?? null;
    });
    if (!href) throw new Error("Fiziki çevrilebilir ürünün linki bulunamadı.");
    await page.goto(new URL(href, page.url()).toString(), {
      waitUntil: "domcontentloaded",
    });

    await page.waitForLoadState("domcontentloaded").catch(() => { });
    await page.waitForTimeout(1500);

    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Ürün detay sayfasına gidildi:", page.url());
  });

  await test.step("5. Fiziki Altına Çevir butonuna tıkla", async () => {
    await page.evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    });

    const convertButton = page
      .getByRole("button", { name: /Fiziki Altına Çevir/i })
      .first();

    await expect(convertButton).toBeVisible({ timeout: 15000 });
    await convertButton.scrollIntoViewIfNeeded();

    await expect(convertButton).toBeEnabled({ timeout: 15000 });

    await convertButton.click({ force: true });

    await expect(page.getByRole("link", { name: /Sepete Git/i })).toBeVisible({
      timeout: 15000,
    });

    console.log("✓ Fiziki Altına Çevir tıklandı ve Sepete Git göründü");
  });

  await test.step("6. Sepete git", async () => {
    await page.getByRole("link", { name: "Sepete Git" }).click();

    await page.waitForLoadState("networkidle").catch(() => { });
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Sepete gidildi:", page.url());
  });

  await test.step("7. Checkout sayfasına geç", async () => {
    await page.getByRole("link", { name: "Devam et" }).click();

    await page.waitForLoadState("networkidle").catch(() => { });
    await expect(page).not.toHaveURL(/hesap\/giris/);
    await expect(page.locator("body")).toBeVisible();

    console.log("✓ Checkout sayfasına gidildi:", page.url());
  });

  await test.step("8. Adres / teslimat seç", async () => {
    // Varsayılan adres zaten seçiliyse dokunma; değilse ilk adresi seç.
    await checkoutPage.ensureAddressSelected();

    console.log("✓ Adres / teslimat seçildi");
  });

  await test.step("8b. Transfer bankasını seç", async () => {
    // Banka önseçili gelmiyor; seçilmezse ÖDEME YAP "Lütfen banka seçiniz" der (V1 = V2).
    await selectFirstTransferBank(page);
  });

  await test.step("9. Ön bilgilendirme formunu onayla", async () => {
    await page
      .getByRole("checkbox", { name: "Ön bilgilendirme formu ," })
      .check();

    console.log("✓ Ön bilgilendirme formu onaylandı");
  });

  await test.step("10. Ödeme Yap butonuna tıkla", async () => {
    // Teşhis: ÖDEME YAP sonrası sayfa checkout'ta kalıyorsa hangi API ne döndü görünsün.
    page.on("response", async (r) => {
      const m = r.request().method();
      if (m === "GET" || m === "OPTIONS" || /google|analytics|facebook|tiktok|clarity|hotjar|insider|criteo|doubleclick/i.test(r.url())) return;
      const body = await r.text().catch(() => "");
      console.log(`ℹ NET ${r.status()} ${r.request().method()} ${r.url().replace(/^https:\/\/[^/]+/, "")} ${body.replace(/\s+/g, " ").slice(0, 300)}`);
    });
    page.on("console", (msg) => { if (msg.type() === "error") console.log(`ℹ CONSOLE ${msg.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => console.log(`ℹ PAGEERROR ${e.message.slice(0, 300)}`));
    await checkoutPage.pay();
    console.log("✓ Ödeme Yap tıklandı, URL:", page.url());
    // Sipariş gerçekten oluştu mu: tebrikler/<no> şart (önceden assert yoktu).
    await expect(page).toHaveURL(/tebrikler\/\d+/, { timeout: 60_000 });
    console.log("✓ SİPARİŞ:", page.url());
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
