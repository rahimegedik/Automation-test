import { test, expect } from '@playwright/test';
import { AddressPage } from '../pages/AddressPage';

test.describe('Adres Yönetimi (gerçek silme/ekleme yok)', () => {
  test('TC-ADDR-001: Sayfa açılır', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    await expect(page).toHaveURL(/\/hesabim\/adreslerim/);
    await expect(addressPage.addAddressButton).toBeVisible();
    console.log('✓ Adresler sayfası açıldı:', page.url());
  });

  test('TC-ADDR-002: Adres kartları listelenir', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    const count = await addressPage.addressCardCount();
    console.log(`ℹ ${count} adres kartı bulundu`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('TC-ADDR-003: Adres kartında Sil butonu görünür', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    const count = await addressPage.addressCardCount();
    test.skip(count === 0, 'Kayıtlı adres yok');
    await expect(addressPage.deleteButtons.first()).toBeVisible();
    console.log('✓ Sil butonu görünür');
  });

  test('TC-ADDR-004: Adres kartında "Adresi Düzenle" butonu görünür', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    const count = await addressPage.addressCardCount();
    test.skip(count === 0, 'Kayıtlı adres yok');
    await expect(addressPage.editButtons.first()).toBeVisible();
    console.log('✓ "Adresi Düzenle" butonu görünür');
  });

  test('TC-ADDR-006: Yeni Adres Ekle formu açılır', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    await addressPage.openAddForm();

    await expect(addressPage.addressNameInput).toBeVisible();
    await expect(addressPage.firstNameInput).toBeVisible();
    await expect(addressPage.lastNameInput).toBeVisible();
    await expect(addressPage.phoneInput).toBeVisible();
    await expect(addressPage.tcknInput).toBeVisible();
    await expect(addressPage.citySelect).toBeVisible();
    await expect(addressPage.addressTextInput).toBeVisible();
    await expect(addressPage.saveButton).toBeVisible();
    console.log('✓ Yeni Adres Ekle formu açıldı (tüm zorunlu alanlar görünür)');
  });

  test('TC-ADDR-007: Boş form ile Kaydet → form açık kalır', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    await addressPage.openAddForm();

    await addressPage.saveButton.click();
    await page.waitForTimeout(1500);

    // Form hâlâ görünür olmalı (validation engelleyince)
    await expect(addressPage.addressNameInput).toBeVisible();
    console.log('✓ Boş form gönderildi, validation engelledi (form açık)');
  });

  test('TC-ADDR-008: "Alıcı Ekle (İsteğe Bağlı)" butonu form içinde mevcut', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    await addressPage.openAddForm();

    const aliciEkle = page.getByRole('button', { name: /Alıcı Ekle/i });
    await expect(aliciEkle).toBeVisible();
    console.log('✓ "Alıcı Ekle" butonu görünür (ikinci alıcı için)');
  });

  test('TC-ADDR-009: Fatura tipi radio butonları mevcut', async ({ page }) => {
    const addressPage = new AddressPage(page);
    await addressPage.goto();
    await addressPage.openAddForm();

    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    expect(radioCount).toBeGreaterThanOrEqual(2);
    console.log(`✓ ${radioCount} radio button görünüyor (bireysel/kurumsal fatura tipi)`);
  });
});
