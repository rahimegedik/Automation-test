import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly rememberCheckbox: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;
  readonly passwordEyeIcon: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="username"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.rememberCheckbox = page.locator('input[name="remember"]');
    this.submitButton = page.getByRole('button', { name: /Giriş Yap/i });
    this.forgotPasswordLink = page.getByRole('link', { name: /Parolanızı mı unuttunuz/i });
    this.registerLink = page.getByRole('link', { name: /Üye Olun/i });
    this.passwordEyeIcon = page
      .locator('input[name="password"]')
      .locator('xpath=following-sibling::*//*[name()="svg"] | ../*//*[name()="svg"]')
      .first();
  }

  async goto() {
    await this.page.goto('/hesap/giris', { waitUntil: 'domcontentloaded' });
    await this.emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    await this.acceptCookiesIfVisible();
  }

  async acceptCookiesIfVisible() {
    const cookieBtn = this.page.getByRole('button', { name: /Kabul Et/i });
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async fillForm(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async login(email: string, password: string) {
    await this.fillForm(email, password);
    await this.submit();
  }

  async assertOpened() {
    await expect(this.page).toHaveURL(/hesap\/giris/);
  }

  async passwordInputType(): Promise<string> {
    return (await this.passwordInput.getAttribute('type')) ?? '';
  }
}
