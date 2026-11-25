import { test, expect, type Page, type BrowserContext, type Request } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Taksitli satış — FE (checkout) seviyesi, apiV2=1:
 *   NSB-7315 payment/familyInstallments V2 entegrasyonu
 *   NSB-7314 basket/setInstallment V2 entegrasyonu
 *
 * Mutlu yol gerçek uçlarla; hata yolları (422 / 503 / data.success:false) page.route ile taklit edilir.
 * payment/create isteği yakalanıp DURDURULUR → sipariş açılmaz.
 *
 * Sepet: takı (22 Ayar 10 Gr Ajda Bilezik, ölçü 6.4). FE yeni bağlamda sepet hash'ini bilmediği için
 * (NSB-7231) ilk koşumda UI'dan 1 ekleme yapılır ve storageState QA_TAKSIT_STATE'e kaydedilir;
 * sonraki testler/koşumlar aynı sepeti kullanır. Sonunda tek çekime döner; takı sepette kalır
 * (temizlik: spec 40'ın afterAll'u ya da CartTypeHelpers.clearCartStrict).
 *
 *   NADIRGOLD_ENV=dev npx playwright test tests/41-taksit-fe.spec.ts --project=chromium --reporter=line
 */

const BASE = "https://www.nadirgold.dev";
const TAKI_PATH = process.env.QA_TAKI_PATH || "/22-ayar-10-gram-ajda-bilezik";
const TAKI_SIZE = process.env.QA_TAKI_SIZE || "6.4";
// Luhn-geçerli (aksi halde FE'nin kendi "geçerli kart numarası" uyarısı BIN hatasını maskeler)
const NEW_CARD = process.env.QA_NEW_CARD || "5400610000000001";
const STATE = process.env.QA_TAKSIT_STATE || path.resolve(__dirname, "..", "playwright/.auth/dev-taksit-state.json");

test.skip((process.env.NADIRGOLD_ENV || "dev") !== "dev", "Yalnız dev");
test.describe.configure({ mode: "default" });

type Call = { url: string; body: any; status?: number; json?: any };

class Net {
  fam: Call[] = [];
  set: Call[] = [];
  create: Call[] = [];
  constructor(page: Page) {
    page.on("request", (r: Request) => {
      const u = r.url();
      let body: any = null;
      try { body = JSON.parse(r.postData() || "null"); } catch { body = r.postData(); }
      if (/payment\/familyInstallments/.test(u)) this.fam.push({ url: u, body });
      if (/basket\/setInstallment/.test(u)) this.set.push({ url: u, body });
      if (/payment\/create/.test(u)) this.create.push({ url: u, body });
    });
    page.on("response", async (r) => {
      const list = /familyInstallments/.test(r.url()) ? this.fam : /setInstallment/.test(r.url()) ? this.set : null;
      if (!list) return;
      const c = [...list].reverse().find((x) => x.url === r.url() && x.status === undefined);
      if (!c) return;
      c.status = r.status();
      c.json = await r.json().catch(() => null);
    });
  }
}

async function freshContext(browser: any): Promise<BrowserContext> {
  return browser.newContext({ storageState: fs.existsSync(STATE) ? STATE : "playwright/.auth/dev-user.json", viewport: { width: 1440, height: 1000 } });
}

const payTab = (p: Page) => p.getByText("Banka / Kredi Kartı İle Ödeme", { exact: true });
const opt = (p: Page, label: string) => p.getByText(label, { exact: true });
const errText = /Bu sepet için seçilen taksit seçeneği uygun değil/i;

async function openCheckout(p: Page) {
  await p.goto(`${BASE}/?apiV2=1`);
  const res = await p.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
  expect(res?.headers()["x-api-version"], "x-api-version").toBe("v2");
  await p.waitForLoadState("networkidle").catch(() => {});
  await expect(payTab(p), "checkout'ta ödeme seçenekleri yok (sepet boş?)").toBeVisible({ timeout: 15_000 });
}

/** Kayıtlı ilk kartı seçer ve taksit listesinin gelmesini bekler. */
async function pickSavedCard(p: Page) {
  await payTab(p).click();
  const fam = p.waitForResponse((r) => /payment\/familyInstallments/.test(r.url()), { timeout: 15_000 }).catch(() => null);
  await p.locator('input[name="cardId"]').first().check({ force: true });
  await fam;
  await p.waitForTimeout(800);
}

async function payable(p: Page): Promise<number> {
  const t = await p.locator("body").innerText();
  const m = t.match(/Ödenecek Tutar[\s\S]{0,40}?([\d.]+,\d{2}) TL/);
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : NaN;
}

/** İşaretli taksit radyosunun bulunduğu satırın metni. */
async function selectedOption(p: Page): Promise<string> {
  return p.evaluate(() => {
    const r = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (i) => i.checked && i.name !== "cardId" && !/delivery/.test(i.name) && /Taksit|Tek Çekim/.test(i.closest("label,li,div")?.textContent || ""),
    );
    return (r?.closest("label,li,div")?.textContent || "").replace(/\s+/g, " ").trim();
  });
}

const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test.beforeAll(async ({ browser }) => {
  // Sepet hash'i bilinen bir state hazırla (gerekirse 1 UI ekleme).
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?apiV2=1`);
  await p.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle").catch(() => {});
  if (!(await payTab(p).isVisible().catch(() => false))) {
    await p.goto(`${BASE}${TAKI_PATH}`, { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(2500);
    await p.getByRole("button", { name: TAKI_SIZE, exact: true }).click();
    const add = p.waitForResponse((r) => /basket\/add/.test(r.url()), { timeout: 20_000 });
    await p.getByRole("button", { name: "Sepete Ekle" }).first().click();
    expect((await add).status(), "takı sepete eklenemedi").toBe(200);
    await p.waitForTimeout(1500);
  }
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  // Tek çekime geri al (başlangıç durumu) ve ölç.
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  const net = new Net(p);
  await openCheckout(p).catch(() => {});
  if (await payTab(p).isVisible().catch(() => false)) {
    await pickSavedCard(p);
    if (!/Tek Çekim/.test(await selectedOption(p))) await opt(p, "Tek Çekim").click().catch(() => {});
    await p.waitForTimeout(1500);
  }
  console.log(`temizlik: seçili="${await selectedOption(p).catch(() => "?")}" setInstallment=${JSON.stringify(net.set.map((s) => s.body?.installment))}`);
  await ctx.close();
});

// ─────────────────────────── mutlu yol (gerçek uçlar) ───────────────────────────

test("TAKSIT-FE-01 kayıtlı kart: familyInstallments V2 (cardUuid, camelCase) ve tablo yanıtla aynı", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  const net = new Net(p);
  await openCheckout(p);
  await pickSavedCard(p);
  const call = net.fam.at(-1)!;
  await info.attach("familyInstallments.json", { body: JSON.stringify(call, null, 1), contentType: "application/json" });
  expect(call.url, "V2 proxy'ye gitmeli").toContain("/api/v2/payment/familyInstallments");
  expect(Object.keys(call.body).sort(), "gövde alanları").toEqual(["basketHash", "cardUuid"]);
  expect(call.status).toBe(200);
  const fam = call.json?.data?.list?.[0];
  expect(fam, "taksit ailesi").toBeTruthy();
  const body = await p.locator("body").innerText();
  for (const i of fam.installments) {
    const n = Number(i.installmentNumber);
    const shown = n === 1 ? `${fmt(Number(i.totalPrice))} TL` : `${n} x ${fmt(Number(i.installmentPrice))} TL`;
    expect.soft(body, `${n} taksit satırı`).toContain(shown);
  }
  await ctx.close();
});

test("TAKSIT-FE-02 2/3 taksit seçimi: setInstallment gövdesi {installment, basketHash}, tutar yanıttan; tek çekime dönüş", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  const net = new Net(p);
  await openCheckout(p);
  await pickSavedCard(p);
  const rows: any[] = [];
  for (const [label, n] of [["2 Taksit", 2], ["3 Taksit", 3], ["Tek Çekim", 1]] as const) {
    const resp = p.waitForResponse((r) => /basket\/setInstallment/.test(r.url()), { timeout: 15_000 });
    await opt(p, label).click();
    await resp;
    await p.waitForTimeout(1200);
    const c = net.set.at(-1)!;
    const gt = Number(c.json?.data?.grandTotal);
    const shown = await payable(p);
    rows.push({ label, body: c.body, status: c.status, grandTotal: gt, fee: c.json?.data?.installmentFee, shown, selected: await selectedOption(p) });
    expect(c.url).toContain("/api/v2/basket/setInstallment");
    expect(Object.keys(c.body).sort(), `${label} gövde alanları (BIN yok)`).toEqual(["basketHash", "installment"]);
    expect(c.body.installment, label).toBe(n);
    expect(c.status, label).toBe(200);
    expect.soft(shown, `${label}: Ödenecek Tutar = yanıt grandTotal`).toBeCloseTo(gt, 2);
  }
  await info.attach("secimler.json", { body: JSON.stringify(rows, null, 1), contentType: "application/json" });
  await ctx.close();
});

test("TAKSIT-FE-03 yeni kart: BIN ile familyInstallments (binNumber 6-8 hane, cardUuid yok)", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  const net = new Net(p);
  await openCheckout(p);
  await payTab(p).click();
  await opt(p, "Yeni Kart").click();
  const resp = p.waitForResponse((r) => /payment\/familyInstallments/.test(r.url()), { timeout: 15_000 });
  await p.locator('input[name="ccNumber"]').pressSequentially(NEW_CARD, { delay: 50 });
  await resp;
  await p.waitForTimeout(1000);
  const c = net.fam.at(-1)!;
  await info.attach("bin.json", { body: JSON.stringify(net.fam, null, 1), contentType: "application/json" });
  expect(Object.keys(c.body).sort()).toEqual(["basketHash", "binNumber"]);
  expect(c.body.binNumber).toMatch(/^\d{6,8}$/);
  expect(NEW_CARD.startsWith(c.body.binNumber), "BIN kart numarasının başı").toBe(true);
  expect(c.json?.data?.list?.length, "BIN'li → tek aile").toBe(1);
  await ctx.close();
});

test("TAKSIT-FE-04 seçilen taksit ödeme adımına taşınır (payment/create durdurulur, sipariş açılmaz)", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  const net = new Net(p);
  let created: any = null;
  await p.route("**/payment/create**", async (route) => {
    try { created = JSON.parse(route.request().postData() || "null"); } catch { created = route.request().postData(); }
    await route.abort();
  });
  await openCheckout(p);
  await pickSavedCard(p);
  const resp = p.waitForResponse((r) => /basket\/setInstallment/.test(r.url()));
  await opt(p, "2 Taksit").click();
  await resp;
  await p.locator("#checkout-agreement").check({ force: true });
  await p.getByRole("button", { name: /ÖDEME YAP/i }).click();
  await expect.poll(() => created, { timeout: 15_000, message: "payment/create isteği gitmedi" }).not.toBeNull();
  await info.attach("payment-create.json", { body: JSON.stringify(created, null, 1), contentType: "application/json" });
  const inst = created?.installment ?? created?.installmentCount ?? created?.installment_count;
  expect(Number(inst), "payment/create installment").toBe(2);
  await ctx.close();
});

// ─────────────────────────── hata yolları (taklit yanıtlar) ───────────────────────────

test("TAKSIT-FE-05 familyInstallments data.success:false → yalnız tek çekim, ekran kırılmaz", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await p.route("**/payment/familyInstallments", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { success: false, message: "Payment gateway error.", list: [] } }) }),
  );
  await openCheckout(p);
  await pickSavedCard(p);
  await p.screenshot({ path: info.outputPath("ekran.png"), fullPage: true });
  await info.attach("ekran", { path: info.outputPath("ekran.png"), contentType: "image/png" });
  await expect.soft(opt(p, "2 Taksit"), "taksit seçeneği gösterilmemeli").toHaveCount(0);
  await expect.soft(p.getByRole("button", { name: /ÖDEME YAP/i }), "ödeme yapılabilmeli").toBeEnabled();
  await expect.soft(opt(p, "Tek Çekim"), "tek çekim seçeneği görünmeli").toBeVisible();
  expect.soft(await p.locator("body").innerText(), "tekrar deneme imkânı").toMatch(/tekrar dene/i);
  await ctx.close();
});

test("TAKSIT-FE-06 familyInstallments 503 → genel hata, tek çekim ile devam", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await p.route("**/payment/familyInstallments", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, statusCode: 503, message: "Taksit hesaplama servisine ulaşılamadı." }) }),
  );
  await openCheckout(p);
  await pickSavedCard(p);
  await p.screenshot({ path: info.outputPath("ekran.png"), fullPage: true });
  await info.attach("ekran", { path: info.outputPath("ekran.png"), contentType: "image/png" });
  await expect.soft(opt(p, "2 Taksit")).toHaveCount(0);
  await expect.soft(p.getByRole("button", { name: /ÖDEME YAP/i })).toBeEnabled();
  const body = await p.locator("body").innerText();
  expect.soft(body, "\"taksit uygun değil\" gösterilmemeli").not.toMatch(errText);
  // Kart: "503: Genel hata gösterilmeli, tek çekim ile devam edilebilmeli."
  expect.soft(body, "genel hata mesajı").toMatch(/hata|ulaşılamadı|tekrar dene/i);
  await expect.soft(opt(p, "Tek Çekim"), "tek çekim seçeneği görünmeli").toBeVisible();
  await ctx.close();
});

test("TAKSIT-FE-07 setInstallment 422 (installment) → mesaj gösterilir, seçim tek çekime döner", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await openCheckout(p);
  await pickSavedCard(p);
  await p.route("**/basket/setInstallment", (r) =>
    r.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ success: false, statusCode: 422, message: "Bu sepet için seçilen taksit seçeneği uygun değil.", errors: [{ label: "installment", msg: ["Bu sepet için seçilen taksit seçeneği uygun değil."] }] }),
    }),
  );
  await opt(p, "2 Taksit").click();
  await p.waitForTimeout(2000);
  await p.screenshot({ path: info.outputPath("ekran.png"), fullPage: true });
  await info.attach("ekran", { path: info.outputPath("ekran.png"), contentType: "image/png" });
  await expect.soft(p.getByText(errText).first(), "422 mesajı ekranda").toBeVisible();
  expect.soft(await selectedOption(p), "seçim tek çekime dönmeli").toMatch(/Tek Çekim/);
  await ctx.close();
});

test("TAKSIT-FE-08 setInstallment 503 → \"uygun değil\" yok, genel hata + tekrar dene", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await openCheckout(p);
  await pickSavedCard(p);
  await p.route("**/basket/setInstallment", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, statusCode: 503, message: "Service Unavailable" }) }),
  );
  await opt(p, "2 Taksit").click();
  await p.waitForTimeout(2000);
  await p.screenshot({ path: info.outputPath("ekran.png"), fullPage: true });
  await info.attach("ekran", { path: info.outputPath("ekran.png"), contentType: "image/png" });
  const body = await p.locator("body").innerText();
  expect.soft(body, "\"taksit uygun değil\" gösterilmemeli").not.toMatch(errText);
  expect.soft(body, "genel hata / tekrar dene").toMatch(/tekrar dene|bir hata oluştu|hata/i);
  expect.soft(await selectedOption(p), "başarısız seçim uygulanmış görünmemeli").not.toMatch(/^2 Taksit/);
  await ctx.close();
});

test("TAKSIT-FE-09 familyInstallments 422 (binNumber) → hata BIN alanında", async ({ browser }, info) => {
  const ctx = await freshContext(browser);
  const p = await ctx.newPage();
  await p.route("**/payment/familyInstallments", (r) =>
    r.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ success: false, statusCode: 422, message: "Doğrulama hatası", errors: [{ label: "binNumber", msg: ["Bin number biçimi geçersiz"] }] }),
    }),
  );
  await openCheckout(p);
  await payTab(p).click();
  await opt(p, "Yeni Kart").click();
  await p.locator('input[name="ccNumber"]').pressSequentially(NEW_CARD, { delay: 50 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: info.outputPath("ekran.png"), fullPage: true });
  await info.attach("ekran", { path: info.outputPath("ekran.png"), contentType: "image/png" });
  const field = p.locator('input[name="ccNumber"]').locator("xpath=ancestor::*[self::div][2]");
  expect.soft(await field.innerText(), "BIN hatası kart numarası alanında").toMatch(/Bin number biçimi geçersiz|geçersiz/i);
  await ctx.close();
});
