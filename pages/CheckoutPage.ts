import { Page, Locator, expect } from "@playwright/test";

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

  constructor(page: Page) {
    this.page = page;

    this.bankTransferButton = page
      .locator('button, div[role="tab"]')
      .filter({ hasText: /Banka Transfer|Havale|EFT/i })
      .first();

    this.firstBankLabel = page
      .locator('label:has(input[name="bankId"])')
      .first();

    this.agreementCheckbox = page.getByRole("checkbox", {
      name: /Ön bilgilendirme formu/i,
    });

    this.payButton = page.getByRole("button", { name: /ÖDEME YAP|Ödeme Yap/i });

    this.addressLabel = page.getByText(
      /gönderim adresi|teslimat adresi|delivery address|adres/i,
    );

    this.paymentHeading = page.getByText(
      /ödeme seçenekleri|ödeme yöntemi|payment method|banka|kredi kartı/i,
    );

    this.creditCardButton = page.getByRole("button", {
      name: /Banka \/ Kredi Kartı İle Ödeme|kredi kartı|banka.*kredi/i,
    });

    this.savedCardsTab = page.getByRole("button", {
      name: /kayıtlı kartlar|mevcut ödeme aracı|kart/i,
    });
  }

  async goto() {
    await this.page.goto("/checkout", { waitUntil: "domcontentloaded" });
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  private async dismissOverlay() {
    await this.page.evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    });

    const popupCloseButton = this.page.getByRole("button", {
      name: "Popup kapat butonu",
    });

    if (
      await popupCloseButton.isVisible({ timeout: 2000 }).catch(() => false)
    ) {
      await popupCloseButton.click().catch(() => {});
    }

    const overlay = this.page.locator('div.fixed.inset-0[class*="z-["]');

    if (
      await overlay
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false)
    ) {
      await this.page.keyboard.press("Escape");
      await overlay
        .first()
        .waitFor({ state: "hidden", timeout: 5000 })
        .catch(() => {});
    }
  }

  async selectBankTransfer() {
    await this.dismissOverlay();

    await expect(this.bankTransferButton).toBeVisible({ timeout: 15_000 });
    await this.bankTransferButton.click();

    await this.page.waitForTimeout(1000);
  }

  async selectFirstBank() {
    const labelBank = this.firstBankLabel;

    if (await labelBank.isVisible({ timeout: 5000 }).catch(() => false)) {
      await labelBank.click();
      await this.page.waitForTimeout(500);
      return;
    }

    const customBank = this.page
      .locator(".cursor-pointer.flex.items-center.gap-3 > .flex-shrink-0")
      .first();

    await expect(customBank).toBeVisible({ timeout: 15_000 });
    await customBank.click();

    await this.page.waitForTimeout(500);
  }

  async acceptAgreement() {
    const roleCheckbox = this.agreementCheckbox;

    if (await roleCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
      if (!(await roleCheckbox.isChecked().catch(() => false))) {
        await roleCheckbox.check({ force: true }).catch(async () => {
          await roleCheckbox.click({ force: true });
        });
      }

      await this.page.waitForTimeout(500);
      return;
    }

    const customAgreement = this.page
      .locator("label")
      .filter({ hasText: "Ön bilgilendirme formu" })
      .locator(".flex-shrink-0")
      .first();

    await expect(customAgreement).toBeVisible({ timeout: 15_000 });
    await customAgreement.click();

    await this.page.waitForTimeout(500);
  }

  async isAgreementChecked(): Promise<boolean> {
    if (
      await this.agreementCheckbox
        .isVisible({ timeout: 1000 })
        .catch(() => false)
    ) {
      return this.agreementCheckbox.isChecked().catch(() => false);
    }

    return true;
  }

  async pay() {
    await this.dismissOverlay();

    await expect(this.payButton).toBeVisible({ timeout: 15_000 });
    await expect(this.payButton).toBeEnabled({ timeout: 15_000 });

    await this.payButton.click();

    await this.page.waitForTimeout(2000);
  }

  async selectCreditCard() {
    await this.dismissOverlay();

    await expect(this.creditCardButton).toBeVisible({ timeout: 15_000 });
    await expect(this.creditCardButton).toBeEnabled({ timeout: 15_000 });

    await this.creditCardButton.click();

    await this.page.waitForTimeout(1000);
  }

  async selectSavedCard() {
    if (
      await this.savedCardsTab.isVisible({ timeout: 3000 }).catch(() => false)
    ) {
      await this.savedCardsTab.click();
      await this.page.waitForTimeout(1000);
    }

    const savedCardOption = this.page
      .locator(".cursor-pointer.flex.items-center.gap-3 > .flex-shrink-0")
      .first();

    if (await savedCardOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await savedCardOption.scrollIntoViewIfNeeded();
      await savedCardOption.click();
      await this.page.waitForTimeout(500);
      return;
    }

    console.log(
      "ℹ Kayıtlı kart seçimi görünmedi; mevcut kart zaten seçili olabilir.",
    );
  }

  async enterOtp(otp: string) {
    const iframeEl = this.page.locator("iframe").nth(1);

    await iframeEl.waitFor({ state: "attached", timeout: 30_000 });

    const frame = iframeEl.contentFrame();

    await frame
      .getByRole("textbox")
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });

    const digits = otp.split("");

    for (let i = 0; i < digits.length; i++) {
      await frame.getByRole("textbox").nth(i).fill(digits[i]);
    }

    const submitBtn = frame
      .locator('button, input[type="submit"], input[type="button"]')
      .first();

    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await this.page.keyboard.press("Enter");
    }

    await this.page
      .waitForURL(/tebrikler|siparis/, { timeout: 30_000 })
      .catch(() => {});

    await this.page.waitForTimeout(2000);
  }
}
