import { Page, Locator } from '@playwright/test';

export class IbanPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addIbanButton: Locator;
  readonly ibanCards: Locator;
  readonly bankSelect: Locator;
  readonly accountNameInput: Locator;
  readonly ibanInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1, h2, h3, div').filter({ hasText: 'IBAN Bilgilerim' });
    this.addIbanButton = page.getByRole('button', { name: 'Yeni IBAN Ekle' });
    this.ibanCards = page.locator('div').filter({ hasText: /TR\s*\d{2}\s/i });
    this.bankSelect = page.locator('select[name="bank_id"]');
    this.accountNameInput = page.locator('input[name="account_name"]');
    this.ibanInput = page.locator('input[name="iban"]');
    this.saveButton = page.getByRole('button', { name: 'Kaydet' });
  }

  async goto() {
    await this.page.goto('/hesabim/iban', { waitUntil: 'domcontentloaded' });
    await this.addIbanButton.waitFor({ state: 'visible', timeout: 15_000 });
    // Popup gecikmeli açılıyor — açılmasına izin ver, sonra kapat
    await this.page.waitForTimeout(2500);
    await this.closeNotificationPopup();
  }

  async closeNotificationPopup() {
    for (let i = 0; i < 3; i++) {
      const dismissBtn = this.page.getByRole('button', { name: /Teşekkürler/i });
      if (await dismissBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await dismissBtn.click({ timeout: 3000 }).catch(() => {});
        await this.page.waitForTimeout(500);
      } else {
        // ESC ile genel popup kapat
        await this.page.keyboard.press('Escape').catch(() => {});
        break;
      }
    }
  }

  async openAddForm() {
    await this.closeNotificationPopup();
    await this.addIbanButton.scrollIntoViewIfNeeded();
    await this.addIbanButton.click();
    await this.ibanInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async ibanCardCount(): Promise<number> {
    return this.ibanCards.count();
  }

  async fillIbanForm(accountName: string, iban: string) {
    await this.accountNameInput.fill(accountName);
    await this.ibanInput.fill(iban);
  }
}
