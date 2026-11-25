import { Page, Locator } from "@playwright/test";

export class CategoryPage {
  readonly page: Page;
  readonly productLinks: Locator;
  readonly closeSidebarButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productLinks = page.getByRole("link", { name: /ürünü incele/i });
    this.closeSidebarButton = page.getByRole("button", {
      name: "Hızlı Sepeti Kapat",
    });
  }

  async goto(slug = "kulce-altin") {
    await this.page.goto(`/${slug}`, { waitUntil: "domcontentloaded" });
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  async closeSidebarIfOpen(): Promise<boolean> {
    const open = await this.closeSidebarButton
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (open) {
      await this.closeSidebarButton.evaluate((el) =>
        (el as HTMLElement).click(),
      );
      await this.page.waitForTimeout(500);
    }

    return open;
  }

  async waitForProducts(timeout = 10_000) {
    await this.productLinks.first().waitFor({ state: "visible", timeout });
  }

  async productCount(): Promise<number> {
    return this.productLinks.count();
  }

  async getFirstProductUrl(): Promise<string> {
    const href = await this.productLinks.first().getAttribute("href");

    if (!href) {
      throw new Error("İlk ürün linkinin href değeri bulunamadı.");
    }

    return new URL(href, this.page.url()).toString();
  }

  /**
   * Kartındaki buton etkin "Sepete Ekle" olan (yani "Yakında Stokta" olmayan)
   * ilk ürünün mutlak URL'i. Dev'de stok sık değiştiği için journey'ler sabit
   * ürün yerine bunu kullanmalı. `exclude` ile isim deseni dışlanabilir.
   */
  async getFirstInStockProductUrl(exclude?: RegExp): Promise<string> {
    await this.waitForProducts(15_000);
    // Hydration öncesi kart butonları pasif render edilebiliyor → tek seferlik
    // tarama yanlış STOK_DURDU veriyordu (24.11 TC-03). ~12 sn boyunca yeniden tara.
    for (let i = 0; i < 6; i++) {
      const url = await this.scanInStock(exclude).catch(() => null);
      if (url) return url;
      await this.page.waitForTimeout(2_000);
    }
    return this.scanInStock(exclude);
  }

  private async scanInStock(exclude?: RegExp): Promise<string> {
    const candidates = await this.productLinks.evaluateAll((links) =>
      links.map((a) => {
        let card: HTMLElement | null = a.parentElement;
        while (card && !card.querySelector("button")) card = card.parentElement;
        const btn = card?.querySelector("button") as HTMLButtonElement | null;
        return {
          href: a.getAttribute("href") || "",
          name: a.getAttribute("aria-label") || a.textContent?.trim() || "",
          inStock:
            !!btn && !btn.disabled && /sepete ekle/i.test(btn.textContent || ""),
        };
      }),
    );
    const pick = candidates.find(
      (c) => c.href && c.inStock && !(exclude && exclude.test(c.name)),
    );
    if (!pick) {
      throw new Error(
        `STOK_DURDU: kategoride stokta ürün yok (${candidates.length} ürün tarandı). URL: ${this.page.url()}`,
      );
    }
    return new URL(pick.href, this.page.url()).toString();
  }
}
