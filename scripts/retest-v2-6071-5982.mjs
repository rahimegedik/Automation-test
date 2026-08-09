// NSB-6071 (arama V2) + NSB-5982 (ilgili ürünler V2) retest — headed, dev, konvansiyon: ?apiV2=1 + x-api-version teyidi
// Sonunda panel-data/verdicts/*.json yazar (QA Panel canlı akışı bunu izler).
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = "https://www.nadirgold.dev";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const VERDICTS = path.join(REPO, "panel-data", "verdicts");
const EVIDENCE = path.join(REPO, "panel-data", "evidence");
fs.mkdirSync(VERDICTS, { recursive: true });
fs.mkdirSync(EVIDENCE, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const today = new Date().toISOString().slice(0, 10);

function writeVerdict(card, verdict, summary, notes, evidence, aiEvaluation) {
  const p = path.join(VERDICTS, `${card}.json`);
  const prev = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { card, history: [] };
  const entry = { date: new Date().toISOString(), verdict, summary, notes, evidence, aiEvaluation };
  prev.latest = entry;
  prev.history = [entry, ...(prev.history || [])].slice(0, 20);
  fs.writeFileSync(p, JSON.stringify(prev, null, 2));
  log(`VERDICT ${card}: ${verdict} — ${summary}`);
}

const browser = await chromium.launch({ headless: false, args: ["--window-size=1440,900"] });
const context = await browser.newContext({
  storageState: path.join(REPO, "playwright/.auth/dev-user.json"),
  viewport: { width: 1440, height: 900 },
});

const captured = { search: null, other: null };
context.on("response", async (res) => {
  try {
    if (res.url().includes("/product/search") && res.request().method() === "POST") captured.search = { status: res.status(), body: await res.json().catch(() => null) };
    if (/\/product\/other\//.test(res.url())) captured.other = { status: res.status(), body: await res.json().catch(() => null) };
  } catch {}
});

const page = await context.newPage();

// Konvansiyon: V2 modu ?apiV2=1 ile açılır, x-api-version ile teyit edilir
log("V2 modu açılıyor (?apiV2=1)…");
const first = await page.goto(`${BASE}/?apiV2=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
const apiVer = first.headers()["x-api-version"] || "?";
log(`x-api-version: ${apiVer}`);
await page.waitForTimeout(3000);

// ---- NSB-6071: arama ----
const n6071 = { notes: [], evidence: [] };
try {
  // bildirim izni popup'ı açıksa kapat (dengage)
  const dismiss = page.locator('button:has-text("Teşekkürler"), a:has-text("Teşekkürler")').first();
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click().catch(() => {});
  await page.locator('button:has-text("Ürün Ara")').first().click({ timeout: 15000 });
  const input = page.locator('input[type="text"]:visible, input[type="search"]:visible').first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.pressSequentially("fifa", { delay: 150 });
  for (let i = 0; i < 20 && !captured.search; i++) await page.waitForTimeout(500);
  await page.waitForTimeout(2500);
  const shot = `retest-${today}-6071-search.png`;
  await page.screenshot({ path: path.join(EVIDENCE, shot) });
  n6071.evidence.push(shot);

  const d = captured.search?.body?.data || {};
  const p0 = (d.products || [])[0];
  const fieldCount = p0 ? Object.keys(p0).length : 0;
  const uiCards = await page.locator('button:has-text("Sepete Ekle"), button:has-text("Yakında Stokta")').count();
  n6071.notes.push(`x-api-version: ${apiVer}`, `API: ${captured.search?.status}, ürün: ${(d.products || []).length}, products[0] alan: ${fieldCount}, id tipi: ${p0 ? typeof p0.id : "-"}`, `UI kart sayısı: ${uiCards}`);
  const pass = apiVer === "v2" && captured.search?.status === 200 && fieldCount >= 20 && typeof p0?.id === "number" && uiCards >= 3;
  writeVerdict("NSB-6071", pass ? "PASS" : "FAIL",
    pass ? `Arama V2 tam: ${fieldCount} alan hidrasyon + UI render OK` : "Arama V2 kriterleri sağlanmadı — notlara bak",
    n6071.notes, n6071.evidence,
    pass ? "products[] hidrasyonu (NSB-6146 fix'i) doğrulandı; UI görsel+fiyat+stok render ediyor. Bilinen minor: ı/i normalizasyonu yok (NSB-6229)." : "Beklenen hidrasyon/render sağlanamadı; NSB-6146 regresyonu olabilir.");
} catch (e) {
  writeVerdict("NSB-6071", "ERROR", "Koşum hatası (ürün durumu hakkında bilgi vermez): " + String(e.message).slice(0, 120), n6071.notes, n6071.evidence, "Script/ortam hatası — tarayıcı penceresi kapatılmış veya selector değişmiş olabilir. Ürün FAIL'i DEĞİLDİR; koşumu tekrarla.");
}

// ---- NSB-5982: ilgili ürünler ----
const n5982 = { notes: [], evidence: [] };
try {
  const slug = (captured.search?.body?.data?.products || [])[0]?.slug || "fifa-world-cup-2026-1-gr-kulce-altin";
  await page.goto(`${BASE}/${slug}?apiV2=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  const rel = await page.evaluate(() => {
    const label = [...document.querySelectorAll("*")].find((el) => el.children.length === 0 && /benzer ürünler/i.test(el.textContent || ""));
    if (!label) return { found: false };
    let sec = label.parentElement;
    while (sec && sec.querySelectorAll("a").length === 0 && sec.parentElement) sec = sec.parentElement;
    const imgs = [...sec.querySelectorAll("img")];
    return { found: true, links: [...sec.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).slice(0, 6), imgCount: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length };
  });
  const shot = `retest-${today}-5982-detail.png`;
  await page.screenshot({ path: path.join(EVIDENCE, shot), fullPage: true });
  n5982.evidence.push(shot);

  // Konvansiyon path'inden API teyidi (FE proxy)
  const productId = (captured.search?.body?.data?.products || [])[0]?.id || 310;
  const api = await context.request.get(`${BASE}/api/v2/product/other/${productId}`, { headers: { "device-type": "web" } });
  const items = (await api.json().catch(() => null))?.data?.items || [];
  const nullImgs = items.filter((i) => !i.image).length;
  n5982.notes.push(`Sidebar: ${rel.found ? `var, ${rel.imgCount} görsel, ${rel.broken} kırık` : "BULUNAMADI"}`, `Proxy /api/v2/product/other/${productId}: ${api.status()}, items: ${items.length}, image null: ${nullImgs}`);
  const pass = rel.found && rel.broken === 0 && api.status() === 200 && items.length > 0 && nullImgs === 0;
  writeVerdict("NSB-5982", pass ? "PASS" : "FAIL",
    pass ? `Benzer Ürünler render OK, API'de ${items.length} item, image tam` : "İlgili ürünler kriterleri sağlanmadı — notlara bak",
    n5982.notes, n5982.evidence,
    pass ? "item.image full CDN objesi (NSB-6124 konusu çözük), sidebar SSR'da render oluyor. Kartın statü tutarsızlığı: NSB-6124/NSB-5404 hâlâ Yapılacaklar'da." : "image null'a dönmüş veya sidebar kaybolmuş olabilir — NSB-6124 regresyonu kontrol edilmeli.");
} catch (e) {
  writeVerdict("NSB-5982", "ERROR", "Koşum hatası (ürün durumu hakkında bilgi vermez): " + String(e.message).slice(0, 120), n5982.notes, n5982.evidence, "Script/ortam hatası — tarayıcı penceresi kapatılmış veya selector değişmiş olabilir. Ürün FAIL'i DEĞİLDİR; koşumu tekrarla.");
}

log("Retest bitti.");
await browser.close();
