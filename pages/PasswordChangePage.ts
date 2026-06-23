import { Page, Locator } from "@playwright/test";

export class PasswordChangePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly oldPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .locator("h1, h2, h3, div")
      .filter({ hasText: "Şifre Değişikliği" });
    this.oldPasswordInput = page.locator('input[name="oldPassword"]');
    this.newPasswordInput = page.locator('input[name="newPassword"]');
    this.confirmPasswordInput = page.locator(
      'input[name="passwordConfirmation"]',
    );
    this.submitButton = page.getByRole("button", { name: "Güncelle" });
  }

  async goto() {
    await this.page.goto("/hesabim/sifre-degistir", {
      waitUntil: "domcontentloaded",
    });
    await this.oldPasswordInput.waitFor({ state: "visible", timeout: 15_000 });
    await this.page.waitForTimeout(2500);
    await this.closeNotificationPopup();
  }

  async closeNotificationPopup() {
    for (let i = 0; i < 3; i++) {
      const dismissBtn = this.page.getByRole("button", {
        name: /Teşekkürler/i,
      });
      if (await dismissBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await dismissBtn.click({ timeout: 3000 }).catch(() => {});
        await this.page.waitForTimeout(500);
      } else {
        await this.page.keyboard.press("Escape").catch(() => {});
        break;
      }
    }
  }

  async fillForm(current: string, next: string, confirm: string) {
    await this.oldPasswordInput.fill(current);
    await this.newPasswordInput.fill(next);
    await this.confirmPasswordInput.fill(confirm);
  }

  async submit() {
    await this.submitButton.click();
  }

  async oldPasswordInputType(): Promise<string> {
    return (await this.oldPasswordInput.getAttribute("type")) ?? "";
  }

  async newPasswordInputType(): Promise<string> {
    return (await this.newPasswordInput.getAttribute("type")) ?? "";
  }
}
