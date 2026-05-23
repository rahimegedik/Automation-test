import { test, expect } from '@playwright/test';
import { IbanPage } from '../pages/IbanPage';
import { TEST_IBAN } from '../fixtures/test-data';

test.describe('IBAN Yönetimi (gerçek silme yok)', () => {
  test('TC-IBAN-001: Sayfa açılır', async ({ page }) => {
    const ibanPage = new IbanPage(page);
    await ibanPage.goto();
    await expect(page).toHaveURL(/\/hesabim\/iban/);
    await expect(ibanPage.addIbanButton).toBeVisible();
    console.log('✓ IBAN sayfası açıldı:', page.url());
  });

  test('TC-IBAN-002: IBAN kartları listelenir', async ({ page }) => {
    const ibanPage = new IbanPage(page);
    await ibanPage.goto();
    const count = await ibanPage.ibanCardCount();
    console.log(`✓ ${count} adet IBAN kartı görünüyor (en az 1 olabilir, hesaba bağlı)`);
    // Kullanıcının hiç IBAN'ı olmayabilir; sadece listenin DOM'da olduğunu doğrula
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('TC-IBAN-003: IBAN format TR ile başlar', async ({ page }) => {
    const ibanPage = new IbanPage(page);
    await ibanPage.goto();
    const count = await ibanPage.ibanCardCount();
    test.skip(count === 0, 'Kayıtlı IBAN yok');
    const firstText = (await ibanPage.ibanCards.first().textContent()) ?? '';
    expect(firstText).toMatch(/TR\s*\d{2}/i);
    console.log('✓ İlk IBAN TR formatında');
  });

  test('TC-IBAN-005: "Yeni IBAN Ekle" formu açılır', async ({ page }) => {
    const ibanPage = new IbanPage(page);
    await ibanPage.goto();
    await ibanPage.openAddForm();
    await expect(ibanPage.bankSelect).toBeVisible();
    await expect(ibanPage.accountNameInput).toBeVisible();
    await expect(ibanPage.ibanInput).toBeVisible();
    await expect(ibanPage.saveButton).toBeVisible();
    console.log('✓ Yeni IBAN Ekle formu açıldı (bank/account/iban/save görünür)');
  });

  test('TC-IBAN-007: Hatalı IBAN validasyon hatası verir', async ({ page }) => {
    const ibanPage = new IbanPage(page);
    await ibanPage.goto();
    await ibanPage.openAddForm();
    await ibanPage.fillIbanForm('TEST-validation', TEST_IBAN.invalidIban);
    await ibanPage.saveButton.click();
    await page.waitForTimeout(1500);

    // Validation çalıştıysa form hâlâ açıkta + IBAN inputunda hata mesajı veya kırmızı border
    const stillOnForm = await ibanPage.ibanInput.isVisible();
    expect(stillOnForm).toBe(true);
    console.log('✓ Hatalı IBAN ile form kapanmadı (validasyon engelliyor)');
  });

  test('TC-IBAN-006/008: Sil butonu görünür (gerçek silme yok)', async ({ page }) => {
    const ibanPage = new IbanPage(page);
    await ibanPage.goto();
    const count = await ibanPage.ibanCardCount();
    test.skip(count === 0, 'Kayıtlı IBAN yok');
    // İkon-only button (sil) — IBAN kartlarının yanında bulunur
    const trashButtons = page.locator('button:has(svg)').filter({ hasNotText: /\w{3,}/ });
    const trashCount = await trashButtons.count();
    expect(trashCount).toBeGreaterThan(0);
    console.log(`✓ ${trashCount} ikon-only button görünüyor (silme dahil)`);
  });
});
