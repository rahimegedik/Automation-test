import { Page, Locator } from "@playwright/test";

export class CategoryPage {
  readonly page: Page;
  readonly productLinks: Locator;
  readonly closeSidebarButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productLinks = page.getByRole("link", { name: /ürünü incele/i });
    this.closeSidebarButton = page.getByRole("button", {
      name: "Hızlı Sepeti Kapat",
    });
  }

  async goto(slug = "kulce-altin") {
    await this.page.goto(`/${slug}`);
    await this.page.waitForLoadState("networkidle");
  }

  async closeSidebarIfOpen(): Promise<boolean> {
    const open = await this.closeSidebarButton
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (open) {
      await this.closeSidebarButton.evaluate((el) =>
        (el as HTMLElement).click(),
      );
      await this.page.waitForTimeout(500);
    }
    return open;
  }

  async waitForProducts(timeout = 10_000) {
    await this.productLinks.first().waitFor({ state: "visible", timeout });
  }

  async productCount(): Promise<number> {
    return this.productLinks.count();
  }

  async getFirstProductUrl(): Promise<string> {
    const href = await this.productLinks.first().getAttribute("href");
    return href?.startsWith("http")
      ? href
      : `https://www.nadirgold.work${href}`;
  }
}
