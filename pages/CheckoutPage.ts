import { Page, Locator } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly bankTransferButton: Locator;
  readonly firstBankLabel: Locator;
  readonly agreementCheckbox: Locator;
  readonly payButton: Locator;
  readonly addressLabel: Locator;
  readonly paymentHeading: Locator;
  readonly creditCardButton: Locator;
  readonly savedCardsTab: Locator;
  readonly firstSavedCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bankTransferButton = page.getByRole('button', { name: /banka transfer/i });
    this.firstBankLabel = page.locator('label:has(input[name="bankId"])').first();
    this.agreementCheckbox = page.getByRole('checkbox', { name: 'Ön bilgilendirme formu ,' });
    this.payButton = page.getByRole('button', { name: /ödeme yap/i });
    this.addressLabel = page.getByText(/gönderim adresi|teslimat adresi|delivery address/i);
    this.paymentHeading = page.getByText(/ödeme seçenekleri|ödeme yöntemi|payment method/i);
    this.creditCardButton = page.getByRole('button', { name: /banka.*kredi kartı|kredi kartı/i });
    this.savedCardsTab = page.getByRole('button', { name: /kayıtlı kartlar/i });
    this.firstSavedCard = page.locator('[class*="card" i], [class*="kart" i]').filter({ hasText: /\d{4}/ }).first();
  }

  async goto() {
    // networkidle prod'da hiç gelmiyor (analytics/canlı fiyat/chat açık tutuyor) → flaky timeout.
    // domcontentloaded + anlamlı element beklemesine geçildi.
    await this.page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    await this.bankTransferButton.or(this.creditCardButton)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  }

  // Checkout açılışında öne gelen modal/overlay (fixed inset-0 z-[...]) tıklamayı engelleyebiliyor.
  private async dismissOverlay() {
    const overlay = this.page.locator('div.fixed.inset-0[class*="z-["]');
    if (await overlay.first().isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
      await overlay.first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
  }

  async selectBankTransfer() {
    await this.dismissOverlay();
    await this.bankTransferButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.bankTransferButton.click();
    await this.page.waitForTimeout(1000);
  }

  async selectFirstBank() {
    await this.firstBankLabel.waitFor({ state: 'visible', timeout: 8000 });
    await this.firstBankLabel.click();
    await this.page.waitForTimeout(500);
  }

  async acceptAgreement() {
    await this.agreementCheckbox.waitFor({ state: 'attached', timeout: 8000 });
    await this.agreementCheckbox.check();
    await this.page.waitForTimeout(500);
  }

  async isAgreementChecked(): Promise<boolean> {
    return this.agreementCheckbox.isChecked().catch(() => false);
  }

  async pay() {
    await this.payButton.waitFor({ state: 'visible', timeout: 10_000 });
    // Kredi kartında 3D Secure iframe aynı sayfada açılır, navigation olmayabilir
    await this.payButton.click();
    await this.page.waitForTimeout(2000);
  }

  async selectCreditCard() {
    await this.creditCardButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.creditCardButton.click();
    await this.page.waitForTimeout(1000);
  }

  async selectSavedCard() {
    await this.savedCardsTab.waitFor({ state: 'visible', timeout: 8000 });
    await this.savedCardsTab.click();
    await this.page.waitForTimeout(1000);
    // Kart zaten "Mevcut ödeme aracı" olarak seçili gelir, tıklamaya gerek yok
  }

  async enterOtp(otp: string) {
    // 3D Secure iframe aynı sayfa üzerinde modal olarak açılıyor
    const iframeEl = this.page.locator('iframe').nth(1);
    await iframeEl.waitFor({ state: 'attached', timeout: 30_000 });
    await this.page.waitForTimeout(1500);

    const frame = iframeEl.contentFrame();
    const otpInput = frame.getByRole('textbox').first();
    await otpInput.waitFor({ state: 'visible', timeout: 15_000 });
    await otpInput.click();
    await otpInput.pressSequentially(otp, { delay: 80 });
    await this.page.waitForTimeout(500);

    // button veya input[type=submit] ara — bank sayfalarında ikisi de olabilir
    const submitBtn = frame.locator('button, input[type="submit"], input[type="button"]').first();
    const btnVisible = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (btnVisible) {
      await submitBtn.click();
    } else {
      // Focus OTP alanındayken sayfaya Enter gönder
      await this.page.keyboard.press('Enter');
    }

    await this.page.waitForURL(/tebrikler|siparis/, { timeout: 30_000 }).catch(() => {});
    await this.page.waitForTimeout(2000);
  }
}
