import { Page } from "@playwright/test";

export class OrdersPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    // networkidle prod'da flaky timeout'a yol açıyor → domcontentloaded + load.
    // Not: sayfada heading rolü yok ("Siparişlerim" link/text), bu yüzden element beklemesi yok.
    await this.page.goto("/hesabim/siparislerim", {
      waitUntil: "domcontentloaded",
    });
    await this.page.waitForLoadState("load").catch(() => {});
  }

  isAuthenticated(): boolean {
    return !this.page.url().includes("hesap/giris");
  }
}
