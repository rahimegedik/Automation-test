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
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  categoryLink(name: string): Locator {
    return this.page.getByRole("link", { name, exact: true });
  }

  async closePopupIfVisible(): Promise<boolean> {
    await this.page.evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    });

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
