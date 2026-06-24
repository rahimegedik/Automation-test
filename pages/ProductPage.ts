import { Page, Locator } from "@playwright/test";

export class ProductPage {
  readonly page: Page;
  readonly addToCartButton: Locator;
  readonly closeSidebarButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addToCartButton = page
      .getByRole("button", { name: /sepete ekle/i })
      .first();

    this.closeSidebarButton = page.getByRole("button", {
      name: "Hızlı Sepeti Kapat",
    });
  }

  async goto(url: string) {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  async selectOneTimePurchase() {
    const tab = this.page.getByText(/tek seferlik alım/i).first();

    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(300);
    }
  }

  async addToCart() {
    await this.selectOneTimePurchase();

    await this.addToCartButton.waitFor({ state: "visible", timeout: 10_000 });

    await this.addToCartButton.evaluate((el) => (el as HTMLElement).click());

    await this.page.waitForTimeout(1500);
  }

  async closeSidebarIfOpen(): Promise<boolean> {
    const open = await this.closeSidebarButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (open) {
      await this.closeSidebarButton.evaluate((el) =>
        (el as HTMLElement).click(),
      );
      await this.page.waitForTimeout(500);
    }

    return open;
  }
}
