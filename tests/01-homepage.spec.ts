import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/HomePage";

test("Homepage - sayfa basarili aciliyor", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  await expect(page).toHaveURL(/nadirgold\.work/);
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
