/**
 * V2 sepet uçları için doğrudan API istemcisi (BE izolasyonu: api-v2 host'u).
 *
 * - Token: storageState'teki NG_AUTH çerezinden (renewal/lib/env.mjs ile aynı yöntem).
 * - Tarayıcı User-Agent'ı şart (aksi halde Cloudflare 403).
 * - Sepet uçları ortak bir rate-limit sayacını paylaşır (~10-15 istek → ~58 dk kilit).
 *   Bu yüzden her istek bütçeden düşer; kilit görülürse `rateLocked` true olur ve
 *   testler yanlış FAIL vermek yerine skip edilir.
 */
import fs from "fs";
import path from "path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const HOSTS: Record<string, { v1: string; v2: string; state: string }> = {
  dev: { v1: "https://api.nadirgold.dev", v2: "https://api-v2.nadirgold.dev/api/v1", state: "dev-user.json" },
  staging: { v1: "https://api.nadirgold.work", v2: "https://api-v2.nadirgold.work/api/v1", state: "staging-user.json" },
};

export type ApiRes = { code: number; json: any; data: any; raw: string; ms: number };

export type BasketItem = { sku: string; qty: number; price?: number; priceTotal?: number; [k: string]: any };
export type Basket = { basketId: number; basketHash: string; isActive?: number; items: BasketItem[]; grandTotal: number; [k: string]: any };

export class BasketApi {
  readonly v1: string;
  readonly v2: string;
  readonly token: string;
  budget: number;
  rateLocked = false;
  readonly log: { side: string; path: string; code: number; ms: number }[] = [];

  constructor(env = process.env.NADIRGOLD_ENV || "dev", budget = 12) {
    const h = HOSTS[env === "prod" || env === "stage" ? "staging" : env];
    if (!h) throw new Error(`BasketApi: desteklenmeyen ortam ${env} (dev|staging)`);
    this.v1 = h.v1;
    this.v2 = h.v2;
    this.budget = budget;
    const statePath = path.resolve(__dirname, "..", "playwright/.auth", h.state);
    const st = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const c = st.cookies.find((x: any) => x.name === "NG_AUTH");
    if (!c) throw new Error(`BasketApi: ${statePath} içinde NG_AUTH yok — önce bir spec koşup oturumu yenile`);
    this.token = JSON.parse(Buffer.from(decodeURIComponent(c.value), "base64").toString("utf8")).token;
  }

  /** `force`: temizlik isteği — bütçe bitmiş olsa da gönderilir. */
  async req(side: "v1" | "v2", p: string, body: unknown, { force = false, method = "POST" } = {}): Promise<ApiRes> {
    if (!force) {
      if (this.rateLocked) throw new Error("RATE_LOCKED");
      if (this.budget <= 0) throw new Error("SEPET BÜTÇESİ BİTTİ");
      this.budget--;
    }
    const url = (side === "v1" ? this.v1 : this.v2) + p;
    const t0 = Date.now();
    const res = await fetch(url, {
      method,
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "device-type": "web",
        "device-token": "qa-basket-api",
        "device-name": "QA",
        "app-version": "1.0.0",
      },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* HTML/boş yanıt */
    }
    if (/Çok fazla (giriş )?deneme/i.test(raw) || res.status === 429) this.rateLocked = true;
    const r = { code: res.status, json, data: json && typeof json === "object" && "data" in json ? json.data : json, raw: raw.slice(0, 2000), ms: Date.now() - t0 };
    this.log.push({ side, path: p, code: r.code, ms: r.ms });
    return r;
  }

  async get(opts: { force?: boolean } = {}): Promise<Basket> {
    const r = await this.req("v2", "/basket/get", {}, opts);
    if (r.code !== 200 || !r.data?.basketHash) throw new Error(`basket/get ${r.code}: ${r.raw.slice(0, 200)}`);
    return r.data as Basket;
  }

  add(body: Record<string, unknown>) {
    return this.req("v2", "/basket/add", { merchantId: "100000", ...body });
  }

  delete(b: Pick<Basket, "basketHash" | "basketId">, skus: string[], opts: { force?: boolean } = {}) {
    return this.req("v2", "/basket/delete", { basketHash: b.basketHash, basketId: b.basketId, sku: skus }, opts);
  }

  /**
   * Aktif sepeti boşaltır ve boş olduğunu ÖLÇEREK doğrular (delete yanıtı sepet
   * durumunu döndürür; ek bir get gerekmez). Bütçe dışı çalışır.
   */
  async clear(known?: Basket): Promise<boolean> {
    const b = known ?? (await this.get({ force: true }));
    const skus = (b.items || []).map((i) => i.sku);
    if (!skus.length) return true;
    const r = await this.delete(b, skus, { force: true });
    const items = r.data?.items || [];
    return r.code === 200 && items.length === 0 && Number(r.data?.grandTotal) === 0;
  }
}

/** Bir sayının ondalık hane sayısı (1.5 → 1, 7637.07 → 2, "12.123456" → 6). */
export function decimals(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v);
  if (!/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return 0;
  const m = s.match(/\.(\d+)/);
  return m ? m[1].replace(/0+$/, "").length : 0;
}

/** Sepet + kalem seviyesindeki para alanları. */
export const MONEY_FIELDS = ["grandTotal", "subTotal", "subtotalInclTax", "taxAmount", "discountAmount", "shippingFee", "servicePriceTotal", "calculatedAmount"];
export const ITEM_MONEY_FIELDS = ["price", "priceTotal", "rowTotal", "servicePrice", "originalPrice", "taxAmount", "discountAmount"];

/** 2 haneden fazla ondalık taşıyan para alanlarını listeler. */
export function overPrecise(b: any): string[] {
  const out: string[] = [];
  for (const f of MONEY_FIELDS) if (decimals(b?.[f]) > 2) out.push(`${f}=${b[f]}`);
  (b?.items || []).forEach((it: any, i: number) => {
    for (const f of ITEM_MONEY_FIELDS) if (decimals(it?.[f]) > 2) out.push(`items[${i}].${f}=${it[f]}`);
  });
  return out;
}
