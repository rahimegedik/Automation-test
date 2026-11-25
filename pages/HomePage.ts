import { Page, Locator } from "@playwright/test";

const popupHandled = new WeakSet<Page>();

export class HomePage {
  readonly page: Page;
  readonly popupCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.popupCloseButton = page.getByRole("button", {
      name: "Popup kapat butonu",
    });
    // Kampanya popup'ı kategori/ürün sayfalarında da gecikmeli açılıp
    // tıklamaları kesiyor (z-[105] overlay). Sayfa başına bir kez,
    // hangi adımda çıkarsa çıksın otomatik kapat.
    if (!popupHandled.has(page)) {
      popupHandled.add(page);
      // "Alım türünü seçin" modalı (kategori kartı → Sepete Ekle) da aynı
      // bileşeni ve aynı "Popup kapat butonu" X'ini kullanıyor; içinde
      // #add2CartButton olduğu için onu hariç tut, yoksa handler modalı kapatır.
      void page
        .addLocatorHandler(
          page.locator(
            'div:not(:has(#add2CartButton)) > button[aria-label="Popup kapat butonu"]',
          ),
          async (btn) => {
            await btn.click({ force: true }).catch(() => {});
          },
          { noWaitAfter: true },
        )
        .catch(() => {});
    }
  }

  async goto() {
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: 15_000 });
  }

  categoryLink(name: string): Locator {
    return this.page.getByRole("link", { name, exact: true });
  }

  async closePopupIfVisible(): Promise<boolean> {
    await this.page.evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    });

    const visible = await this.popupCloseButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (visible) {
      // Locator handler aynı anda kapatmış olabilir — bekleyip asılma.
      await this.popupCloseButton.click({ timeout: 3000 }).catch(() => {});
      await this.page.waitForTimeout(600);
    }

    return visible;
  }
}
