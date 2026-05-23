import { Page, Locator } from '@playwright/test';

export class AddressPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addAddressButton: Locator;
  readonly addressCards: Locator;
  readonly deleteButtons: Locator;
  readonly editButtons: Locator;

  readonly addressNameInput: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly phoneInput: Locator;
  readonly tcknInput: Locator;
  readonly citySelect: Locator;
  readonly countySelect: Locator;
  readonly districtSelect: Locator;
  readonly addressTextInput: Locator;
  readonly postalCodeInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1, h2, h3, div').filter({ hasText: /Kayıtlı Adres|Adreslerim/i });
    this.addAddressButton = page.getByRole('button', { name: 'Yeni Adres Ekle' });
    this.addressCards = page.locator('div').filter({ hasText: /MAHALLE|MAH\.|SOKAK|CAD\.|CADDESİ/i });
    this.deleteButtons = page.getByRole('button', { name: 'Sil', exact: true });
    this.editButtons = page.getByRole('button', { name: 'Adresi Düzenle' });

    this.addressNameInput = page.locator('input[name="addressName"]');
    this.firstNameInput = page.locator('input[name="firstName"]');
    this.lastNameInput = page.locator('input[name="lastName"]');
    this.phoneInput = page.locator('input[name="telephone"]');
    this.tcknInput = page.locator('input[name="tckn"]');
    this.citySelect = page.locator('select[name="cityId"]');
    this.countySelect = page.locator('select[name="countyId"]');
    this.districtSelect = page.locator('select[name="districtId"]');
    this.addressTextInput = page.locator('input[name="address"]');
    this.postalCodeInput = page.locator('input[name="postalCode"]');
    this.saveButton = page.getByRole('button', { name: 'Adresi Kaydet' });
  }

  async goto() {
    await this.page.goto('/hesabim/adreslerim', { waitUntil: 'domcontentloaded' });
    await this.addAddressButton.waitFor({ state: 'visible', timeout: 15_000 });
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
        await this.page.keyboard.press('Escape').catch(() => {});
        break;
      }
    }
  }

  async openAddForm() {
    await this.closeNotificationPopup();
    await this.addAddressButton.scrollIntoViewIfNeeded();
    await this.addAddressButton.click();
    await this.addressNameInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async addressCardCount(): Promise<number> {
    return this.addressCards.count();
  }
}
