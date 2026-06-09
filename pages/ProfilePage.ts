import { Page, Locator } from "@playwright/test";

export class ProfilePage {
  readonly page: Page;
  readonly inputs: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inputs = page.locator("input");
  }

  async goto() {
    await this.page.goto("/hesabim/uyelik");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoSafe() {
    await this.page.waitForTimeout(2000);
    await this.page
      .goto("/hesabim/uyelik", { waitUntil: "domcontentloaded" })
      .catch(() => {});
    await this.page.waitForLoadState("networkidle").catch(() => {});
  }

  isAuthenticated(): boolean {
    return !this.page.url().includes("hesap/giris");
  }

  async inputCount(): Promise<number> {
    return this.inputs.count();
  }
}
