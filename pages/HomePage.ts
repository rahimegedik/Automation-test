import { Page, Locator } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly popupCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.popupCloseButton = page.getByRole("button", {
      name: "Popup kapat butonu",
    });
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  categoryLink(name: string): Locator {
    return this.page.getByRole("link", { name, exact: true });
  }

  async closePopupIfVisible(): Promise<boolean> {
    const visible = await this.popupCloseButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (visible) {
      await this.popupCloseButton.click();
      await this.page.waitForTimeout(600);
    }
    return visible;
  }
}
