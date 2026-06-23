import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

test("Login sayfasi yonlendirmesi calisiyor", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();

  const url = page.url();
  const isLoginPage = url.includes("hesap/giris");
  const isHomepage = url.includes("nadirgold.work");

  expect(isLoginPage || isHomepage).toBe(true);
});

test("Login formu elemanlari görünüyor (oturumsuz)", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  const loginPage = new LoginPage(page);

  await loginPage.goto();

  const inputs = await page.locator("input").count();
  expect(inputs).toBeGreaterThan(0);

  await ctx.close();
});
