import { test, expect, type Page } from "@playwright/test";
import { BasketApi, type Basket } from "../pages/BasketApi";
import { BasketWatcher, clearCartStrict } from "../pages/CartTypeHelpers";

/**
 * Taksit listesinin sepetle birlikte güncellenmesi (stage turu, Deployment_2026-11-20):
 *   NSB-7325 kur (counter) değişince familyInstallments tutarları sepetle AYNI istekte güncellenmeli (180 sn cache yok)
 *   NSB-7326 aynı üründen 2 adet varken taksit tablosu 2 adetin tutarını göstermeli (BE + checkout ekranı)
 *
 * Oracle: familyInstallments Tek Çekim / sepet grandTotal oranı sabit (kart komisyonu) — kur değişse de
 * adet değişse de oran korunmalı. Bayat liste (eski kur / eski adet) oranı bozar.
 * Sipariş açmaz. API vakaları 2, ekran vakası 2 basket/add yapar. Sonunda sepet boşaltılır.
 *
 *   NADIRGOLD_ENV=staging npx playwright test tests/42-taksit-kur-adet.spec.ts --project=chromium --reporter=line
 */

const ENV = process.env.NADIRGOLD_ENV || "staging";
const BASE = ENV === "dev" ? "https://www.nadirgold.dev" : "https://www.nadirgold.work";
const TAKI_SKU = process.env.QA_TAKI_SKU || "bilezik6.4";
const TAKI_PATH = process.env.QA_TAKI_PATH || "/22-ayar-10-gram-ajda-bilezik";
const TAKI_SIZE = process.env.QA_TAKI_SIZE || "6.4";
const KUR_MIN = Number(process.env.QA_KUR_MIN || 8); // kur değişimini yakalamak için izleme süresi (dk)

test.describe.configure({ mode: "serial" });
test.skip(!["dev", "staging", "stage"].includes(ENV), "Yalnız dev/staging");

// Aile sırası V1/V2 arasında farklı olabiliyor (25.11) → hep aynı aileyi (en küçük familyId) kıyasla.
const tek = (fam: any, familyId?: number): number => {
  const l: any[] = Array.isArray(fam?.data?.list) ? fam.data.list : [];
  const f = familyId != null ? l.find((x) => Number(x.familyId) === familyId) : [...l].sort((a, b) => a.familyId - b.familyId)[0];
  const one = f?.installments?.find((i: any) => Number(i.installmentNumber) === 1);
  return one ? Number(one.totalPrice) : NaN;
};
const fams = (fam: any) => (Array.isArray(fam?.data?.list) ? fam.data.list : []).map((f: any) => `${f.familyId}:${f.familyName}=${tek(fam, Number(f.familyId))}`).join(",");

let api: BasketApi;
let basket: Basket;

test.describe("API", () => {
  test.beforeAll(async () => {
    api = new BasketApi(ENV, 400);
    const start = await api.get();
    expect(start.items?.length ?? 0, `Sepet boş değil (${(start.items || []).map((i) => i.sku).join(",")}) — koşulmadı`).toBe(0);
    const r = await api.add({ basketHash: start.basketHash, sku: TAKI_SKU, qty: 1 });
    expect(r.code, `takı eklenemedi: ${r.raw.slice(0, 200)}`).toBe(200);
    basket = r.data;
    expect(basket.installmentStatus, "takı sepeti taksite açık olmalı").toBe("AVAILABLE");
  });

  test.afterAll(async () => {
    if (!api) return;
    const ok = await api.clear().catch(() => false);
    console.log(`temizlik: ${ok ? "sepet boş (ölçüldü)" : "⚠️ sepet boşaltılamadı"}`);
  });

  test("KUR-01 (NSB-7325) kur değişince taksit listesi sepetle aynı anda güncellenir, V1 = V2", async ({}, info) => {
    test.setTimeout((KUR_MIN + 2) * 60_000);
    const rows: any[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < KUR_MIN * 60_000) {
      const g = await api.get();
      const f2 = await api.req("v2", "/payment/familyInstallments", { basketHash: basket.basketHash });
      const f1 = await api.req("v1", "/payment/familyInstallments", { basket_hash: basket.basketHash });
      const g1 = await api.req("v1", "/basket/get", { basket_hash: basket.basketHash });
      const row = { t: new Date().toTimeString().slice(0, 8), grand: Number(g.grandTotal), grandV1: Number((g1.json?.data ?? g1.json)?.grandTotal), v2: tek(f2), v1: tek(f1) };
      rows.push(row);
      if (process.env.QA_DEBUG && rows.length === 1) {
        const pick = (it: any) => Object.fromEntries(Object.entries(it || {}).filter(([k, v]) => typeof v !== "object" && /price|total|tax|service|qty|sku|labor|iscilik|factor|gram|weight|discount/i.test(k)));
        console.log("ℹ KALEM V2", JSON.stringify(pick((g.items || [])[0])), "| üst", JSON.stringify(pick(g)));
        const d1 = g1.json?.data ?? g1.json;
        console.log("ℹ KALEM V1", JSON.stringify(pick((d1?.items || [])[0])), "| üst", JSON.stringify(pick(d1)));
      }
      console.log(`ℹ ${row.t} sepetV2=${row.grand} sepetV1=${row.grandV1} famV2=${row.v2} famV1=${row.v1} oranV2=${(row.v2 / row.grand).toFixed(6)} oranV1=${(row.v1 / row.grandV1).toFixed(6)}`);
      await new Promise((r) => setTimeout(r, 20_000));
    }
    await info.attach("kur-izleme.json", { body: JSON.stringify(rows, null, 1), contentType: "application/json" });
    const r0 = rows[0].v2 / rows[0].grand;
    const changes = rows.filter((r, i) => i > 0 && r.grand !== rows[i - 1].grand).length;
    for (const r of rows) {
      expect.soft(r.v2, `${r.t}: V2 tek çekim = sepet × ${r0.toFixed(6)} (bayat kur yok)`).toBeCloseTo(r.grand * r0, 0);
      expect.soft(Math.abs(r.v2 - r.v1), `${r.t}: V2 = V1 tek çekim`).toBeLessThanOrEqual(0.02);
    }
    if (changes === 0) {
      info.annotations.push({ type: "UNTESTED", description: `${KUR_MIN} dk içinde kur değişmedi — güncelleme gözlenemedi` });
      test.skip(true, "Kur değişmedi");
    }
    console.log(`ℹ izlemede ${changes} kur değişimi`);
  });

  test("ADET-01 (NSB-7326) aynı üründen 2. adet: familyInstallments 2 adetin tutarı, V1 = V2", async ({}, info) => {
    const g1 = await api.get();
    const one = tek(await api.req("v2", "/payment/familyInstallments", { basketHash: basket.basketHash }));
    const a = await api.add({ basketHash: basket.basketHash, sku: TAKI_SKU, qty: 1 });
    expect(a.code, `2. adet eklenemedi: ${a.raw.slice(0, 200)}`).toBe(200);
    const g2 = await api.get();
    const f2 = await api.req("v2", "/payment/familyInstallments", { basketHash: basket.basketHash });
    const two = tek(f2);
    console.log(`ℹ aileler V2=${fams(f2)}`);
    const f1 = await api.req("v1", "/payment/familyInstallments", { basket_hash: basket.basketHash });
    const twoV1 = tek(f1);
    console.log(`ℹ aileler V1=${fams(f1)}`);
    const qty = (g2.items || []).reduce((s: number, i: any) => s + Number(i.qty), 0);
    const row = { qty, grand1: g1.grandTotal, tek1: one, grand2: g2.grandTotal, tek2: two, tek2V1: twoV1 };
    console.log(`ℹ ${JSON.stringify(row)}`);
    await info.attach("adet.json", { body: JSON.stringify(row, null, 1), contentType: "application/json" });
    expect(qty, "sepette 2 adet").toBe(2);
    expect.soft(two, "2 adette tek çekim = sepet × aynı oran (1 adet tutarı değil)").toBeCloseTo(Number(g2.grandTotal) * (one / Number(g1.grandTotal)), 0);
    expect.soft(two / one, "tek çekim ≈ 2 kat (kur farkı hariç)").toBeGreaterThan(1.95);
    expect.soft(Math.abs(two - twoV1), "V2 = V1").toBeLessThanOrEqual(0.02);
  });
});

// ─────────────────────── checkout ekranı (NSB-7326 FE) ───────────────────────

const payTab = (p: Page) => p.getByText("Banka / Kredi Kartı İle Ödeme", { exact: true });
const tl = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Kayıtlı kartı seçer; tabloda gösterilen Tek Çekim tutarını ve son familyInstallments yanıtını döner. */
async function tableAt(p: Page) {
  // familyInstallments checkout açılırken (kayıtlı kart önseçiliyse) de çağrılıyor → dinlemeyi sayfadan önce başlat.
  const seen: any[] = [];
  const on = async (r: any) => { if (/payment\/familyInstallments/.test(r.url())) seen.push(await r.json().catch(() => null)); };
  p.on("response", on);
  await p.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle").catch(() => {});
  await expect(payTab(p), "checkout'ta ödeme seçenekleri yok").toBeVisible({ timeout: 15_000 });
  await payTab(p).click();
  const famRes = p.waitForResponse((r) => /payment\/familyInstallments/.test(r.url()), { timeout: 15_000 }).catch(() => null);
  await p.locator('input[name="cardId"]').first().check({ force: true });
  await famRes;
  await p.waitForTimeout(1500);
  p.off("response", on);
  const json = seen[seen.length - 1] ?? null;
  const row = await p.evaluate(() => {
    const el = [...document.querySelectorAll("label,li,div")].find((e) => /^\s*Tek Çekim/.test(e.textContent || "") && /\d,\d{2}/.test(e.textContent || "") && (e.textContent || "").length < 120);
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  });
  const shown = row.match(/([\d.]+,\d{2})/g)?.map(tl) ?? [];
  const body = await p.locator("body").innerText();
  const pay = body.match(/Ödenecek Tutar[\s\S]{0,40}?([\d.]+,\d{2}) TL/);
  return { row, shown, resTek: tek(json), payable: pay ? tl(pay[1]) : NaN, called: seen.length > 0 };
}

test.describe("Checkout ekranı", () => {
  test("ADET-FE-01 (NSB-7326) sepette 2 adet: tablo 2 adetin tutarını gösterir; adet değişince tablo yenilenir", async ({ page }, info) => {
    test.setTimeout(240_000);
    const w = new BasketWatcher(page);
    // FE yeni bağlamda sunucudaki sepeti göremiyor (NSB-7231) → başlangıç temizliği API'den, ölçerek.
    const sapi = new BasketApi(ENV, 20);
    expect(await sapi.clear(), "sunucu sepeti boşaltılamadı").toBe(true);
    expect((await sapi.get({ force: true })).items?.length ?? 0, "başlangıç sepeti boş olmalı").toBe(0);
    await page.goto(`${BASE}/?apiV2=1`);

    // 1 adet ekle → checkout
    await page.goto(`${BASE}${TAKI_PATH}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: TAKI_SIZE, exact: true }).click();
    const add = page.waitForResponse((r) => /basket\/add/.test(r.url()), { timeout: 20_000 });
    await page.getByRole("button", { name: "Sepete Ekle" }).first().click();
    expect((await add).status(), "takı eklenemedi").toBe(200);
    const one = await tableAt(page);

    // Sepet sayfasında adedi 2'ye çıkar → checkout
    await page.goto(`${BASE}/sepet`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const upd = page.waitForResponse((r) => /basket\/(update|add|changeQty)/.test(r.url()), { timeout: 15_000 }).catch(() => null);
    // Adet kutusu spinbutton; "+" onun hemen sonraki kardeşi (ilk eşleşme ekran dışı çekmece → sayfadaki son kutu).
    const spin = page.getByRole("spinbutton").filter({ visible: true }).last(); // ilk eşleşme ekran dışı hızlı sepet çekmecesi
    await expect(spin, "sepette adet kutusu yok").toHaveValue("1", { timeout: 15_000 });
    await spin.locator("xpath=following-sibling::button[1]").click({ timeout: 10_000 });
    const u = await upd;
    expect(u?.status(), "adet artırılamadı").toBe(200);
    await page.waitForTimeout(1500);
    const two = await tableAt(page);

    const res = { one, two };
    console.log(`ℹ ${JSON.stringify(res)}`);
    await info.attach("ekran.json", { body: JSON.stringify(res, null, 1), contentType: "application/json" });
    await page.screenshot({ path: test.info().outputPath("checkout-2-adet.png"), fullPage: true });

    expect(two.called, "adet değişince checkout familyInstallments'ı yeniden çağırmalı").toBe(true);
    expect.soft(two.shown[0], "tabloda Tek Çekim = yanıttaki 2 adet tutarı").toBeCloseTo(two.resTek, 1);
    expect.soft(two.resTek / one.resTek, "2 adet tek çekim ≈ 2 × 1 adet").toBeGreaterThan(1.95);
    expect.soft(two.shown[0] / one.shown[0], "ekrandaki Tek Çekim 2 kat olmalı (1 adet fiyatı değil)").toBeGreaterThan(1.95);

    // temizlik
    await clearCartStrict(page, w).catch(() => {});
    const endOk = await sapi.clear().catch(() => false);
    console.log(`temizlik: ${endOk ? "sepet boş (ölçüldü)" : "⚠️ sepet boş değil"}`);
  });
});
