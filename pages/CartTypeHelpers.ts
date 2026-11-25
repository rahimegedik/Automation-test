import { Page, Response, expect } from "@playwright/test";
import { CategoryPage } from "./CategoryPage";
import { ProductPage } from "./ProductPage";

/**
 * NSB-7223 — sepet türü kuralları için yardımcılar.
 *
 * Oracle: FE'nin kendi `basket/add` ve `basket/get` yanıtları. Her kalem
 * `options[alias=product_type]`, `isSubscribe` ve `categories[].slug` ile bir
 * sepet grubuna sınıflanır. Kural: standart grup (külçe altın, gümüş, ziynet)
 * kendi içinde birleşir; takı, hesaba havale, hesaptan fiziki, düzenli birikim
 * ve Fifa başka gruplarla aynı sepette bulunamaz.
 */

export type CartKind =
  | "kulce"
  | "gumus"
  | "ziynet"
  | "taki"
  | "havale"
  | "fiziki"
  | "birikim"
  | "fifa";

export type CartGroup =
  "standart" | "taki" | "havale" | "fiziki" | "birikim" | "fifa";

export const KIND_GROUP: Record<CartKind, CartGroup> = {
  kulce: "standart",
  gumus: "standart",
  ziynet: "standart",
  taki: "taki",
  havale: "havale",
  fiziki: "fiziki",
  birikim: "birikim",
  fifa: "fifa",
};

export interface BasketItemInfo {
  sku: string;
  name: string;
  productType: string | null;
  isSubscribe: boolean;
  categories: string[];
  group: CartGroup | `bilinmeyen:${string}`;
}

export interface BasketSnapshot {
  basketId: number | null;
  basketType: string | null;
  items: BasketItemInfo[];
}

export interface AddAttempt {
  /** Bu tıklama sırasında gelen basket/add yanıtları. */
  responses: { status: number; success: boolean | null; message: string }[];
  /** Ekranda görünen dialog/toast/uyarı metinleri. */
  notices: string[];
}

const BASKET_RE = /\/basket\/(add|get)(\?|$)/;
const ADD_RE = /\/basket\/add(\?|$)/;

export function classifyItem(raw: any): BasketItemInfo {
  const opt = (raw?.options || []).find(
    (o: any) => o?.alias === "product_type",
  );
  const productType: string | null = opt?.optionName ?? null;
  const categories: string[] = (raw?.categories || []).map((c: any) =>
    String(c?.slug || "").toLowerCase(),
  );
  const isSubscribe = !!raw?.isSubscribe;
  const pt = (productType || "").toLowerCase();

  let group: BasketItemInfo["group"];
  if (/transferfrombankaccount|hesaba/.test(pt)) group = "havale";
  else if (/fiziki|physical|fromaccount|convert/.test(pt)) group = "fiziki";
  else if (isSubscribe || /subscri|birikim/.test(pt)) group = "birikim";
  else if (categories.some((s) => s.includes("fifa"))) group = "fifa";
  else if (categories.some((s) => s === "taki" || s.includes("taki")))
    group = "taki";
  else if (
    categories.some((s) => /kulce-altin|gumus|ziynet/.test(s)) ||
    /kulce|gümüş|gumus|ziynet|reşat|resat|çeyrek|ceyrek|yarım|yarim|tam altın|altın/i.test(
      raw?.name || "",
    )
  )
    group = "standart";
  else group = `bilinmeyen:${productType ?? "-"}/${categories.join(",")}`;

  return {
    sku: String(raw?.sku ?? ""),
    name: String(raw?.name ?? ""),
    productType,
    isSubscribe,
    categories,
    group,
  };
}

/**
 * Sayfadaki tüm basket/add|get yanıtlarını dinler; son başarılı sepet
 * durumunu tutar.
 */
export class BasketWatcher {
  last: BasketSnapshot | null = null;
  private addLog: AddAttempt["responses"] = [];

  constructor(private page: Page) {
    page.on("response", (r) => this.onResponse(r).catch(() => {}));
  }

  private async onResponse(r: Response) {
    const url = r.url();
    if (!BASKET_RE.test(url)) return;
    let json: any = null;
    try {
      json = await r.json();
    } catch {
      /* yanıt JSON değil */
    }
    if (ADD_RE.test(url)) {
      this.addLog.push({
        status: r.status(),
        success: typeof json?.success === "boolean" ? json.success : null,
        message: String(
          json?.message ?? json?.errors?.[0]?.message ?? json?.error ?? "",
        ).slice(0, 300),
      });
    }
    const data = json?.data;
    if (json?.success && data && Array.isArray(data.items)) {
      this.last = {
        basketId: data.basketId ?? data.id ?? null,
        basketType: data.basketType ?? null,
        items: data.items.map(classifyItem),
      };
    }
  }

  /** `action`'ı çalıştırır, basket/add yanıtını ve ekrandaki uyarıları toplar. */
  async attempt(
    action: () => Promise<void>,
    settleMs = 6000,
  ): Promise<AddAttempt> {
    const before = this.addLog.length;
    await action();
    const deadline = Date.now() + settleMs;
    const notices = new Set<string>();
    while (Date.now() < deadline) {
      for (const t of await visibleNotices(this.page)) notices.add(t);
      if (this.addLog.length > before && notices.size > 0) break;
      await this.page.waitForTimeout(400);
    }
    for (const t of await visibleNotices(this.page)) notices.add(t);
    const responses = this.addLog.slice(before);
    // BE hata mesajı herhangi bir yerde (toast, inline) ekranda mı?
    for (const r of responses) {
      const probe = r.message.slice(0, 40).trim();
      if (
        probe &&
        (await this.page
          .getByText(probe, { exact: false })
          .first()
          .isVisible({ timeout: 500 })
          .catch(() => false))
      )
        notices.add(`ekranda: ${r.message}`);
    }
    return { responses, notices: [...notices] };
  }

  /** /sepet'e gidip sunucudaki güncel sepeti okur. */
  async refresh(): Promise<BasketSnapshot> {
    const got = this.page
      .waitForResponse((r) => /\/basket\/get(\?|$)/.test(r.url()), {
        timeout: 15_000,
      })
      .catch(() => null);
    await this.page.goto("/sepet", { waitUntil: "domcontentloaded" });
    const res = await got;
    if (!res) {
      // Boş sepette FE basket/get çağırmayabiliyor.
      const empty = await this.page
        .getByText(/sepetinizde ürün bulunmamaktadır|sepetiniz boş/i)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (empty) return { basketId: null, basketType: null, items: [] };
    }
    await this.page.waitForTimeout(800);
    return this.last ?? { basketId: null, basketType: null, items: [] };
  }
}

async function visibleNotices(page: Page): Promise<string[]> {
  const loc = page.locator(
    '[role="dialog"], [role="alertdialog"], [role="alert"], .Toastify__toast, [class*="toast" i], [class*="snackbar" i]',
  );
  const out: string[] = [];
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const t = ((await el.innerText().catch(() => "")) || "")
      .replace(/\s+/g, " ")
      .trim();
    // Hızlı sepet çekmecesi bir dialog ama uyarı değil.
    if (t && !/^Sepetim|Hızlı Sepet|- nadirgold\.com$/i.test(t))
      out.push(t.slice(0, 300));
  }
  return out;
}

export function groupsOf(s: BasketSnapshot): string[] {
  return [...new Set(s.items.map((i) => i.group))].sort();
}

export function describe(s: BasketSnapshot): string {
  return (
    `basketType=${s.basketType} items=[` +
    s.items
      .map(
        (i) =>
          `${i.group}:${i.sku}(${i.productType ?? "-"}${i.isSubscribe ? ",sub" : ""})`,
      )
      .join(", ") +
    "]"
  );
}

async function killPushPrompt(page: Page) {
  await page
    .evaluate(() => {
      document.querySelector("#dengage-push-prompt-container")?.remove();
    })
    .catch(() => {});
  const popupClose = page.getByRole("button", { name: "Popup kapat butonu" });
  if (await popupClose.isVisible({ timeout: 1000 }).catch(() => false)) {
    await popupClose.click().catch(() => {});
  }
}

async function openInStockPdp(page: Page, slug: string) {
  const category = new CategoryPage(page);
  await category.goto(slug);
  await category.closeSidebarIfOpen();
  const url = await category.getFirstInStockProductUrl();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(1500);
  await killPushPrompt(page);
  return url;
}

async function clickMainAdd(page: Page) {
  const btn = page.locator("#add2CartButton");
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await expect(btn).toBeEnabled({ timeout: 10_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.evaluate((el) => (el as HTMLElement).click());
}

/**
 * Verilen türden bir ürünü sepete eklemeyi dener. Ekleme reddedilebilir —
 * bu fonksiyon başarıyı assert etmez, sadece tıklamayı yapar.
 * Dönen string: hangi ürün/sayfa üzerinden denendiği (log için).
 */
export async function triggerAdd(
  page: Page,
  kind: CartKind,
): Promise<{
  source: string;
  click: () => Promise<void>;
}> {
  switch (kind) {
    case "kulce":
    case "gumus":
    case "ziynet":
    case "fifa": {
      const slug = {
        kulce: "kulce-altin",
        gumus: "gumus",
        ziynet: "ziynet",
        fifa: "fifa-world-cup-2026",
      }[kind];
      const url = await openInStockPdp(page, slug);
      return {
        source: url,
        click: async () => {
          await new ProductPage(page).selectOneTimePurchase();
          await clickMainAdd(page);
        },
      };
    }
    case "taki": {
      const url = await openInStockPdp(page, "taki");
      return {
        source: url,
        click: async () => {
          // Ölçü seçimi zorunlu: stokta olan (enabled) ilk ölçü.
          const size = page
            .getByRole("button", { name: /^\d{1,2}([.,]\d)?$/ })
            .and(page.locator(":enabled"))
            .first();
          if (await size.isVisible({ timeout: 5000 }).catch(() => false)) {
            await size.click();
          }
          await clickMainAdd(page);
        },
      };
    }
    case "birikim": {
      const url = await openInStockPdp(page, "kulce-altin");
      return {
        source: url,
        click: async () => {
          const tab = page
            .locator("div")
            .filter({ hasText: /^Düzenli Birikim$/ })
            .first();
          await expect(tab).toBeVisible({ timeout: 10_000 });
          await tab.click();
          await page.waitForTimeout(500);
          await clickMainAdd(page);
        },
      };
    }
    case "havale": {
      await page.goto("/hesaba-altin-havale", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2000);
      await killPushPrompt(page);
      return {
        source: "/hesaba-altin-havale (Garanti, 20000 TL)",
        click: async () => {
          const garanti = page
            .getByRole("img", { name: /GARANTİ|GARANTI/i })
            .first();
          if (await garanti.isVisible({ timeout: 5000 }).catch(() => false)) {
            await garanti.click();
          }
          const tl = page.getByRole("textbox", { name: "TL" });
          await expect(tl).toBeVisible({ timeout: 15_000 });
          await tl.fill("20000");
          // Hesaplanan gram değeri gelmeden buton hiçbir şey yapmıyor (bkz. spec 28).
          await page.waitForTimeout(2500);
          await page
            .getByRole("button", { name: /HESABA HAVALE YAP/i })
            .click();
        },
      };
    }
    case "fiziki": {
      await page.goto("/hesaptan-fiziki-altina", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2000);
      await killPushPrompt(page);
      // Sabit 1 gr yerine kategoride stokta olan ilk HFA ürünü (24.11: 1 gr gündüz de
      // "Yakında Stokta"ydı; PDP'deki öneri karuselinin "Fiziki Altına Çevir"i guard'ı
      // kandırıp boş tıklamaya yol açıyordu).
      const cards = page.getByRole("link", { name: /ürünü incele/i });
      await expect(cards.first()).toBeVisible({ timeout: 15_000 });
      let href: string | null = null;
      for (let i = 0; i < 6 && !href; i++) {
        href = await cards.evaluateAll((links) => {
          for (const a of links) {
            let card: HTMLElement | null = a.parentElement;
            while (card && !card.querySelector("button")) card = card.parentElement;
            const btn = card?.querySelector("button") as HTMLButtonElement | null;
            if (btn && !btn.disabled && /fiziki altına çevir/i.test(btn.textContent || ""))
              return a.getAttribute("href");
          }
          return null;
        });
        if (!href) await page.waitForTimeout(2000);
      }
      if (!href) throw new Error(`STOK_DURDU: HFA kategorisinde stokta ürün yok. URL: ${page.url()}`);
      await page.goto(new URL(href, page.url()).pathname, { waitUntil: "domcontentloaded" });
      // Hydration bitmeden "Fiziki Altına Çevir" istek atmıyor (23.11 probe) → networkidle + 3 sn.
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000);
      await killPushPrompt(page);
      // Gece stok kapanınca PDP'de buton "Yakında Stokta" (disabled) olur; .first()
      // başka bir "Fiziki Altına Çevir"e düşüp sessizce boş tıklıyordu (23.11 TC-09).
      const yakinda = page.getByRole("button", { name: /Yakında Stokta/i }).first();
      const cevir = page.getByRole("button", { name: /Fiziki Altına Çevir/i }).first();
      if ((await yakinda.isVisible().catch(() => false)) && !(await cevir.isVisible().catch(() => false))) {
        throw new Error(`STOK_DURDU: HFA ürünü stokta değil ("Yakında Stokta"). URL: ${page.url()}`);
      }
      return {
        source: page.url() + " (Fiziki Altına Çevir)",
        click: async () => {
          const btn = page
            .getByRole("button", { name: /Fiziki Altına Çevir/i })
            .first();
          await expect(btn).toBeVisible({ timeout: 15_000 });
          await expect(btn).toBeEnabled({ timeout: 15_000 });
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true });
        },
      };
    }
  }
}

/**
 * /sepet sayfasındaki satırdan tek bir kalemi siler. Hızlı sepet çekmecesindeki
 * (ekran dışı) "Sil" yerine sayfa satırını hedefler; tıklamadan önce satırın
 * ürün adını, sonra DELETE isteğindeki sku'yu doğrular.
 */
export async function removeItemRow(page: Page, item: BasketItemInfo) {
  const sil = page.getByRole("button", { name: /^Sil$/ });
  const candidates = page
    .locator("div")
    .filter({ hasText: item.name })
    .filter({ has: sil });
  const n = await candidates.count();
  let row = null;
  for (let i = n - 1; i >= 0; i--) {
    const c = candidates.nth(i);
    if ((await c.getByRole("button", { name: /^Sil$/ }).count()) !== 1)
      continue;
    if (!(await c.isVisible().catch(() => false))) continue;
    const box = await c.boundingBox().catch(() => null);
    if (!box || box.x < 0) continue; // çekmece ekran dışında
    row = c;
    break;
  }
  if (!row)
    throw new Error(`Sepet satırı bulunamadı: ${item.name} (${item.sku})`);
  await expect(row).toContainText(item.name);

  const del = page.waitForResponse(
    (r) => /\/basket\/delete(\?|$)/.test(r.url()),
    { timeout: 15_000 },
  );
  await row.getByRole("button", { name: /^Sil$/ }).click();
  const res = await del;
  const body = res.request().postData() || "";
  expect(body, "silinen kalem hedeflenen sku olmalı").toContain(item.sku);
  expect(res.status()).toBeLessThan(400);
  await page.waitForTimeout(800);
}

/**
 * Sepeti kalem kalem boşaltır ve basket/get ile boş olduğunu ölçer.
 * Not: yeni bir tarayıcı bağlamında FE basketHash'i bilmez → sunucudaki sepet
 * ilk basket/add'e kadar görünmez. Bu yüzden temizlik ancak bu oturumda en az
 * bir ekleme yapıldıktan sonra anlamlıdır.
 */
export async function clearCartStrict(
  page: Page,
  watcher: BasketWatcher,
  only?: (i: BasketItemInfo) => boolean,
): Promise<BasketSnapshot> {
  for (let round = 0; round < 6; round++) {
    const snap = await watcher.refresh();
    const targets = snap.items.filter((i) => (only ? only(i) : true));
    if (targets.length === 0) return snap;
    await removeItemRow(page, targets[0]);
  }
  return watcher.refresh();
}
