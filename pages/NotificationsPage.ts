import { Page, Locator } from '@playwright/test';

export type NotificationChannel = 'sms' | 'email';

export class NotificationsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly smsSwitch: Locator;
  readonly emailSwitch: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Duyuru Tercihlerim', { exact: true }).first();
    this.smsSwitch = page.locator('input[name="sms"][type="checkbox"]');
    this.emailSwitch = page.locator('input[name="email"][type="checkbox"]');
  }

  async goto() {
    await this.page.goto('/hesabim/duyurular', { waitUntil: 'domcontentloaded' });
    await this.smsSwitch.waitFor({ state: 'attached', timeout: 15_000 });
  }

  private switchFor(channel: NotificationChannel): Locator {
    return channel === 'sms' ? this.smsSwitch : this.emailSwitch;
  }

  async isEnabled(channel: NotificationChannel): Promise<boolean> {
    return this.switchFor(channel).isChecked();
  }

  async toggle(channel: NotificationChannel): Promise<void> {
    const sw = this.switchFor(channel);
    const before = await sw.isChecked();
    // sr-only input — native DOM click React onChange'i tetikler
    await sw.evaluate((el: HTMLInputElement) => el.click());
    await this.page.waitForTimeout(800);
    const after = await sw.isChecked();
    if (before === after) {
      throw new Error(`${channel} switch toggle başarısız (önce: ${before}, sonra: ${after})`);
    }
  }

  async setEnabled(channel: NotificationChannel, target: boolean): Promise<void> {
    const current = await this.isEnabled(channel);
    if (current !== target) {
      await this.toggle(channel);
    }
  }
}
