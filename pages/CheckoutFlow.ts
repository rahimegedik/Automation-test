import { Page, expect, Response } from "@playwright/test";
import { BasketWatcher, clearCartStrict } from "./CartTypeHelpers";
import { CheckoutPage } from "./CheckoutPage";

/**
 * Checkout regresyonu (36+ spec'ler) için ortak adımlar.
 * Mevcut journey spec'lerinin (09/10/11) adımlarını tek yerde toplar ve
 * eksik olanları ekler: V2 teyidi, sıkı sepet temizliği, sipariş no yakalama,
 * sepet yanıtındaki shippingMethods alias'ı.
 */

export const OTP = process.env.TEST_OTP_3DS ?? "201409";
export const API_MODE = (process.env.API_MODE ?? "v2").toLowerCase();

export interface BasketState {
  alias: string | null;
  text: string | null;
  grandTotal: number | null;
  highValue: boolean | null;
  motoSlot: unknown;
  basketType: string | null;
  isSubscribe: boolean | null;
}

/** basket/get|add|update yanıtlarından son sepet durumunu tutar. */
export class BasketStateWatcher {
  last: BasketState | null = null;
  setAddress: any = null;
  constructor(page: Page) {
    page.on("response", (r) => this.on(r).catch(() => {}));
  }
  private async on(r: Response) {
    const u = r.url();
    if (/\/basket\/setAddress/i.test(u)) {
      this.setAddress = (await r.json().catch(() => null))?.data ?? null;
      return;
    }
    if (!/\/basket\/(get|add|update|changeQty|setInstallment)/i.test(u)) return;
    const d = (await r.json().catch(() => null))?.data;
    if (!d || !Array.isArray(d.items)) return;
    this.last = {
      alias: d.shippingMethods?.alias ?? d.shippingMethodAlias ?? null,
      text: d.shippingMethodText ?? null,
      grandTotal: d.grandTotal ?? null,
      highValue: d.highValueOrderThreshold ?? null,
      motoSlot: d.motoDeliveryTimeSlot ?? null,
      basketType: d.basketType ?? null,
      isSubscribe: d.isSubscribe ?? null,
    };
  }
}

/** ?apiV2=1 ile flag'i set eder ve SSR yanıtında x-api-version'ı doğrular. */
export async function ensureApiMode(page: Page) {
  const flag = API_MODE === "v1" ? 0 : 1;
  await page.goto(`/?apiV2=${flag}`, { waitUntil: "domcontentloaded" });
  const res = await page.goto("/", { waitUntil: "domcontentloaded" });
  const ver = res?.headers()["x-api-version"];
  expect(ver, "x-api-version").toBe(API_MODE);
  console.log(`✓ API modu doğrulandı: x-api-version=${ver}`);
}

/** Sunucudaki sepeti gerçekten boşaltır (NSB-7231: eski sepet geri gelebilir). */
export async function startWithEmptyBasket(page: Page) {
  const w = new BasketWatcher(page);
  const snap = await clearCartStrict(page, w);
  expect(snap.items.length, "başlangıç sepeti boş olmalı").toBe(0);
  console.log("✓ Sepet sunucu tarafında boş");
}

/** Checkout'ta havale ile ödeme → tebrikler/<no>. Sipariş no döner. */
export async function payWithBankTransfer(page: Page): Promise<string> {
  const co = new CheckoutPage(page);
  await co.selectBankTransfer();
  await co.selectFirstBank();
  await co.acceptAgreement();
  expect(await co.isAgreementChecked()).toBe(true);
  await co.pay();
  await expect(page).toHaveURL(/tebrikler\/\d+/, { timeout: 60_000 });
  return orderIdFromUrl(page);
}

/** Hesaptan fiziki altın: ödeme hesaptaki altından → sözleşme + Ödeme Yap → tebrikler. */
export async function payFromGoldAccount(page: Page): Promise<string> {
  const co = new CheckoutPage(page);
  await selectFirstTransferBank(page);
  await co.acceptAgreement();
  await co.pay();
  await expect(page).toHaveURL(/tebrikler\/\d+/, { timeout: 60_000 });
  return orderIdFromUrl(page);
}

/** Checkout'ta kayıtlı kart + 3DS OTP → tebrikler. Sipariş no döner. */
export async function payWithSavedCard(page: Page): Promise<string> {
  const co = new CheckoutPage(page);
  await co.selectCreditCard();
  await selectFirstSavedCard(page);
  await co.acceptAgreement();
  const payBtn = page.getByRole("button", { name: /ÖDEME YAP/ });
  await expect.poll(() => payBtn.isEnabled().catch(() => false), { timeout: 30_000 }).toBe(true);
  await payBtn.click();
  await enter3dsOtp(page);
  await expect(page).toHaveURL(/tebrikler/, { timeout: 60_000 });
  return orderIdFromUrl(page);
}

/**
 * Altın havale / hesaptan fiziki: banka radio'ları önseçili GELMİYOR (V1 = V2, 23.11 probe).
 * Seçilmezse ÖDEME YAP "Lütfen banka seçiniz" deyip sipariş isteği atmıyor.
 */
export async function selectFirstTransferBank(page: Page) {
  const radio = page.getByRole("radio", { name: /Banka logosu/ }).first();
  await radio.waitFor({ state: "attached", timeout: 15_000 });
  if (!(await radio.isChecked().catch(() => false))) {
    await radio.check({ force: true }).catch(() => {});
    if (!(await radio.isChecked().catch(() => false))) {
      await radio.locator("xpath=ancestor::*[contains(@class,'cursor-pointer')][1]").click({ force: true });
    }
  }
  await expect(radio, "transfer bankası seçilmeli").toBeChecked({ timeout: 5_000 });
  console.log("✓ Transfer bankası seçildi");
}

export async function selectFirstSavedCard(page: Page) {
  await page.waitForTimeout(1500);
  // Kart radio'su sr-only (görünmez) olabiliyor → isVisible değil, varlık + checked durumuna bak.
  const radio = page.getByRole("radio", { name: /\*{4,}\d{4}/ }).first();
  await radio.waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
  if ((await radio.count()) > 0) {
    if (!(await radio.isChecked().catch(() => false))) {
      await radio.check({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    if (await radio.isChecked().catch(() => false)) {
      console.log("ℹ Kayıtlı kart radio'su seçili");
      return;
    }
  }
  const rows = page
    .locator(".cursor-pointer.flex.items-center.gap-3")
    .filter({ hasText: /\*{2,}|SKT|Son Kullanma|Bankanız|\/\d{2}/i });
  if ((await rows.count()) === 0) {
    const tab = page.getByRole("button", { name: "Kayıtlı Kartlar" });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await rows.first().waitFor({ state: "visible", timeout: 15_000 });
  }
  await rows.first().scrollIntoViewIfNeeded();
  await rows.first().click({ force: true });
  await page.waitForTimeout(1000);
}

export async function enter3dsOtp(page: Page) {
  const frame = page.locator("iframe").last().contentFrame();
  const box = frame.getByRole("textbox");
  await box.first().waitFor({ state: "visible", timeout: 30_000 });
  for (let i = 0; i < OTP.length; i++) await box.nth(i).fill(OTP[i]);
  const submit = frame.locator('button, input[type="submit"], input[type="button"]').first();
  if (await submit.isVisible({ timeout: 3000 }).catch(() => false)) await submit.click().catch(() => {});
  else await page.keyboard.press("Enter");
}

export function orderIdFromUrl(page: Page): string {
  const m = page.url().match(/tebrikler\/(?:birikim\/)?(\d+)/);
  const id = m?.[1] ?? "?";
  console.log(`✓ SİPARİŞ: ${id} (${page.url()})`);
  return id;
}
