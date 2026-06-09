import { test, expect } from "@playwright/test";
import { ProfilePage } from "../pages/ProfilePage";

test("Profil sayfasi aciliyor", async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  await expect(page).not.toHaveURL(/hesap\/giris/);
  await expect(page.locator("body")).toBeVisible();
});

test("Profil sayfasinda form elemanlari var", async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  const inputs = await profilePage.inputCount();
  expect(inputs).toBeGreaterThan(0);
});
