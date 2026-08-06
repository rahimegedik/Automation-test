import { chromium, FullConfig, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function globalSetup(_config: FullConfig) {
  const env = (process.env.NADIRGOLD_ENV ?? "prod").toLowerCase();
  const baseURL = process.env[`BASE_URL_${env.toUpperCase()}`];

  if (!baseURL) {
    throw new Error(
      `BASE_URL_${env.toUpperCase()} .env içinde yok (env=${env})`,
    );
  }

  // Prod guard: yıkıcı testlerin yanlışlıkla prod'da koşmasını engelle
  const DESTRUCTIVE_SPECS = [
    "09-full-user-journey",
    "10-credit-card-journey",
    "11-recurring-deposit-journey",
    "12-2-ayda-1-birikim",
    "13-3-ayda-1-birikim",
    "14-4-ayda-1-birikim",
    "15-6-ayda-1-birikim",
    "16-silver-ingot-journey",
    "17-silver-creditcard",
    "18-gold-transfer-to-account-journey",
    "19-ziynet-havale",
    "20-ziynet-kredi-kart",
  ];
  if (env === "prod" && process.env.ALLOW_PROD_ORDERS !== "1") {
    const argv = process.argv.join(" ");
    const runningDestructive = DESTRUCTIVE_SPECS.some((s) => argv.includes(s));
    const runningAll = !argv.match(/tests\/\d+-/); // hiçbir test dosyası belirtilmemiş = npm test
    if (runningDestructive || runningAll) {
      throw new Error(
        "🚫 Prod ortamında gerçek sipariş üreten testler koşturuluyor.\n" +
          "Bunu yapmak için ALLOW_PROD_ORDERS=1 npm test ile çalıştır.\n" +
          "Güvenli alternatif: NADIRGOLD_ENV=dev npm test",
      );
    }
  }

  const authDir = path.join(process.cwd(), "playwright", ".auth");
  const authFile = path.join(authDir, `${env}-user.json`);

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const email =
    process.env[`TEST_EMAIL_${env.toUpperCase()}`] ?? process.env.TEST_EMAIL;
  const password =
    process.env[`TEST_PASSWORD_${env.toUpperCase()}`] ??
    process.env.TEST_PASSWORD;
  const googleEmail = process.env.GOOGLE_EMAIL ?? "";
  const googlePassword = process.env.GOOGLE_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error(
      `TEST_EMAIL ve TEST_PASSWORD .env içinde yok ` +
        `(önce TEST_EMAIL_${env.toUpperCase()} aranır, sonra TEST_EMAIL fallback)`,
    );
  }

  console.log(`🌍 Env: ${env} | URL: ${baseURL} | Auth: ${authFile}`);

  // Mevcut session geçerliyse login'i atla
  if (fs.existsSync(authFile)) {
    const isValid = await checkSession(authFile, baseURL);
    if (isValid) {
      console.log("✓ Mevcut session geçerli — login atlanıyor.");
      return;
    }
    console.log(
      "⚠ Session geçersiz veya süresi dolmuş — yeniden giriş yapılıyor...",
    );
  }

  // Google Chrome varsa kullan (bot korumasını atlar), yoksa bundled Chromium
  const hasChromeInstalled = await chromium
    .launch({ channel: "chrome", headless: true })
    .then((b) => {
      b.close();
      return true;
    })
    .catch(() => false);

  const browser = await chromium.launch({
    headless: false,
    ...(hasChromeInstalled ? { channel: "chrome" } : {}),
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Login API'dan 200 gelince resolve eden Promise
  let loginApiResolve!: () => void;
  const loginApiDone = new Promise<void>((resolve) => {
    loginApiResolve = resolve;
  });

  // API host'u env'den hesapla (örn. www.nadirgold.work → api.nadirgold.work)
  const apiHost =
    process.env[`API_HOST_${env.toUpperCase()}`] ??
    baseURL.replace("://www.", "://api.");

  page.on("response", (resp) => {
    if (
      resp.url().includes(`${apiHost}/customer/login`) &&
      resp.status() === 200
    ) {
      console.log("  ✓ Login API 200 OK");
      loginApiResolve();
    }
  });

  // ADIM 1: Ana sayfaya git — Google OAuth ekranı gelebilir
  console.log("\n[1/4] Ana sayfaya gidiliyor...");
  await page.goto(baseURL, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });

  // ADIM 2: Google OAuth akışını otomatik yönet
  if (
    page.url().includes("accounts.google.com") ||
    page.url().includes("auth.nadirgold.work")
  ) {
    console.log("[2/4] Google OAuth akışı işleniyor...");
    await handleGoogleAuth(page, googleEmail ?? "", googlePassword ?? "");
    console.log("  ✓ Google girişi tamamlandı. URL:", page.url());
  }

  // ADIM 3: NadirGold email/şifre ile giriş
  const loginURL = `${baseURL.replace(/\/$/, "")}/hesap/giris`;
  console.log("[2/4] NadirGold login sayfasına gidiliyor...");
  await page.goto(loginURL, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });

  // Çerez popup'ını kapat
  const cookieBtn = page.getByRole("button", { name: /Kabul Et/i });
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click();
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
    if (!page.url().includes("/hesap/giris")) {
      await page.goto(loginURL, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
    }
  }

  console.log("[3/4] Form dolduruluyor...");
  const emailInput = page
    .locator(
      'input[type="email"], input[name*="email" i], input[placeholder*="posta" i]',
    )
    .first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 50 });

  await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 50 });

  const loginBtn = page
    .locator("button")
    .filter({ hasText: /^Giriş Yap$/i })
    .first();
  await loginBtn.click();

  // Bildirim popup'ı çıkarsa kapat
  const popupBtn = page.getByRole("button", { name: "Teşekkürler" });
  if (await popupBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    console.log("  Bildirim popup'ı kapatılıyor...");
    await popupBtn.click();
  }

  // Login API 200 bekle
  console.log("[4/4] Login API yanıtı bekleniyor...");
  await Promise.race([
    loginApiDone,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Login API 30sn içinde yanıt vermedi")),
        30_000,
      ),
    ),
  ]);

  await page.waitForTimeout(2000);

  // Oturumu kaydet
  await context.storageState({ path: authFile });
  await browser.close();

  console.log("\n✓ Oturum kaydedildi:", authFile, "\n");
}

// Google OAuth akışını state machine ile yönet
async function handleGoogleAuth(page: Page) {
  const googleEmail = process.env.GOOGLE_EMAIL ?? "";
  const googlePassword = process.env.GOOGLE_PASSWORD ?? "";

  if (!googleEmail) {
    throw new Error("GOOGLE_EMAIL .env içinde tanımlı değil.");
  }

  if (!googlePassword) {
    throw new Error("GOOGLE_PASSWORD .env içinde tanımlı değil.");
  }

  console.log("[2/4] Google OAuth akışı işleniyor...");

  for (let step = 0; step < 20; step++) {
    if (page.isClosed()) {
      throw new Error("Google OAuth sırasında sayfa kapandı.");
    }

    await page
      .waitForLoadState("domcontentloaded", { timeout: 10_000 })
      .catch(() => {});

    const currentUrl = page.url();
    console.log(`  [adım ${step}] ${currentUrl}`);

    // Google'dan çıkıldıysa OAuth tamamdır
    if (!currentUrl.includes("accounts.google.com")) {
      console.log("✓ Google OAuth tamamlandı");
      return;
    }

    // Google email ekranı
    const emailInput = page
      .locator('input[type="email"], #identifierId, input[name="identifier"]')
      .first();

    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Google email ekranı bulundu");

      await emailInput.fill(googleEmail);

      const nextButton = page
        .getByRole("button")
        .filter({ hasText: /Next|Sonraki|İleri/i })
        .first();

      if (await nextButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextButton.click();
      } else {
        await emailInput.press("Enter");
      }

      await page.waitForTimeout(3000);
      continue;
    }

    // Google şifre ekranı
    const passwordInput = page.locator('input[type="password"]').first();

    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Google şifre ekranı bulundu");

      await passwordInput.fill(googlePassword);

      const nextButton = page
        .getByRole("button")
        .filter({ hasText: /Next|Sonraki|İleri/i })
        .first();

      if (await nextButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextButton.click();
      } else {
        await passwordInput.press("Enter");
      }

      await page.waitForTimeout(5000);
      continue;
    }

    // Hesap seçme ekranı
    const accountButton = page
      .locator('[data-identifier], div[role="link"], div[role="button"]')
      .filter({ hasText: googleEmail })
      .first();

    if (await accountButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Google hesap seçme ekranı bulundu");

      await accountButton.click();
      await page.waitForTimeout(3000);
      continue;
    }

    // Devam / izin / onay ekranları
    const continueButton = page
      .getByRole("button")
      .filter({
        hasText: /Continue|Devam|Allow|İzin ver|Onayla|I agree|Kabul/i,
      })
      .first();

    if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Google devam/izin ekranı bulundu");

      // Overlay tıklamayı engelleyebiliyor — normal click olmazsa JS click
      await continueButton.click({ timeout: 10_000 }).catch(async () => {
        console.log("  Normal click engellendi, JS click deneniyor...");
        await continueButton.evaluate((el) => (el as HTMLElement).click());
      });
      await page.waitForTimeout(3000);
      continue;
    }

    console.log("  Bilinmeyen Google ekranı, bekleniyor...");
    await page.screenshot({
      path: `playwright/.auth/debug-google-${step}.png`,
      fullPage: true,
    });

    await page.waitForTimeout(3000);
  }

  throw new Error("Google OAuth akışı tamamlanamadı. Maksimum adım aşıldı.");
}

// Mevcut user.json ile korunan sayfaya erişilebiliyor mu kontrol et
async function checkSession(
  authFile: string,
  baseURL: string,
): Promise<boolean> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();

  try {
    const ordersURL = `${baseURL.replace(/\/$/, "")}/hesabim/siparislerim`;
    await page.goto(ordersURL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const url = page.url();
    const valid =
      !url.includes("accounts.google.com") &&
      !url.includes("auth.nadirgold.work") &&
      !url.includes("/hesap/giris");
    return valid;
  } catch {
    return false;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
