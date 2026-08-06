import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";

test("Homepage - sayfa basarili aciliyor", async ({ page, baseURL }) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  const host = new URL(baseURL!).hostname.replace(/^www\./, "");
  await expect(page).toHaveURL(new RegExp(host.replace(/\./g, "\\.")));
  await expect(page.locator("body")).toBeVisible();
});

test("Homepage - sayfa basligi var", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  await expect(page).toHaveTitle(/.+/);
});

test("Homepage - login sayfasina yonlendirme yok (oturum gecerli)", async ({
  page,
}) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  await expect(page).not.toHaveURL(/hesap\/giris/);
});
