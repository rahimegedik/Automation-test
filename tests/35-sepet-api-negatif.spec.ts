import { test, expect } from "@playwright/test";
import { Basket, BasketApi, overPrecise } from "../pages/BasketApi";

/**
 * Sepet API negatif / sınır testleri — NSB-7034 kod incelemesinden açılan kartlar.
 *
 * Neden ayrı spec: journey suite'i (09–21) yalnız mutlu yolu UI'dan koşar; UI'nin
 * engellediği ama API'nin kabul ettiği durumları, sınırları ve tutar hassasiyetini
 * hiç görmez. Bu spec V2 sepet uçlarını doğrudan (api-v2 host'u, Bearer) zorlar.
 *
 *  - NSB-7227  delete pasif (siparişi verilmiş) sepette çalışıyor
 *  - NSB-7229  basket_limit SKU'nun ilk eklenişinde kontrol edilmiyor
 *  - NSB-7230  DTO sınırları yok (qty / sku uzunluğu → 500), changeProduct doğrulamadan önce sepeti siliyor
 *  - NSB-7233  tutarlar 2 haneye yuvarlanmıyor (kesirli gram — Hesaba Altın Havale)
 *
 * Beklenen değerler kartlardaki "Beklenen" bölümünden gelir: bug açıkken bu testler
 * FAIL verir (kasıtlı) — kart düzeldiğinde PASS'e döner ve regresyon koruması olur.
 *
 * Yıkıcı değil: sipariş açmaz. Her test kendi eklediğini siler ve sepetin boş
 * olduğunu delete yanıtından ÖLÇER. Başlangıçta sepet boş değilse koşmaz
 * (kullanıcının sepetini ezmemek için).
 *
 * ⚠️ Sepet uçları ortak rate-limit sayacı paylaşır (~10-15 istek → ~58 dk kilit,
 * V1 ve V2 aynı sayaç). Partiler halinde koş:
 *   npm run test:sepet-api:p1   (01, 03, 04 — ~5 istek)
 *   npm run test:sepet-api:p2   (02, 05     — ~7 istek)
 *   npm run test:sepet-api:p3   (06         — ~4 istek)
 * Kilit görülürse test FAIL değil SKIP olur.
 *
 * Ortam: dev (varsayılan) / staging. 7227 için siparişi verilmiş bir sepetin
 * hash+id'si gerekir: QA_INACTIVE_BASKET="<hash>:<id>" (varsayılan dev hesabının
 * 09.11 Android koşumundaki sepeti).
 */

const ENV = process.env.NADIRGOLD_ENV || "dev";
const INACTIVE = (process.env.QA_INACTIVE_BASKET || "15296042aa0fa9cbec4cfc4e98d379d1d4ea81d0:15296042").split(":");

/** Limitli ve limitten fazla stoklu ürün (dev: basketLimit 5, stok ~36). */
const LIMITED_SKU = process.env.QA_LIMITED_SKU || "NDR10Y";
/** Ucuz, stoklu standart ürün (dev çeyrek: ~1.74 TL). */
const CHEAP_SKU = process.env.QA_CHEAP_SKU || "NDR1YC01";
/** Hesaba Altın Havale — TL tutarından kesirli gram üretir. */
const HASC = { sku: "NDRHASCALC", qty: 1, transferBankId: 1 };

// Testler bağımsız bug kontrolleri: biri FAIL verince diğerleri koşmaya devam etmeli (serial değil).
test.describe.configure({ mode: "default" });
test.skip(!["dev", "staging", "prod", "stage"].includes(ENV), "Yalnız dev/staging");

let api: BasketApi;
let start: Basket;

test.beforeAll(async () => {
  api = new BasketApi(ENV, Number(process.env.BASKET_BUDGET || 12));
  start = await api.get();
  expect(
    start.items?.length ?? 0,
    `Sepet boş değil (${(start.items || []).map((i) => i.sku).join(",")}) — kullanıcının sepetini ezmemek için koşulmadı`,
  ).toBe(0);
});

test.afterEach(async ({}, info) => {
  // Bütçe dışı temizlik + ölçüm
  const ok = await api.clear().catch(() => false);
  info.annotations.push({ type: "temizlik", description: ok ? "sepet boş (ölçüldü)" : "⚠️ sepet boşaltılamadı" });
  expect(ok, "Temizlik sonrası sepet boş olmalı").toBe(true);
});

test.afterAll(async ({}, info) => {
  console.log(`basket istekleri: ${api?.log.map((l) => `${l.side}${l.path}=${l.code}`).join(" ")}`);
  console.log(`kalan bütçe: ${api?.budget}${api?.rateLocked ? " · RATE LOCK" : ""}`);
});

/** Rate-limit kilidinde yanlış FAIL yerine skip. */
function skipIfLocked(r: { code: number; raw: string }) {
  test.skip(api.rateLocked, `Sepet rate-limit kilidi (${r.code}) — ~58 dk sonra bu partiyi tekrar koş`);
}

test("TC-SEPET-API-01 NSB-7227 pasif sepette delete reddedilmeli @parti1", async ({}, info) => {
  const [hash, id] = INACTIVE;
  // Var olmayan SKU: hiçbir kalem silinmez, ama sunucunun hangi sepeti yüklediği yanıtta görünür.
  const r = await api.delete({ basketHash: hash, basketId: Number(id) }, ["QA-YOK"]);
  skipIfLocked(r);
  const d = r.data || {};
  await info.attach("yanit.json", { body: JSON.stringify({ code: r.code, isActive: d.isActive, basketId: d.basketId, items: d.items?.map((i: any) => [i.sku, i.qty]), raw: r.raw.slice(0, 600) }, null, 1), contentType: "application/json" });

  expect(r.code, "500 olmamalı").toBeLessThan(500);
  expect(d.isActive, `Sunucu pasif sepeti (id=${d.basketId}, isActive=${d.isActive}) yükleyip işlem yaptı`).not.toBe(0);
  expect([404, 409, 422], `Pasif sepette delete 404/409 beklenir, gelen ${r.code}`).toContain(r.code);
});

test("TC-SEPET-API-02 NSB-7229 ilk eklemede basket_limit uygulanmalı @parti2", async ({}, info) => {
  // 1 adet ekle → yanıttan canlı limiti oku → sil → limit+1 ile TAZE satır ekle.
  const probe = await api.add({ basketHash: start.basketHash, sku: LIMITED_SKU, qty: 1 });
  skipIfLocked(probe);
  expect(probe.code, `ön ekleme ${LIMITED_SKU}: ${probe.raw.slice(0, 200)}`).toBe(200);
  const line = (probe.data?.items || []).find((i: any) => i.sku === LIMITED_SKU) || {};
  const limit = Number(line.basketLimit ?? process.env.QA_LIMITED_SKU_LIMIT ?? 5);
  const stock = Number(line.quantity ?? line.stock ?? NaN);
  expect(await api.clear(probe.data), "ön ekleme silinemedi").toBe(true);

  test.skip(Number.isFinite(stock) && stock <= limit, `Stok (${stock}) ≤ limit (${limit}) — limit testi stok kontrolüyle karışır`);

  const r = await api.add({ basketHash: start.basketHash, sku: LIMITED_SKU, qty: limit + 1 });
  skipIfLocked(r);
  const got = (r.data?.items || []).find((i: any) => i.sku === LIMITED_SKU);
  await info.attach("yanit.json", { body: JSON.stringify({ limit, stock, code: r.code, qtyInBasket: got?.qty, raw: r.raw.slice(0, 600) }, null, 1), contentType: "application/json" });

  expect(r.code, "500 olmamalı").toBeLessThan(500);
  expect(got?.qty, `basketLimit=${limit} olan üründe ilk eklemede ${limit + 1} adet sepete girdi`).toBeUndefined();
  expect(r.code, `limit+1 → 422 beklenir`).toBe(422);
});

test("TC-SEPET-API-03 NSB-7230 qty=10000 → 4xx, 500 değil @parti1", async ({}, info) => {
  const r = await api.add({ basketHash: start.basketHash, sku: CHEAP_SKU, qty: 10000 });
  skipIfLocked(r);
  await info.attach("yanit.json", { body: JSON.stringify({ code: r.code, raw: r.raw.slice(0, 600) }, null, 1), contentType: "application/json" });
  expect(r.code, `qty=10000 → ${r.code}: ${r.raw.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
  expect(r.code, "Geçersiz girdi 500 dönmemeli").toBeLessThan(500);
});

test("TC-SEPET-API-04 NSB-7230 300 karakter SKU → 4xx, 500 değil @parti1", async ({}, info) => {
  const r = await api.add({ basketHash: start.basketHash, sku: "QA" + "X".repeat(298), qty: 1 });
  skipIfLocked(r);
  await info.attach("yanit.json", { body: JSON.stringify({ code: r.code, raw: r.raw.slice(0, 600) }, null, 1), contentType: "application/json" });
  expect(r.code, `uzun sku → ${r.code}: ${r.raw.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
  expect(r.code, "Geçersiz girdi 500 dönmemeli").toBeLessThan(500);
});

test("TC-SEPET-API-05 NSB-7230 changeProduct geçersiz price → sepet korunmalı @parti2", async ({}, info) => {
  const a = await api.add({ basketHash: start.basketHash, sku: CHEAP_SKU, qty: 1 });
  skipIfLocked(a);
  expect(a.code, `ön ekleme: ${a.raw.slice(0, 200)}`).toBe(200);

  const r = await api.add({ basketHash: start.basketHash, ...HASC, price: "x", changeProduct: true });
  skipIfLocked(r);
  const after = await api.get();
  const kept = (after.items || []).some((i) => i.sku === CHEAP_SKU);
  await info.attach("yanit.json", { body: JSON.stringify({ code: r.code, raw: r.raw.slice(0, 600), afterItems: after.items?.map((i) => [i.sku, i.qty]) }, null, 1), contentType: "application/json" });

  expect.soft(r.code, `price:"x" → ${r.code}`).toBeGreaterThanOrEqual(400);
  expect.soft(r.code, "Geçersiz girdi 500 dönmemeli").toBeLessThan(500);
  expect(kept, `Geçersiz changeProduct isteği mevcut sepeti (${CHEAP_SKU}) sildi`).toBe(true);
});

test("TC-SEPET-API-06 NSB-7233 kesirli gram tutarları 2 hane ve V1=V2 @parti3", async ({}, info) => {
  // Kesirli gram üreten tutar (kur ile bölünür).
  const r = await api.add({ basketHash: start.basketHash, ...HASC, price: "12345.67" });
  skipIfLocked(r);
  expect(r.code, `HASC add: ${r.raw.slice(0, 200)}`).toBe(200);
  const v2 = r.data;

  // Aynı sepeti V1 okur (aynı DB): V2'nin YAZDIĞI değer V1 okumasında görünür.
  const v1r = await api.req("v1", "/basket/get", { basketHash: v2.basketHash });
  skipIfLocked(v1r);
  const v1 = v1r.data || {};

  const fields = ["grandTotal", "subTotal", "subtotalInclTax", "taxAmount", "servicePriceTotal", "calculatedAmount"];
  const diff = fields.filter((f) => v1[f] !== undefined && v2[f] !== undefined && Number(v1[f]) !== Number(v2[f])).map((f) => `${f} V1=${v1[f]} V2=${v2[f]}`);
  const p2 = overPrecise(v2);
  const p1 = overPrecise(v1);
  await info.attach("tutarlar.json", {
    body: JSON.stringify({ v2: Object.fromEntries(fields.map((f) => [f, v2[f]])), v1: Object.fromEntries(fields.map((f) => [f, v1[f]])), v2Items: v2.items, v1Items: v1.items, overPreciseV2: p2, overPreciseV1: p1, diff }, null, 1),
    contentType: "application/json",
  });

  expect.soft(p2, "V2 yanıtında 2 haneden fazla ondalıklı tutar").toEqual([]);
  expect.soft(p1, "V1 okumasında (V2'nin yazdığı) 2 haneden fazla ondalıklı tutar").toEqual([]);
  expect(diff, "V1 ve V2 aynı sepet için farklı tutar gösteriyor").toEqual([]);
});
