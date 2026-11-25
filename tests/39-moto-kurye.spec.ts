import { test, expect, Browser, Page } from "@playwright/test";
import { ProductPage } from "../pages/ProductPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import {
  BasketStateWatcher,
  ensureApiMode,
  startWithEmptyBasket,
  payWithBankTransfer,
  payFromGoldAccount,
} from "../pages/CheckoutFlow";

/**
 * Moto kurye — standart sepet ve hesaptan fiziki altın (HFA) sepeti.
 * Uygunluk basket/setAddress yanıtındaki motoDeliveryOptions.availableTimeSlots ile gelir.
 * Yöntem: aynı adres + aynı ürünle V2'yi koş; slot yoksa V1 ile kıyasla:
 *   - V1'de slot var, V2'de yok → FAIL (NSB-6794 regresyonu)
 *   - ikisinde de yok          → SKIP/UNTESTED (saat dışı / adres-ürün uygun değil)
 *   - V2'de slot var           → ilk slotu seç, havale ile sipariş aç.
 * ⚠️ Gerçek sipariş açar. Test başına 1 (slot varsa) / 2 (V1 kıyası) basket/add.
 */

type Flow = {
  name: string;
  open: (page: Page) => Promise<void>;
  pay: (page: Page) => Promise<string>;
};

const FLOWS: Flow[] = [
  {
    name: "standart",
    open: async (page) => {
      await page.goto("/1-gram-altin-kulce-altin", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000); // hydration (bkz. hesaptan-fiziki)
      await new ProductPage(page).addToCart();
      await expect(page.getByText(/Sepetim\s*\(\s*[1-9]/i).first(), "ürün sepete eklenmeli").toBeVisible({ timeout: 15_000 });
    },
    pay: payWithBankTransfer,
  },
  {
    name: "hesaptan-fiziki",
    open: async (page) => {
      await page.goto("/hesaptan-fiziki-altina", { waitUntil: "domcontentloaded" });
      // Sabit ilk kart yerine stokta olan ilk HFA ürünü (25.11: stage'de 1 gr "Yakında Stokta").
      const cards = page.getByRole("link", { name: /ürünü incele/i });
      await expect(cards.first()).toBeVisible({ timeout: 15_000 });
      let href: string | null = null;
      for (let i = 0; i < 6 && !href; i++) {
        href = await cards.evaluateAll((links) => {
          for (const a of links) {
            let card: HTMLElement | null = a.parentElement;
            while (card && !card.querySelector("button")) card = card.parentElement;
            const b = card?.querySelector("button") as HTMLButtonElement | null;
            if (b && !b.disabled && /fiziki altına çevir/i.test(b.textContent || "")) return a.getAttribute("href");
          }
          return null;
        });
        if (!href) await page.waitForTimeout(2000);
      }
      if (!href) throw new Error("STOK_DURDU: HFA kategorisinde stokta ürün yok");
      console.log(`ℹ HFA ürünü: ${href}`);
      await page.goto(new URL(href, page.url()).pathname, { waitUntil: "domcontentloaded" });
      // Hydration bitmeden tıklama hiçbir istek atmıyor (23.11 probe) → bekle + tekrar dene.
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000);
      const goCart = page.getByRole("link", { name: /Sepete Git/i });
      for (let i = 1; i <= 3; i++) {
        await page.getByRole("button", { name: /Fiziki Altına Çevir/i }).first().click({ force: true });
        if (await goCart.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)) break;
      }
      await expect(goCart).toBeVisible({ timeout: 5_000 });
    },
    pay: payFromGoldAccount,
  },
];

async function slotsAt(page: Page, basket: BasketStateWatcher) {
  await new CheckoutPage(page).goto();
  await new CheckoutPage(page).ensureAddressSelected();
  // MOTO_ADDR verilirse (ör. "BEŞİKTAŞ") o adresi seç — hesabın son kullanılan adresi moto bölgesi dışında olabilir.
  const want = process.env.MOTO_ADDR;
  if (want) {
    await expect.poll(() => basket.setAddress !== null, { timeout: 20_000 }).toBe(true).catch(() => {});
    // Gönderim adresi bir açılır liste: seçili kart + ok düğmesi; diğer adresler altında.
    const box = page.getByText("Gönderim Adresi").locator("xpath=ancestor::*[.//input[@type='radio']][1]");
    const cur = (await box.innerText()).replace(/\s+/g, " ");
    if (!new RegExp(want, "i").test(cur.split("Teslimat Seçenekleri")[0].slice(0, 120))) {
      basket.setAddress = null;
      await box.locator("button").filter({ hasNotText: /Yeni Adres/i }).first().click({ force: true });
      const opt = page.getByText(new RegExp(`^\\s*${want}\\s*$`, "i")).filter({ visible: true }).last();
      await expect(opt, `checkout adres listesinde "${want}" yok`).toBeVisible({ timeout: 10_000 });
      await opt.click({ force: true });
      await page.waitForTimeout(1500);
    }
    const row = box;
    console.log(`ℹ Adres seçildi: ${(await row.innerText()).replace(/\s+/g, " ").slice(0, 80)}`);
  }
  await expect.poll(() => basket.setAddress !== null, { timeout: 20_000 }).toBe(true);
  const opts = basket.setAddress?.motoDeliveryOptions;
  const slots: any[] = opts?.availableTimeSlots ?? [];
  const msg = await page.locator("#moto-delivery-container").innerText().catch(() => "");
  return { slots, msg: msg.replace(/\s+/g, " ").slice(0, 200), raw: JSON.stringify(opts ?? null).slice(0, 300) };
}

async function v1Slots(browser: Browser, flow: Flow) {
  const ctx = await browser.newContext({ storageState: test.info().project.use.storageState as string });
  const page = await ctx.newPage();
  const basket = new BasketStateWatcher(page);
  await page.goto("/?apiV2=0");
  await startWithEmptyBasket(page);
  await flow.open(page);
  const r = await slotsAt(page, basket);
  await startWithEmptyBasket(page); // V1 kıyas sepetini geri al
  await page.goto("/?apiV2=1"); // çerezi V2'ye geri çevir
  await ctx.close();
  return r;
}

// Skip/fail yolunda sunucuda gizli sepet kalmasın (25.11: 2 kez 1 gr külçe kaldı, sonraki HFA eklemesi 423 aldı).
test.afterEach(async ({ page }) => {
  if (/tebrikler/.test(page.url())) return;
  await startWithEmptyBasket(page).catch((e) => console.log(`⚠ Son temizlik başarısız: ${e}`));
});

for (const flow of FLOWS) {
  test(`Moto kurye — ${flow.name}`, async ({ page, browser }) => {
    test.setTimeout(360_000);
    const basket = new BasketStateWatcher(page);

    await ensureApiMode(page);
    await startWithEmptyBasket(page);
    await flow.open(page);
    const v2 = await slotsAt(page, basket);
    console.log(`ℹ V2 slot=${v2.slots.length} options=${v2.raw} ekrandaki="${v2.msg}"`);

    if (v2.slots.length === 0) {
      await startWithEmptyBasket(page);
      const v1 = await v1Slots(browser, flow);
      console.log(`ℹ V1 slot=${v1.slots.length} options=${v1.raw} ekrandaki="${v1.msg}"`);
      expect(v1.slots.length, "V1 slot sunuyor ama V2 sunmuyor (NSB-6794)").toBe(0);
      test.info().annotations.push({ type: "UNTESTED", description: `V1 ve V2 slot yok: ${v2.msg}` });
      test.skip(true, `Moto kurye slotu yok (V1=V2): ${v2.msg}`);
    }

    // Saatler "Aynı Gün Kurye ile Teslimat" radio'su seçilince açılıyor.
    await page.getByRole("radio", { name: /Kurye ile Teslimat/i }).first().check({ force: true });
    await expect.poll(() => basket.last?.alias ?? null, { timeout: 15_000 }).toMatch(/Moto/i).catch(() => {});
    const slot = page.locator("#moto-delivery-container [data-moto-slots] input:not(:disabled)").first();
    await expect(slot, "kurye seçildi ama saat listesi gelmedi").toBeVisible({ timeout: 15_000 });
    // Kurye seçimi sonrası panel yükleme katmanıyla kilitleniyor (25.11) → bitmesini bekle,
    // sonra slotu görünen satırından seç; seçim basket'e yazılana kadar tekrar dene.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);
    const slotRow = slot.locator("xpath=ancestor::label[1]");
    for (let i = 1; i <= 4 && !(await slot.isChecked().catch(() => false)); i++) {
      await ((await slotRow.count()) > 0 ? slotRow : slot).click({ force: true });
      await page.waitForTimeout(2500);
    }
    await expect(slot, "moto slotu seçilemedi").toBeChecked({ timeout: 5_000 });
    await expect.poll(() => basket.last?.motoSlot ?? null, { timeout: 10_000 }).not.toBeNull().catch(() => {});
    console.log(`✓ İlk moto kurye slotu seçildi (basket motoSlot=${JSON.stringify(basket.last?.motoSlot)})`);
    const id = await flow.pay(page);
    test.info().annotations.push({ type: "order", description: id });
  });
}
