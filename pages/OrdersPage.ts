import { Page } from '@playwright/test';

export class OrdersPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    // networkidle prod'da flaky timeout'a yol açıyor → domcontentloaded + heading beklemesi.
    await this.page.goto('/hesabim/siparislerim', { waitUntil: 'domcontentloaded' });
    await this.page.getByRole('heading').first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  isAuthenticated(): boolean {
    return !this.page.url().includes('hesap/giris');
  }
}
