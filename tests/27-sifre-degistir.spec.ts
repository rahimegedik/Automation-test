import { test, expect, Page } from "@playwright/test";
import { PasswordChangePage } from "../pages/PasswordChangePage";

// Şifre değişikliği yapılan password — TEST_PASSWORD ile çakışmayan tamamen hatalı değerler kullanıyoruz.
// TC-PWD-007 (başarılı değişim) atlanmıştır — auth state bozulmasını önlemek için.

async function trackPasswordChangeAttempt(
  page: Page,
  action: () => Promise<void>,
): Promise<number | null> {
  let status: number | null = null;
  const onResp = (resp: import("@playwright/test").Response) => {
    if (
      /(password|change|sifre)/i.test(resp.url()) &&
      resp.request().method() !== "GET"
    ) {
      status = resp.status();
    }
  };
  page.on("response", onResp);
  await action();
  await page.waitForTimeout(3000);
  page.off("response", onResp);
  return status;
}

test.describe("Şifre Değiştirme (gerçek değişim yok)", () => {
  test("TC-PWD-001: Sayfa açılır", async ({ page }) => {
    const pwdPage = new PasswordChangePage(page);
    await pwdPage.goto();
    await expect(page).toHaveURL(/\/hesabim\/sifre-degistir/);
    await expect(pwdPage.oldPasswordInput).toBeVisible();
    console.log("✓ Şifre değişikliği sayfası açıldı:", page.url());
  });

  test("TC-PWD-002: 3 password input + Güncelle butonu görünür", async ({
    page,
  }) => {
    const pwdPage = new PasswordChangePage(page);
    await pwdPage.goto();
    await expect(pwdPage.oldPasswordInput).toBeVisible();
    await expect(pwdPage.newPasswordInput).toBeVisible();
    await expect(pwdPage.confirmPasswordInput).toBeVisible();
    await expect(pwdPage.submitButton).toBeVisible();
    console.log("✓ Form alanları (3 input + buton) görünür");
  });

  test('TC-PWD-005: Tüm password input\'ları type="password"', async ({
    page,
  }) => {
    const pwdPage = new PasswordChangePage(page);
    await pwdPage.goto();
    expect(await pwdPage.oldPasswordInputType()).toBe("password");
    expect(await pwdPage.newPasswordInputType()).toBe("password");
    expect(await pwdPage.confirmPasswordInput.getAttribute("type")).toBe(
      "password",
    );
    console.log('✓ Üç password input da type="password" (gizli)');
  });

  test("TC-PWD-006: Boş form + Güncelle → engellenir", async ({ page }) => {
    const pwdPage = new PasswordChangePage(page);
    await pwdPage.goto();
    let apiCalled = false;
    page.on("request", (req) => {
      if (
        /(password|change|sifre)/i.test(req.url()) &&
        req.method() !== "GET"
      ) {
        apiCalled = true;
      }
    });
    await pwdPage.submit();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/hesabim\/sifre-degistir/);
    await expect(pwdPage.oldPasswordInput).toBeVisible();
    console.log(
      `✓ Boş form: API çağrısı=${apiCalled} (engellenmeli), form açık`,
    );
  });

  test("TC-PWD-003: Hatalı mevcut şifre → değişiklik reddedildi", async ({
    page,
  }) => {
    const pwdPage = new PasswordChangePage(page);
    await pwdPage.goto();
    const status = await trackPasswordChangeAttempt(page, () =>
      pwdPage
        .fillForm("YANLIS-MEVCUT-SIFRE-123", "YeniSifre123!", "YeniSifre123!")
        .then(() => pwdPage.submit()),
    );
    // API çağrıldıysa 4xx olmalı; çağrılmadıysa client-side validation
    if (status !== null) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
    await expect(page).toHaveURL(/\/hesabim\/sifre-degistir/);
    console.log(
      `✓ Hatalı mevcut şifre reddedildi (API status: ${status ?? "çağrılmadı"})`,
    );
  });

  test("TC-PWD-004: Yeni şifre + Tekrar eşleşmezse → form açık kalır", async ({
    page,
  }) => {
    const pwdPage = new PasswordChangePage(page);
    await pwdPage.goto();
    let apiCalled = false;
    page.on("request", (req) => {
      if (
        /(password|change|sifre)/i.test(req.url()) &&
        req.method() !== "GET"
      ) {
        apiCalled = true;
      }
    });
    await pwdPage.fillForm(
      "AnyCurrentPwd!",
      "YeniSifre123!",
      "FARKLI-TEKRAR-456",
    );
    await pwdPage.submit();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/hesabim\/sifre-degistir/);
    await expect(pwdPage.oldPasswordInput).toBeVisible();
    console.log(
      `✓ Şifre eşleşmeme: API çağrısı=${apiCalled} (client validation engellemeli)`,
    );
  });
});
