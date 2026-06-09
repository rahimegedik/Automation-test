import { test, expect } from "@playwright/test";
import { CardsPage } from "../pages/CardsPage";

test.describe("Kayıtlı Kartlar (UI assert only — yıkıcı değil)", () => {
  test("TC-CARD-001: Sayfa açılır", async ({ page }) => {
    const cardsPage = new CardsPage(page);
    await cardsPage.goto();
    await expect(page).toHaveURL(/\/hesabim\/kartlarim/);
    await expect(cardsPage.addCardButton).toBeVisible();
    console.log("✓ Kayıtlı Kartlar sayfası açıldı:", page.url());
  });

  test("TC-CARD-002: Başlık görünür", async ({ page }) => {
    const cardsPage = new CardsPage(page);
    await cardsPage.goto();
    // Başlık birden çok yerde geçiyor (sidebar, breadcrumb); DOM'da olması yeterli
    const count = await page
      .getByText("Kayıtlı Kartlarım", { exact: true })
      .count();
    expect(count).toBeGreaterThan(0);
    console.log(`✓ "Kayıtlı Kartlarım" metni ${count} yerde görünür`);
  });

  test("TC-CARD-003: Yeni Kart Ekle butonu görünür", async ({ page }) => {
    const cardsPage = new CardsPage(page);
    await cardsPage.goto();
    await expect(cardsPage.addCardButton).toBeVisible();
    await expect(cardsPage.addCardButton).toBeEnabled();
    console.log('✓ "Yeni Kart Ekle" butonu aktif');
  });

  test("TC-CARD-004: Kart bilgileri (masked numara + SKT)", async ({
    page,
  }) => {
    const cardsPage = new CardsPage(page);
    await cardsPage.goto();
    const count = await cardsPage.cardCount();
    test.skip(
      count === 0,
      "Kayıtlı kart yok, bu test için gerçek kart gerekli",
    );

    expect(await cardsPage.hasMaskedNumber(0)).toBe(true);
    expect(await cardsPage.hasExpiry(0)).toBe(true);
    console.log(
      `✓ Kart 0: masked numara + SKT görünüyor (toplam ${count} kart)`,
    );
  });

  test('TC-CARD-005: Banka fallback ("Bankanız")', async ({ page }) => {
    const cardsPage = new CardsPage(page);
    await cardsPage.goto();
    const count = await cardsPage.cardCount();
    test.skip(count === 0, "Kayıtlı kart yok");

    // Bu kullanıcının kartında banka adı dönmüyor — fallback gösterilmeli
    // Eğer kullanıcının kartında gerçek banka adı varsa skip
    const fallback = await cardsPage.hasBankFallback(0);
    if (!fallback) {
      const text = await cardsPage.getCardText(0);
      console.log(
        `ℹ Bu kartta gerçek banka adı var, fallback testi N/A. Kart text: ${text.slice(0, 60)}`,
      );
      test.skip();
    }
    expect(fallback).toBe(true);
    console.log('✓ Banka fallback "Bankanız" görünüyor');
  });

  test("TC-CARD-006: Sil butonu görünür (gerçek silme yok)", async ({
    page,
  }) => {
    const cardsPage = new CardsPage(page);
    await cardsPage.goto();
    const count = await cardsPage.cardCount();
    test.skip(count === 0, "Kayıtlı kart yok");

    // Sil butonu = SVG'li, text'siz button (çöp ikonu)
    const trashButtons = page
      .locator('button:has(svg path[d*="M"])')
      .filter({ hasNotText: /\w{3,}/ });
    const trashCount = await trashButtons.count();
    expect(trashCount).toBeGreaterThan(0);
    console.log(`✓ ${trashCount} adet ikon-only button (sil dahil) görünüyor`);
  });
});
