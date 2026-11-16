import { test, expect } from "@playwright/test";
import {
  BasketWatcher,
  CartKind,
  clearCartStrict,
  KIND_GROUP,
  describe as describeBasket,
  groupsOf,
  triggerAdd,
} from "../pages/CartTypeHelpers";

/**
 * NSB-7223 — Farklı sepet türleri birleşmemeli.
 *
 * Kurallar (Jira kartından):
 *  - Standart sepet: gram külçe altın, gram külçe gümüş, ziynet (kendi içinde birleşir)
 *  - Takı tek başına eklenebilir; standart ile birleştirilmek istenirse UYARI verilmeli,
 *    kullanıcı ya sadece takı ya sadece standart sepet yapar → karışık sepet olmamalı
 *  - Hesaba altın havale / hesaptan fiziki / düzenli birikim / Fifa başka ürünle birleşmez
 *
 * Oracle: FE'nin basket/add + basket/get yanıtlarındaki kalemlerin grupları.
 * Sistemin "reddet" ya da "eski sepeti değiştir" davranışlarından hangisini
 * seçtiğini dayatmıyoruz — sadece sonuç sepetinin tek grup olmasını istiyoruz.
 *
 * Yıkıcı değil: sipariş açmaz, her test sepeti temizleyip boş olduğunu doğrular.
 *
 * ⚠️ Dev sepet kotası ~10 basket/add/saat. Her senaryo 2 ekleme yapar (pozitif
 * kontrol 3). Partiler halinde koş:
 *   npx playwright test tests/34-sepet-tur-kurallari.spec.ts --grep @parti1
 *   (~45 dk sonra) --grep @parti2, sonra --grep @parti3
 * Mod: varsayılan V2 (?apiV2=1). V1 karşılaştırma için API_MODE=v1.
 */

const MODE =
  (process.env.API_MODE || "v2").toLowerCase() === "v1" ? "v1" : "v2";

type Scenario = {
  id: string;
  first: CartKind;
  second: CartKind;
  /** true: iki ürün aynı sepette kalmalı (pozitif kontrol). */
  allowMix: boolean;
  /** true: ikinci eklemede ekranda uyarı bekleniyor. */
  expectNotice?: boolean;
  tag: string;
};

const SCENARIOS: Scenario[] = [
  // Parti 1 — pozitif kontrol + takı + havale (7 ekleme)
  {
    id: "TC-SEPET-TUR-01",
    first: "kulce",
    second: "gumus",
    allowMix: true,
    tag: "@parti1",
  },
  {
    id: "TC-SEPET-TUR-02",
    first: "kulce",
    second: "taki",
    allowMix: false,
    expectNotice: true,
    tag: "@parti1",
  },
  {
    id: "TC-SEPET-TUR-03",
    first: "kulce",
    second: "havale",
    allowMix: false,
    tag: "@parti1",
  },
  // Parti 2 — standart → diğer özel türler + havale ters yön (8 ekleme)
  {
    id: "TC-SEPET-TUR-04",
    first: "havale",
    second: "kulce",
    allowMix: false,
    tag: "@parti2",
  },
  {
    id: "TC-SEPET-TUR-05",
    first: "kulce",
    second: "fiziki",
    allowMix: false,
    tag: "@parti2",
  },
  {
    id: "TC-SEPET-TUR-06",
    first: "kulce",
    second: "birikim",
    allowMix: false,
    tag: "@parti2",
  },
  {
    id: "TC-SEPET-TUR-07",
    first: "kulce",
    second: "fifa",
    allowMix: false,
    tag: "@parti2",
  },
  // Parti 3 — ters yönler + takı tersi + ziynet pozitif (8 ekleme)
  {
    id: "TC-SEPET-TUR-08",
    first: "taki",
    second: "ziynet",
    allowMix: false,
    expectNotice: true,
    tag: "@parti3",
  },
  {
    id: "TC-SEPET-TUR-09",
    first: "fiziki",
    second: "gumus",
    allowMix: false,
    tag: "@parti3",
  },
  {
    id: "TC-SEPET-TUR-10",
    first: "birikim",
    second: "kulce",
    allowMix: false,
    tag: "@parti3",
  },
  {
    id: "TC-SEPET-TUR-11",
    first: "fifa",
    second: "ziynet",
    allowMix: false,
    tag: "@parti3",
  },
];

test.describe(`NSB-7223 sepet türü kuralları [${MODE}] @sepet-tur`, () => {
  for (const sc of SCENARIOS) {
    const title =
      `${sc.id} ${sc.first} sepetteyken ${sc.second} ekle → ` +
      (sc.allowMix ? "birleşmeli" : "birleşmemeli") +
      ` ${sc.tag}`;

    test(title, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const basket = new BasketWatcher(page);
      const evidence: Record<string, unknown> = { scenario: sc, mode: MODE };

      await test.step(`0. ${MODE.toUpperCase()} modunu aç ve doğrula`, async () => {
        const res = await page.goto(`/?apiV2=${MODE === "v2" ? 1 : 0}`, {
          waitUntil: "domcontentloaded",
        });
        expect(res?.headers()["x-api-version"], "x-api-version başlığı").toBe(
          MODE,
        );
        const cookies = await page.context().cookies();
        const flag = cookies.find((c) => c.name === "NG_API_V2")?.value;
        if (MODE === "v2") expect(flag, "NG_API_V2 çerezi").toBe("1");
      });

      // Not: "önce sepeti temizle" burada işe yaramaz — yeni bağlamda FE basketHash'i
      // bilmediği için sunucudaki eski sepet ilk basket/add'e kadar görünmez (ve o
      // eklemeyle sessizce geri gelir). Kalıntılar 2. adımda tespit edilip silinir.
      try {
        await test.step(`2. İlk ürün (${sc.first}) sepete ekle`, async () => {
          const expected = KIND_GROUP[sc.first];
          const { source, click } = await triggerAdd(page, sc.first);
          let att = await basket.attempt(click);
          evidence.firstAdd = { source, ...att };
          let snap = await basket.refresh();

          // Sunucudaki eski sepetten geri gelen yabancı kalemler (bkz. 08.11 stage
          // raporu "eski ürünler sessizce geri geliyor") → kayıt altına al ve sil.
          const leftovers = snap.items.filter((i) => i.group !== expected);
          if (leftovers.length) {
            const msg = `eski sepetten geri gelen kalemler: ${describeBasket(snap)}`;
            testInfo.annotations.push({
              type: "eski-sepet-kalintisi",
              description: msg,
            });
            evidence.leftovers = snap;
            console.log(`⚠ ${sc.id} ${msg}`);
            snap = await clearCartStrict(
              page,
              basket,
              (i) => i.group !== expected,
            );
            if (!att.responses.some((r) => r.success === true)) {
              // Kalıntı yüzünden reddedildiyse bir kez daha dene.
              const retry = await triggerAdd(page, sc.first);
              att = await basket.attempt(retry.click);
              evidence.firstAddRetry = att;
              snap = await basket.refresh();
            }
          }

          expect(
            att.responses.some((r) => r.success === true),
            `ilk ekleme başarısız (${source}): ${JSON.stringify(att)}`,
          ).toBeTruthy();
          evidence.afterFirst = snap;
          expect(groupsOf(snap), describeBasket(snap)).toEqual([expected]);
        });

        await test.step(`3. İkinci ürün (${sc.second}) eklemeyi dene`, async () => {
          const { source, click } = await triggerAdd(page, sc.second);
          const att = await basket.attempt(click, 8000);
          evidence.secondAdd = { source, ...att };
          console.log(`ℹ ${sc.id} ikinci ekleme:`, JSON.stringify(att));
        });

        await test.step("4. Sonuç sepetini kurala göre doğrula", async () => {
          const snap = await basket.refresh();
          evidence.final = snap;
          const groups = groupsOf(snap);
          console.log(`ℹ ${sc.id} sonuç: ${describeBasket(snap)}`);

          expect(
            groups.filter((g) => g.startsWith("bilinmeyen")),
            `sınıflanamayan kalem var — CartTypeHelpers.classifyItem güncellenmeli: ${describeBasket(snap)}`,
          ).toEqual([]);

          if (sc.allowMix) {
            expect(
              groups,
              `standart ürünler birleşmeli: ${describeBasket(snap)}`,
            ).toEqual([KIND_GROUP[sc.first]]);
            expect(
              snap.items.length,
              describeBasket(snap),
            ).toBeGreaterThanOrEqual(2);
          } else {
            expect(
              groups.length,
              `FARKLI SEPET TÜRLERİ BİRLEŞTİ (NSB-7223): ${describeBasket(snap)}`,
            ).toBeLessThanOrEqual(1);
          }
        });

        if (sc.expectNotice) {
          await test.step("5. Takı ↔ standart birleşiminde uyarı gösterilmeli", async () => {
            const notices = (evidence.secondAdd as { notices: string[] })
              .notices;
            expect
              .soft(
                notices.length,
                "takı/standart birleşiminde kullanıcıya uyarı gösterilmedi",
              )
              .toBeGreaterThan(0);
          });
        }
      } finally {
        await testInfo.attach(`${sc.id}-${MODE}.json`, {
          body: JSON.stringify(evidence, null, 2),
          contentType: "application/json",
        });
        // Assert patlasa da sepet boşaltılır ve boş olduğu ölçülür.
        await test.step("6. Temizlik: sepeti boşalt ve doğrula", async () => {
          const snap = await clearCartStrict(page, basket);
          expect(
            snap.items,
            `temizlik sonrası sepet boş değil: ${describeBasket(snap)}`,
          ).toHaveLength(0);
        });
      }
    });
  }
});
