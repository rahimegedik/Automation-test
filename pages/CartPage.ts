import { Page, Locator } from "@playwright/test";

export class CartPage {
  readonly page: Page;
  readonly closeSidebarButton: Locator;
  readonly deleteButtons: Locator;
  readonly emptyCartMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.closeSidebarButton = page.getByRole("button", {
      name: "Hızlı Sepeti Kapat",
    });
    this.deleteButtons = page.getByRole("button", { name: /^Sil$/ });
    this.emptyCartMessage = page.getByText(
      /sepetiniz boş|no items|empty|ürün bulunmuyor/i,
    );
  }

  async goto() {
    await this.page.goto("/sepet");
    await this.page.waitForLoadState("networkidle");
  }

  async waitForSidebar(timeout = 5000): Promise<boolean> {
    return this.closeSidebarButton
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);
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

  async deleteButtonCount(): Promise<number> {
    return this.deleteButtons.count();
  }

  async hasPriceText(): Promise<boolean> {
    return this.page.evaluate(() =>
      /\d[\d.,]+\s*TL/.test(document.body.textContent || ""),
    );
  }

  async isCartEmpty(): Promise<boolean> {
    return this.emptyCartMessage.isVisible().catch(() => false);
  }

  async clearAll() {
    await this.page.goto("/sepet");
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForTimeout(1500);

    let safety = 15;
    while (safety-- > 0) {
      const count = await this.deleteButtons.count();
      if (count === 0) break;
      // JS click — sidebar/overlay görünürlük kontrolünü bypass et
      await this.deleteButtons
        .first()
        .evaluate((el) => (el as HTMLElement).click())
        .catch(() => {});
      await this.page.waitForTimeout(800);
    }
  }
}
