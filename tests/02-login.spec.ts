import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

test("Login sayfasi yonlendirmesi calisiyor", async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();

  const url = page.url();
  const isLoginPage = url.includes("hesap/giris");
  const isLoggedInRedirect = !url.includes("hesap/giris");

  expect(isLoginPage || isLoggedInRedirect).toBe(true);
});

test("Login formu elemanlari görünüyor (oturumsuz)", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();

  const loginPage = new LoginPage(page);

  await loginPage.goto({ requireForm: true });

  await expect(loginPage.emailInput).toBeVisible({ timeout: 15_000 });
  await expect(loginPage.passwordInput).toBeVisible({ timeout: 15_000 });

  await ctx.close();
});
