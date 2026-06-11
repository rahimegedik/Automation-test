import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { CartPage } from '../pages/CartPage';
import { OrdersPage } from '../pages/OrdersPage';
import { ProfilePage } from '../pages/ProfilePage';
import { CheckoutPage } from '../pages/CheckoutPage';


test('Kullanıcı yolculuğu - Hesaptan Fiziki Altına Baştan Sona', async ({ page }) => {
    test.setTimeout(300_000);

    const homePage = new HomePage(page);
    const cartPage = new CartPage(page);
    const ordersPage = new OrdersPage(page);
    const profilePage = new ProfilePage(page);
    const checkoutPage = new CheckoutPage(page);


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

    await test.step('3. HESAPTAN FİZİKİ ALTINA sayfasına git', async () => {
        await page.getByRole('link', { name: 'HESAPTAN FİZİKİ ALTINA' }).click();

        await page.evaluate(() => {
            document.querySelector('#dengage-push-prompt-container')?.remove();
        });

        const popupCloseButton = page.getByRole('button', { name: 'Popup kapat butonu' });
        if (await popupCloseButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await popupCloseButton.click();
        }

        await expect(page.locator('body')).toBeVisible();
        console.log('✓ Hesaptan Fiziki Altına sayfası açıldı:', page.url());
    });

    await test.step('4. NadirGold 1 Gr Külçe Altın ürününü seç', async () => {
        const productLink = page.getByRole('link', {
            name: /NadirGold 1 Gr Külçe Altın/i,
        }).first();

        await expect(productLink).toBeVisible({ timeout: 10_000 });
        await productLink.click();

        await page.waitForLoadState('domcontentloaded').catch(() => { });
        await page.waitForTimeout(1500);

        await expect(page.locator('body')).toBeVisible();

        console.log('✓ Ürün detay sayfasına gidildi:', page.url());
    });

    await test.step('5. Fiziki Altına Çevir butonuna tıkla', async () => {
        await page.evaluate(() => {
            document.querySelector('#dengage-push-prompt-container')?.remove();
        });

        const convertButton = page
            .getByRole('button', { name: /Fiziki Altına Çevir/i })
            .first();

        await expect(convertButton).toBeVisible({ timeout: 15000 });
        await convertButton.scrollIntoViewIfNeeded();

        await expect(convertButton).toBeEnabled({ timeout: 15000 });

        await convertButton.click({ force: true });

        await expect(
            page.getByRole('link', { name: /Sepete Git/i })
        ).toBeVisible({ timeout: 15000 });

        console.log('✓ Fiziki Altına Çevir tıklandı ve Sepete Git göründü');
    });

    await test.step('6. Sepete git', async () => {
        await page.getByRole('link', { name: 'Sepete Git' }).click();

        await page.waitForLoadState('networkidle').catch(() => { });
        await expect(page.locator('body')).toBeVisible();

        console.log('✓ Sepete gidildi:', page.url());
    });

    await test.step('7. Checkout sayfasına geç', async () => {
        await page.getByRole('link', { name: 'Devam et' }).click();

        await page.waitForLoadState('networkidle').catch(() => { });
        await expect(page).not.toHaveURL(/hesap\/giris/);
        await expect(page.locator('body')).toBeVisible();

        console.log('✓ Checkout sayfasına gidildi:', page.url());
    });

    await test.step('8. Adres / teslimat seç', async () => {
        await page.locator('.cursor-pointer.flex.items-center.gap-1 > .flex-shrink-0').first().click();
        await page.waitForTimeout(500);

        console.log('✓ Adres / teslimat seçildi');
    });

    await test.step('9. Ön bilgilendirme formunu onayla', async () => {
        await page.getByRole('checkbox', { name: 'Ön bilgilendirme formu ,' }).check();

        console.log('✓ Ön bilgilendirme formu onaylandı');
    });

    await test.step('10. Ödeme Yap butonuna tıkla', async () => {
        await checkoutPage.pay();
        console.log('✓ Ödeme Yap tıklandı, URL:', page.url());
        await expect(page.locator('body')).toBeVisible();
    });

    await test.step('11. Siparişlerim sayfasına bak', async () => {
        await ordersPage.goto();

        await expect(page).not.toHaveURL(/hesap\/giris/);
        await expect(page.locator('body')).toBeVisible();

        console.log('✓ Siparişlerim sayfası açıldı');
    });

    await test.step('12. Profil sayfasına bak', async () => {
        await profilePage.gotoSafe();

        await expect(page).not.toHaveURL(/hesap\/giris/);

        const inputs = await profilePage.inputCount();
        expect(inputs).toBeGreaterThan(0);

        console.log(`✓ Profil sayfası açıldı, ${inputs} form alanı görünüyor`);
    });
});