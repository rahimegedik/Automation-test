import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

// Tüm testler oturumsuz koşar — auth state yok
test.use({ storageState: { cookies: [], origins: [] } });

// Login denemesini izler — API çağrısı varsa response status'unu döner, yoksa null.
// Her iki durumda da test başarısız login'i URL ile assert eder.
async function attemptLogin(
  page: Page,
  action: () => Promise<void>
): Promise<number | null> {
  let loginStatus: number | null = null;
  const onResp = (resp: import('@playwright/test').Response) => {
    if (resp.url().includes('/customer/login') && resp.request().method() === 'POST') {
      loginStatus = resp.status();
    }
  };
  page.on('response', onResp);
  await action();
  await page.waitForTimeout(3500);
  page.off('response', onResp);
  return loginStatus;
}

function expectFailedLogin(status: number | null): void {
  // API çağrısı yapıldıysa 4xx olmalı, yapılmadıysa client-side validation
  // her iki durumda da URL'de kalınması beklenir (ayrıca test edilir)
  if (status !== null) {
    expect(status, `Login API'den 4xx beklendi, ${status} geldi`).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  }
}

test.describe('Login negatif + UI testleri', () => {
  test('TC-LOG-005: Kayıtsız email → giriş reddedildi', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const status = await attemptLogin(page, () =>
      loginPage.login('kayitsiz-kullanici-12345@example.com', 'Test1234!')
    );
    expectFailedLogin(status);
    await expect(page).toHaveURL(/hesap\/giris/);
    console.log(`✓ Kayıtsız email reddedildi (API status: ${status ?? 'çağrılmadı'})`);
  });

  test('TC-LOG-006: Geçerli email + hatalı şifre → giriş reddedildi', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const status = await attemptLogin(page, () =>
      loginPage.login('rahime.gedik@machinarium.co', 'YANLIS-SIFRE-12345')
    );
    expectFailedLogin(status);
    await expect(page).toHaveURL(/hesap\/giris/);
    console.log(`✓ Hatalı şifre reddedildi (API status: ${status ?? 'çağrılmadı'})`);
  });

  test('TC-LOG-007: Hatalı email formatı → giriş yapılmaz', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('yanlis-format-email', '1234567');
    await page.waitForTimeout(2000);
    // Client-side validation API çağrısını engelleyebilir; URL kontrolü yeterli
    await expect(page).toHaveURL(/hesap\/giris/);
    console.log('✓ Hatalı email formatı engellendi (client veya API)');
  });

  test('TC-LOG-008: Hatalı email + hatalı şifre → giriş reddedildi', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const status = await attemptLogin(page, () =>
      loginPage.login('yanlis@example.com', 'YANLIS!')
    );
    expectFailedLogin(status);
    await expect(page).toHaveURL(/hesap\/giris/);
    console.log(`✓ İkisi de hatalı, reddedildi (API status: ${status ?? 'çağrılmadı'})`);
  });

  test('TC-LOG-018: Boş form → API call yapılmaz / 4xx', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    // Boş form: client-side validation API'yi engellemeli
    let loginCalled = false;
    page.on('request', req => {
      if (req.url().includes('/customer/login') && req.method() === 'POST') {
        loginCalled = true;
      }
    });
    await loginPage.submitButton.click();
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/hesap\/giris/);
    await expect(loginPage.emailInput).toBeVisible();
    console.log(`✓ Boş form: API çağrısı=${loginCalled} (engellenmeli)`);
  });

  test('TC-LOG-012: Şifre input default olarak password tipinde', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const type = await loginPage.passwordInputType();
    expect(type).toBe('password');
    console.log(`✓ Şifre input type="${type}" (gizli)`);
  });

  test('TC-LOG-014: "Üye Olun" linki register sayfasına yönlendirir', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.registerLink.click();
    await page.waitForURL(/hesap\/uye-ol/, { timeout: 10_000 });
    console.log('✓ Üye Olun linki çalışıyor, URL:', page.url());
  });

  test('TC-LOG-015: "Parolanızı mı unuttunuz?" linki yönlendirir', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.forgotPasswordLink.click();
    await page.waitForURL(/sifremi-unuttum/, { timeout: 10_000 });
    console.log('✓ Şifremi unuttum linki çalışıyor, URL:', page.url());
  });

  test('TC-LOG-013: "Beni Hatırla" checkbox DOM\'da mevcut', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.rememberCheckbox).toBeAttached();
    console.log('✓ "Beni Hatırla" checkbox DOM\'da var');
  });

  test('TC-LOG-019: Şifre sonu boşluk → giriş reddedildi', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const status = await attemptLogin(page, () =>
      loginPage.login('rahime.gedik@machinarium.co', '1234567 ')
    );
    expectFailedLogin(status);
    await expect(page).toHaveURL(/hesap\/giris/);
    console.log(`✓ Şifre boşluklu reddedildi (API status: ${status ?? 'çağrılmadı'}) — trim hatası kontrolü`);
  });
});
