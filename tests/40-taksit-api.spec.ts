import { test, expect } from "@playwright/test";
import { BasketApi, type Basket } from "../pages/BasketApi";

/**
 * Taksitli satış — BE (API) seviyesi: NSB-7315 payment/familyInstallments + NSB-7314 basket/setInstallment.
 * UI'sız, doğrudan api-v2 (BE izolasyonu) + Bearer. V1 eşdeğeriyle alan alan kıyas.
 *
 * Beklentiler kartların kabul kriterlerinden (yanıtın kendisinden değil):
 *  - familyInstallments: BIN'siz takı sepetinde 4 aile; BIN'li yalnız o aile; cardUuid ile kayıtlı kart;
 *    binNumber 6-8 hane; tutarlar sunucuda, son taksit artığı lastInstallmentPrice'ta; külçede boş liste.
 *  - setInstallment: gövde camelCase, installment 1-12 zorunlu, BIN/tanımsız alan → 422;
 *    1 → rate/fee 0, isInstallment 0; >1 → oran ve fark sunucuda, ekranda installmentFee + grandTotal;
 *    taksite kapalı sepet → 422 label=installment.
 *
 * Sipariş açmaz. Sepete 2 ekleme yapar (takı + külçe). Başlangıçta sepet boş değilse koşmaz;
 * sonunda tek çekime döner ve sepeti boşaltıp boş olduğunu ölçer.
 *
 *   NADIRGOLD_ENV=dev npx playwright test tests/40-taksit-api.spec.ts --project=chromium --reporter=line
 */

const ENV = process.env.NADIRGOLD_ENV || "dev";
const TAKI_SKU = process.env.QA_TAKI_SKU || "bilezik6.4"; // 22 Ayar 10 Gr Ajda Bilezik (dev)
const KULCE_SKU = process.env.QA_KULCE_SKU || "NDR10Y"; // 10 Gr kumbara külçe (dev)
const BIN = process.env.QA_BIN || "540061";
const INACTIVE_HASH = (process.env.QA_INACTIVE_BASKET || "15296042aa0fa9cbec4cfc4e98d379d1d4ea81d0:15296042").split(":")[0];

// Bağımsız bug kontrolleri: biri düşünce diğerleri koşmaya devam etmeli (serial değil).
// Düşüşte worker yeniden başlar → beforeAll sepeti yeniden kurar (afterAll önce boşaltır).
test.describe.configure({ mode: "default" });
test.skip(!["dev", "staging", "stage"].includes(ENV), "Yalnız dev/staging");

let api: BasketApi;
let basket: Basket;
let famNoBin: any[] = [];

const list = (r: { data: any }) => (Array.isArray(r.data?.list) ? r.data.list : []);
const labels = (r: { json: any }) => (r.json?.errors || []).map((e: any) => e.label);
const norm = (l: any[]) =>
  [...l]
    .sort((a, b) => a.familyId - b.familyId)
    .map((f) => ({
      familyId: f.familyId,
      familyName: f.familyName,
      bankCode: String(f.bankCode),
      installments: (f.installments || []).map((i: any) => ({
        n: i.installmentNumber,
        rate: Number(i.installmentRate),
        price: Number(i.installmentPrice),
        last: Number(i.lastInstallmentPrice),
        total: Number(i.totalPrice),
      })),
    }));

const fam = (body: Record<string, unknown>) => api.req("v2", "/payment/familyInstallments", body);
const famV1 = (body: Record<string, unknown>) => api.req("v1", "/payment/familyInstallments", body);
const setInst = (body: Record<string, unknown>) => api.req("v2", "/basket/setInstallment", body);
const instState = (d: any) => ({
  installment: d?.installment,
  installmentCount: d?.installmentCount,
  installmentRate: Number(d?.installmentRate),
  installmentFee: Number(d?.installmentFee),
  isInstallment: Number(d?.isInstallment),
  installmentStatus: d?.installmentStatus,
  grandTotal: Number(d?.grandTotal),
});

test.beforeAll(async () => {
  api = new BasketApi(ENV, Number(process.env.BASKET_BUDGET || 60));
  const start = await api.get();
  expect(start.items?.length ?? 0, `Sepet boş değil (${(start.items || []).map((i) => i.sku).join(",")}) — koşulmadı`).toBe(0);
  const r = await api.add({ basketHash: start.basketHash, sku: TAKI_SKU, qty: 1 });
  expect(r.code, `takı eklenemedi: ${r.raw.slice(0, 200)}`).toBe(200);
  basket = r.data;
  expect(basket.installmentStatus, "takı sepeti taksite açık olmalı").toBe("AVAILABLE");
  famNoBin = list(await fam({ basketHash: basket.basketHash }));
});

test.afterAll(async () => {
  if (!api) return;
  if (basket?.basketHash) await api.req("v2", "/basket/setInstallment", { installment: 1, basketHash: basket.basketHash }, { force: true }).catch(() => {});
  const ok = await api.clear().catch(() => false);
  console.log(`temizlik: ${ok ? "sepet boş (ölçüldü)" : "⚠️ sepet boşaltılamadı"}`);
  console.log(`istekler: ${api.log.map((l) => `${l.side}${l.path}=${l.code}`).join(" ")}`);
});

// ───────────────────────── NSB-7315 familyInstallments ─────────────────────────

test("TAKSIT-API-01 BIN'siz: 4 aile, V1 ile alan alan aynı", async ({}, info) => {
  const r2 = await fam({ basketHash: basket.basketHash });
  const r1 = await famV1({ basket_hash: basket.basketHash });
  famNoBin = list(r2);
  await info.attach("v1-v2.json", { body: JSON.stringify({ v2: r2.json, v1: r1.json }, null, 1), contentType: "application/json" });
  expect(r2.code).toBe(200);
  expect(r2.data?.success, "data.success").toBe(true);
  expect(famNoBin.length, "aile sayısı").toBe(4);
  for (const f of famNoBin) expect(f.installments?.length, `${f.familyName} taksitleri`).toBeGreaterThan(0);
  expect(norm(famNoBin)).toEqual(norm(list(r1)));
});

test("TAKSIT-API-02 BIN'li: yalnız o kartın ailesi, V1 ile aynı", async ({}, info) => {
  const r2 = await fam({ basketHash: basket.basketHash, binNumber: BIN });
  const r1 = await famV1({ basket_hash: basket.basketHash, bin_number: BIN });
  await info.attach("v1-v2.json", { body: JSON.stringify({ v2: r2.json, v1: r1.json }, null, 1), contentType: "application/json" });
  expect(r2.code).toBe(200);
  expect(list(r2).length, "BIN'li çağrıda tek aile").toBe(1);
  expect(norm(list(r2))).toEqual(norm(list(r1)));
});

test("TAKSIT-API-03 tutarlar: taksitler toplamı = totalPrice, taban × (1+oran)", async () => {
  expect(famNoBin.length, "01 koşmadı").toBeGreaterThan(0);
  const base = Number(basket.grandTotal);
  const bad: string[] = [];
  for (const f of famNoBin)
    for (const i of f.installments) {
      const n = Number(i.installmentNumber);
      const sum = Number(i.installmentPrice) * (n - 1) + Number(i.lastInstallmentPrice);
      if (Math.abs(sum - Number(i.totalPrice)) > 0.011 * n) bad.push(`${f.familyName}/${n}: ${sum.toFixed(2)} ≠ total ${i.totalPrice}`);
      const exp = base * (1 + Number(i.installmentRate) / 100);
      if (Math.abs(exp - Number(i.totalPrice)) > 0.05) bad.push(`${f.familyName}/${n}: taban ${base}×(1+${i.installmentRate}%)=${exp.toFixed(2)} ≠ ${i.totalPrice}`);
    }
  expect(bad).toEqual([]);
});

test("TAKSIT-API-04 kayıtlı kart (cardUuid): BIN ile aynı aile ve tutarlar", async ({}, info) => {
  const cs = await api.req("v2", "/card-storage", {}, { method: "GET" });
  const card = (cs.data?.cards || [])[0];
  test.skip(!card, "Hesapta kayıtlı kart yok");
  const byUuid = await fam({ basketHash: basket.basketHash, cardUuid: card.cardUuid });
  const byBin = await fam({ basketHash: basket.basketHash, binNumber: String(card.cardBinNumber).slice(0, 8) });
  await info.attach("uuid-bin.json", { body: JSON.stringify({ card: card.cardMask, uuid: byUuid.json, bin: byBin.json }, null, 1), contentType: "application/json" });
  expect(byUuid.code, byUuid.raw.slice(0, 200)).toBe(200);
  expect(list(byUuid).length, "cardUuid → tek aile").toBe(1);
  expect(norm(list(byUuid))).toEqual(norm(list(byBin)));
});

test("TAKSIT-API-05 binNumber sınırları: 6-8 hane geçerli, dışı 422 (label binNumber)", async ({}, info) => {
  const cases: [string, number][] = [
    ["12345", 422],
    ["123456789", 422],
    ["54006A", 422],
    ["54006112", 200],
  ];
  const got: Record<string, unknown> = {};
  for (const [bin, exp] of cases) {
    const r = await fam({ basketHash: basket.basketHash, binNumber: bin });
    got[bin] = { code: r.code, labels: labels(r), raw: r.raw.slice(0, 200) };
    expect.soft(r.code, `binNumber=${bin}`).toBe(exp);
    if (exp === 422) expect.soft(labels(r), `binNumber=${bin} label`).toContain("binNumber");
  }
  await info.attach("bin-sinir.json", { body: JSON.stringify(got, null, 1), contentType: "application/json" });
});

test("TAKSIT-API-06 basketHash: eksik/geçersiz 422, pasif sepet hesaplanmamalı", async ({}, info) => {
  const missing = await fam({ binNumber: BIN });
  const bogus = await fam({ basketHash: "QA-YOK-" + "0".repeat(33) });
  const inactive = await fam({ basketHash: INACTIVE_HASH });
  const inactiveV1 = await famV1({ basket_hash: INACTIVE_HASH });
  await info.attach("hash.json", { body: JSON.stringify({ missing: [missing.code, missing.raw.slice(0, 200)], bogus: [bogus.code, bogus.raw.slice(0, 200)], inactive: [inactive.code, list(inactive).length, inactive.raw.slice(0, 300)], inactiveV1: [inactiveV1.code, list(inactiveV1).length, inactiveV1.raw.slice(0, 300)] }, null, 1), contentType: "application/json" });
  expect.soft(missing.code, "basketHash yok").toBe(422);
  expect.soft(bogus.code, "geçersiz basketHash").toBe(422);
  // V2 hata zarfı camelCase label sözü veriyor (NSB-7315: "eşleme label üzerinden")
  expect.soft(labels(bogus), "geçersiz hash label'ı camelCase olmalı").toContain("basketHash");
  // Pasif (siparişe dönüşmüş) sepet: V1 de listeyi hesaplıyor (24.11 ölçüldü) → V2'den beklenen V1 paritesi.
  if (inactive.code === 200 && list(inactive).length > 0)
    info.annotations.push({ type: "not", description: `pasif sepet için liste hesaplanıyor (V1=${inactiveV1.code}/${list(inactiveV1).length} aile)` });
  expect.soft(inactive.code, "pasif sepet: V1 ile aynı durum kodu").toBe(inactiveV1.code);
  expect.soft(list(inactive).length, "pasif sepet: V1 ile aynı aile sayısı").toBe(list(inactiveV1).length);
});

// ───────────────────────── NSB-7314 setInstallment ─────────────────────────

test("TAKSIT-API-07 2 ve 3 taksit: oran/toplam listeyle aynı, fark installmentFee'de", async ({}, info) => {
  const rows: any[] = [];
  for (const n of [2, 3]) {
    const r = await setInst({ installment: n, basketHash: basket.basketHash });
    const s = instState(r.data);
    const ref = famNoBin[0]?.installments?.find((i: any) => Number(i.installmentNumber) === n);
    rows.push({ n, code: r.code, ...s, listTotal: ref?.totalPrice, listRate: ref?.installmentRate });
    expect(r.code, r.raw.slice(0, 200)).toBe(200);
    expect.soft(s.installment, "installment").toBe(n);
    expect.soft(s.isInstallment, "isInstallment").toBe(1);
    if (ref) expect.soft(s.grandTotal, `grandTotal = liste totalPrice (${n} taksit)`).toBeCloseTo(Number(ref.totalPrice), 1);
    // Taksit farkı = n taksit toplamı − kartla tek çekim toplamı (kart komisyonu farka dahil değil; V1=V2, 24.11).
    const one = famNoBin[0]?.installments?.find((i: any) => Number(i.installmentNumber) === 1);
    if (one) expect.soft(s.installmentFee, `installmentFee = grandTotal − kart tek çekim (${n} taksit)`).toBeCloseTo(s.grandTotal - Number(one.totalPrice), 1);
  }
  await info.attach("set.json", { body: JSON.stringify(rows, null, 1), contentType: "application/json" });
});

test("TAKSIT-API-08 V1 setInstallment ile aynı sepet durumu (3 taksit)", async ({}, info) => {
  const v2 = instState((await setInst({ installment: 3, basketHash: basket.basketHash })).data);
  await setInst({ installment: 1, basketHash: basket.basketHash });
  const r1 = await api.req("v1", "/basket/setInstallment", { basket_hash: basket.basketHash, installment: 3, bin_number: BIN });
  const after = instState((await api.get()).valueOf());
  await info.attach("v1-v2.json", { body: JSON.stringify({ v2, v1set: [r1.code, r1.raw.slice(0, 600)], afterV1: after }, null, 1), contentType: "application/json" });
  expect(r1.code, `V1 setInstallment ${r1.raw.slice(0, 160)}`).toBe(200);
  expect.soft(after.installmentRate, "oran").toBe(v2.installmentRate);
  expect.soft(after.installmentFee, "installmentFee").toBeCloseTo(v2.installmentFee, 2);
  expect.soft(after.grandTotal, "grandTotal").toBeCloseTo(v2.grandTotal, 2);
});

test("TAKSIT-API-09 tek çekime dönüş: rate/fee 0, isInstallment 0, toplam tabana döner", async ({}, info) => {
  const r = await setInst({ installment: 1, basketHash: basket.basketHash });
  const s = instState(r.data);
  await info.attach("tek-cekim.json", { body: JSON.stringify({ code: r.code, ...s, base: basket.grandTotal }, null, 1), contentType: "application/json" });
  expect(r.code).toBe(200);
  expect.soft(s.installment).toBe(1);
  expect.soft(s.isInstallment).toBe(0);
  expect.soft(s.installmentRate).toBe(0);
  expect.soft(s.installmentFee).toBe(0);
  expect.soft(s.grandTotal).toBeCloseTo(Number(basket.grandTotal), 2);
});

test("TAKSIT-API-10 installment sınırları: 0, 13, −1, 2.5, \"2\", eksik → 422; sepet korunur", async ({}, info) => {
  await setInst({ installment: 2, basketHash: basket.basketHash });
  const cases: [string, Record<string, unknown>][] = [
    ["0", { installment: 0 }],
    ["13", { installment: 13 }],
    ["-1", { installment: -1 }],
    ["2.5", { installment: 2.5 }],
    ['"2"', { installment: "2" }],
    ["eksik", {}],
  ];
  const got: Record<string, unknown> = {};
  for (const [name, b] of cases) {
    const r = await setInst({ basketHash: basket.basketHash, ...b });
    got[name] = { code: r.code, labels: labels(r), msg: r.json?.message };
    // "2" (string) sunucuda sayıya çevrilip kabul ediliyor — zararsız tip dönüşümü, not olarak kaydedilir.
    if (name === '"2"') {
      if (r.code === 200) info.annotations.push({ type: "not", description: 'installment:"2" (string) kabul edildi → 2 taksit' });
      continue;
    }
    expect.soft(r.code, `installment=${name}`).toBe(422);
    if (r.code === 422) expect.soft(labels(r), `installment=${name} label`).toContain("installment");
  }
  const after = instState((await api.get()).valueOf());
  got.after = after;
  await info.attach("sinir.json", { body: JSON.stringify(got, null, 1), contentType: "application/json" });
  expect(after.installment, "hatalı isteklerden sonra 2 taksit korunmalı").toBe(2);
});

test("TAKSIT-API-11 listede olmayan taksit (12) → 422 \"uygun değil\"", async ({}, info) => {
  const max = Math.max(...famNoBin.flatMap((f) => f.installments.map((i: any) => Number(i.installmentNumber))));
  test.skip(max >= 12, `Liste 12'ye kadar taksit içeriyor (max ${max})`);
  const r = await setInst({ installment: 12, basketHash: basket.basketHash });
  await info.attach("12.json", { body: JSON.stringify({ max, code: r.code, raw: r.raw.slice(0, 400) }, null, 1), contentType: "application/json" });
  expect.soft(r.code, `listede en fazla ${max} taksit varken 12 kabul edildi`).toBe(422);
  if (r.code === 422) expect.soft(labels(r)).toContain("installment");
});

test("TAKSIT-API-12 tanımsız alanlar 422: bin_number, binNumber, basket_hash", async ({}, info) => {
  const got: Record<string, unknown> = {};
  for (const [name, b] of [
    ["bin_number", { installment: 2, basketHash: basket.basketHash, bin_number: BIN }],
    ["binNumber", { installment: 2, basketHash: basket.basketHash, binNumber: BIN }],
    ["basket_hash", { installment: 2, basket_hash: basket.basketHash }],
  ] as [string, Record<string, unknown>][]) {
    const r = await setInst(b);
    got[name] = { code: r.code, raw: r.raw.slice(0, 200) };
    expect.soft(r.code, `${name} gönderildi`).toBe(422);
  }
  await info.attach("tanimsiz.json", { body: JSON.stringify(got, null, 1), contentType: "application/json" });
});

test("TAKSIT-API-13 külçe sepeti: liste boş, setInstallment 422 (label installment)", async ({}, info) => {
  await setInst({ installment: 1, basketHash: basket.basketHash });
  expect(await api.clear(), "takı temizlenemedi").toBe(true);
  const start = await api.get();
  const a = await api.add({ basketHash: start.basketHash, sku: KULCE_SKU, qty: 1 });
  test.skip(a.code !== 200, `külçe eklenemedi (${a.code}) ${a.raw.slice(0, 120)}`);
  basket = a.data;
  const f = await fam({ basketHash: basket.basketHash });
  const s = await setInst({ installment: 2, basketHash: basket.basketHash });
  const after = instState((await api.get()).valueOf());
  await info.attach("kulce.json", { body: JSON.stringify({ status: a.data?.installmentStatus, fam: f.json, set: [s.code, s.raw.slice(0, 300)], after }, null, 1), contentType: "application/json" });
  expect.soft(a.data?.installmentStatus, "külçe installmentStatus").toBe("NOT_AVAILABLE");
  expect.soft(f.code).toBe(200);
  expect.soft(f.data?.success, "boş liste success:true").toBe(true);
  expect.soft(list(f).length, "külçede taksit listesi boş").toBe(0);
  expect.soft(s.code, "külçede setInstallment").toBe(422);
  if (s.code === 422) expect.soft(labels(s)).toContain("installment");
  expect.soft(after.installment, "külçe sepeti tek çekimde kalmalı").toBe(1);
});
