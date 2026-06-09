import { test, expect } from "@playwright/test";
import { OrdersPage } from "../pages/OrdersPage";

test("Siparisler sayfasi aciliyor", async ({ page }) => {
  const ordersPage = new OrdersPage(page);
  await ordersPage.goto();

  await expect(page).not.toHaveURL(/hesap\/giris/);
  await expect(page.locator("body")).toBeVisible();
});

test("Siparisler sayfasinda buyuk JS hatalari yok", async ({ page }) => {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("email-decode")) {
      errors.push(msg.text());
    }
  });

  const ordersPage = new OrdersPage(page);
  await ordersPage.goto();

  const criticalErrors = errors.filter((e) => !e.includes("querySelectorAll"));
  expect(criticalErrors.length).toBe(0);
});
