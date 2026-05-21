import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { CartPage } from '../pages/CartPage';
import { OrdersPage } from '../pages/OrdersPage';
import { ProfilePage } from '../pages/ProfilePage';
import { CheckoutPage } from '../pages/CheckoutPage';


test('Kullanıcı yolculuğu - Ziynet Altın Havale Baştan Sona', async ({ page }) => {
    test.setTimeout(300_000);

    const homePage = new HomePage(page);
    const cartPage = new CartPage(page);
    const ordersPage = new OrdersPage(page);
    const checkoutPage = new CheckoutPage(page);
    const profilePage = new ProfilePage(page);

    await test.step('1. Ana sayfayı aç ve sepeti temizle', async () => {
        await homePage.goto();
        await expect(page).toHaveURL(/nadirgold\.work/);
        await expect(page.locator('body')).toBeVisible();

        await cartPage.clearAll();
        await homePage.goto();

        console.log('✓ Ana sayfa açıldı ve sepet temizlendi:', page.url());
    });

    await test.step('2. Popup varsa kapat', async () => {
        const closed = await homePage.closePopupIfVisible();
        console.log(closed ? '✓ Popup kapatıldı' : 'ℹ Popup görünmüyor, devam ediliyor');
    });

    await test.step('3. ZİYNET ALTIN kategorisine git', async () => {
        await page.getByRole('link', { name: 'ZİYNET ALTIN' }).click();

        // Dengage push notification overlay'i tıklamaları engelliyor — DOM'dan kaldır
        await page.evaluate(() => {
            document.querySelector('#dengage-push-prompt-container')?.remove();
        });

        const popupCloseButton = page.getByRole('button', { name: 'Popup kapat butonu' });
        if (await popupCloseButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await popupCloseButton.click();
        }

        await expect(page.locator('body')).toBeVisible();
        console.log('✓ Ziynet Altın sayfası açıldı:', page.url());
    });

    await test.step('4. Popup varsa kapat', async () => {
        const closed = await homePage.closePopupIfVisible();
        console.log(closed ? '✓ Popup kapatıldı' : 'ℹ Popup görünmüyor, devam ediliyor');
    });

    await test.step('5. Reşat Lira Altın 2022 Kulplu ürünü seç', async () => {
        await page.getByRole('link', { name: 'Reşat Lira Altın 2022 Kulplu' }).click();
        await page.waitForLoadState('networkidle').catch(() => { });
        await expect(page.locator('body')).toBeVisible();

        console.log('✓ Ürün detay sayfasına gidildi:', page.url());
    });

    await test.step('6. Popup varsa kapat', async () => {
        const closed = await homePage.closePopupIfVisible();
        console.log(closed ? '✓ Popup kapatıldı' : 'ℹ Popup görünmüyor, devam ediliyor');
    });

    await test.step('7. Sepete ekle', async () => {
        await page.locator('#add2CartButton').click();
        await page.waitForTimeout(1500);

        console.log('✓ Sepete ekle tıklandı');
    });

    await test.step('8. Checkout sayfasına geç', async () => {
        await page.goto('https://www.nadirgold.work/checkout', {
            waitUntil: 'networkidle',
            timeout: 15000,
        });
        await expect(page.locator('body')).toBeVisible();

        console.log('✓ Checkout sayfasına gidildi:', page.url());
    });

    await test.step('9. Banka Transfer sekmesini seç', async () => {
        await page.locator('button, div[role="tab"]').filter({ hasText: /Banka Transfer|Havale/i }).first().click();
        await page.waitForTimeout(500);

        console.log('✓ Banka Transfer sekmesi seçildi');
    });

    // ─── ADIM 10: Banka Transfer Seç ─────────────────────────────────────────────
    await test.step('10. Banka Transfer / Anında Ödeme seç', async () => {
        await checkoutPage.selectBankTransfer();
        console.log('✓ Banka Transfer sekmesi seçildi');
        await checkoutPage.selectFirstBank();
        console.log('✓ Ziraat Bankası seçildi');
    });

    // ─── ADIM 11: Sözleşmeyi Onayla ──────────────────────────────────────────────
    await test.step('11. Sözleşmeyi onayla', async () => {
        await checkoutPage.acceptAgreement();
        const isChecked = await checkoutPage.isAgreementChecked();
        console.log(`✓ Sözleşme onaylandı (checked: ${isChecked})`);
        expect(isChecked).toBe(true);
    });

    // ─── ADIM 12: Ödeme Yap ───────────────────────────────────────────────────────
    await test.step('12. Ödeme Yap butonuna tıkla', async () => {
        await checkoutPage.pay();
        console.log('✓ Ödeme Yap tıklandı, URL:', page.url());
        await expect(page.locator('body')).toBeVisible();
    });

    // ─── ADIM 13: Siparişlerim ────────────────────────────────────────────────────
    await test.step('13. Siparişlerim sayfasına bak', async () => {
        await ordersPage.goto();
        await expect(page).not.toHaveURL(/hesap\/giris/);
        await expect(page.locator('body')).toBeVisible();
        console.log('✓ Siparişlerim sayfası açıldı');
    });

    // ─── ADIM 14: Profil ──────────────────────────────────────────────────────────
    await test.step('14. Profil sayfasına bak', async () => {
        await profilePage.gotoSafe();
        await expect(page).not.toHaveURL(/hesap\/giris/);
        const inputs = await profilePage.inputCount();
        expect(inputs).toBeGreaterThan(0);
        console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
    });
});