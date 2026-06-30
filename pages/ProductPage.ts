import { Page, Locator } from "@playwright/test";

export class ProductPage {
  readonly page: Page;
  readonly addToCartButton: Locator;
  readonly closeSidebarButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addToCartButton = page
      .getByRole("button", { name: /sepete ekle/i })
      .first();

    this.closeSidebarButton = page.getByRole("button", {
      name: "Hızlı Sepeti Kapat",
    });
  }

  async goto(url: string) {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  async selectOneTimePurchase() {
    const tab = this.page.getByText(/tek seferlik alım/i).first();

    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tab.click();
      await this.page.waitForTimeout(300);
    }
  }

  // Sayfada stok-dışı / "yakında stokta" işareti varsa eşleşen metni döndürür,
  // yoksa null. ("yakında stokta" coming-soon ürünlerde de durulması istenir.)
  async stockBlocker(): Promise<string | null> {
    const body =
      (await this.page
        .locator("body")
        .innerText()
        .catch(() => "")) || "";
    const lc = body.toLowerCase();
    const keywords = [
      "yakında stokta",
      "yakında stok",
      "çok yakında",
      "tükendi",
      "stokta yok",
      "stok yok",
      "satışta değil",
      "temin edilemiyor",
    ];
    return keywords.find((k) => lc.includes(k)) ?? null;
  }

  // Ana ürünün sepete-ekle butonu: #add2CartButton. Bazı ürün sayfalarında
  // önerilen ürün kartlarının da "Sepete Ekle" butonu var (btn-secondary-gray,
  // sayfanın altında) → role+first onları yakalayıp yanlış ürünü ekleyebiliyor.
  // Bu yüzden önce #add2CartButton, yoksa role-based locator'a düş.
  private resolveAddButton(): Locator {
    const main = this.page.locator("#add2CartButton");
    return main;
  }

  async addToCart() {
    await this.selectOneTimePurchase();

    let addBtn = this.resolveAddButton();
    if ((await addBtn.count()) === 0) {
      addBtn = this.page.getByRole("button", { name: /sepete ekle/i }).first();
    }

    await addBtn.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});

    // Stok / eklenebilirlik kontrolü: sayfada "yakında stokta"/"tükendi" metni
    // ya da buton yok/görünmez/disabled ise devam etme, net hatayla dur.
    const blocker = await this.stockBlocker();
    const visible = await addBtn.isVisible().catch(() => false);
    const enabled = visible ? await addBtn.isEnabled().catch(() => false) : false;
    if (blocker || !visible || !enabled) {
      const reason = blocker
        ? `Ürün "${blocker}" durumunda`
        : "Sepete ekle butonu yok/pasif";
      throw new Error(
        `STOK_DURDU: ${reason} — durduruldu. URL: ${this.page.url()}`,
      );
    }

    // Sepete eklendiğine dair güvenilir sinyaller: hızlı sepet sidebar'ı açılır
    // veya header'daki "Sepetim (N>=1)" rozeti görünür.
    const cartBadge = this.page.getByText(/Sepetim\s*\(\s*[1-9]/i).first();

    // Hızlı tıklamada ekleme kaydolmayabiliyor → eklendiğini doğrula, olmadıysa tekrar dene.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await addBtn.scrollIntoViewIfNeeded().catch(() => {});
      await addBtn.evaluate((el) => (el as HTMLElement).click());
      await this.page.waitForTimeout(1500);

      const added =
        (await this.closeSidebarButton
          .isVisible({ timeout: 4000 })
          .catch(() => false)) ||
        (await cartBadge.isVisible({ timeout: 1000 }).catch(() => false));

      if (added) return;

      // Eklenmediyse kısa bekle ve butona tekrar bak
      await this.page.waitForTimeout(1000);
      await addBtn.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    }

    throw new Error(
      `Ürün sepete eklenemedi (3 denemede sepet boş kaldı). URL: ${this.page.url()}`,
    );
  }

  async closeSidebarIfOpen(): Promise<boolean> {
    const open = await this.closeSidebarButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (open) {
      await this.closeSidebarButton.evaluate((el) =>
        (el as HTMLElement).click(),
      );
      await this.page.waitForTimeout(500);
    }

    return open;
  }
}
