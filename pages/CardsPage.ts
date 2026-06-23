import { Page, Locator } from "@playwright/test";

export class CardsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addCardButton: Locator;
  readonly cardContainers: Locator;
  readonly deleteIcons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .getByRole("heading", { name: "Kayıtlı Kartlarım" })
      .or(page.locator("h1, h2").filter({ hasText: "Kayıtlı Kartlarım" }))
      .first();
    this.addCardButton = page.getByRole("button", { name: "Yeni Kart Ekle" });
    // Kart kartları — masked kart numarası (örn. "474480*******0003") içeren container'lar
    this.cardContainers = page.locator("div").filter({
      hasText: /\d{6}\*+\d{4}/,
    });
    this.deleteIcons = page
      .locator("button:has(svg)")
      .filter({ hasNotText: /\w/ });
  }

  async goto() {
    await this.page.goto("/hesabim/kartlarim", {
      waitUntil: "domcontentloaded",
    });
    await this.addCardButton.waitFor({ state: "visible", timeout: 15_000 });
  }

  async cardCount(): Promise<number> {
    return this.cardContainers.count();
  }

  async getCardText(index = 0): Promise<string> {
    const card = this.cardContainers.nth(index);
    return (await card.textContent()) ?? "";
  }

  async hasBankFallback(index = 0): Promise<boolean> {
    const text = await this.getCardText(index);
    return text.includes("Bankanız");
  }

  async hasMaskedNumber(index = 0): Promise<boolean> {
    const text = await this.getCardText(index);
    return /\d{6}\*+\d{4}/.test(text);
  }

  async hasExpiry(index = 0): Promise<boolean> {
    const text = await this.getCardText(index);
    return /\d{1,2}\s*\/\s*\d{2,4}/.test(text);
  }
}
