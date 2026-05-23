import { test, expect } from '@playwright/test';
import { NotificationsPage } from '../pages/NotificationsPage';

test.describe('Duyuru Tercihleri', () => {
  test('TC-NOTIF-001: Sayfa açılır', async ({ page }) => {
    const notifPage = new NotificationsPage(page);
    await notifPage.goto();
    await expect(page).toHaveURL(/\/hesabim\/duyurular/);
    await expect(notifPage.smsSwitch).toBeAttached();
    await expect(notifPage.emailSwitch).toBeAttached();
    console.log('✓ Duyuru Tercihleri sayfası açıldı:', page.url());
  });

  test('TC-NOTIF-002: SMS ve Email switch DOM\'da', async ({ page }) => {
    const notifPage = new NotificationsPage(page);
    await notifPage.goto();
    await expect(notifPage.smsSwitch).toBeAttached();
    await expect(notifPage.emailSwitch).toBeAttached();
    console.log('✓ İki switch (SMS + Email) DOM\'da mevcut');
  });

  test('TC-NOTIF-003: SMS switch başlangıç durumu okunabilir', async ({ page }) => {
    const notifPage = new NotificationsPage(page);
    await notifPage.goto();
    const enabled = await notifPage.isEnabled('sms');
    expect(typeof enabled).toBe('boolean');
    console.log(`✓ SMS switch okundu: enabled=${enabled}`);
  });

  test('TC-NOTIF-004: Email switch başlangıç durumu okunabilir', async ({ page }) => {
    const notifPage = new NotificationsPage(page);
    await notifPage.goto();
    const enabled = await notifPage.isEnabled('email');
    expect(typeof enabled).toBe('boolean');
    console.log(`✓ Email switch okundu: enabled=${enabled}`);
  });
});
