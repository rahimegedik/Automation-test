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
async function handleGoogleAuth(
  page: Page,
  googleEmail: string,
  googlePassword: string,
) {
  for (let step = 0; step < 15; step++) {
    await page
      .waitForLoadState("domcontentloaded", { timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    const url = page.url();

    // Başarı: Google'dan çıktık
    if (
      !url.includes("accounts.google.com") &&
      !url.includes("auth.nadirgold.work")
    ) {
      return;
    }

    // Debug ekran görüntüsü
    await page.screenshot({
      path: `playwright/.auth/debug-google-${step}.png`,
      fullPage: true,
    });
    console.log(`  [adım ${step}] ${url.split("?")[0]}`);

    // ① Görünür şifre alanı varsa direkt gir
    const pwdField = page.locator('input[type="password"]').first();
    const pwdVisible = await pwdField
      .evaluate(
        (el) => el instanceof HTMLInputElement && el.offsetParent !== null,
      )
      .catch(() => false);

    if (pwdVisible) {
      console.log("  Şifre giriliyor...");
      await pwdField.fill(googlePassword);
      await pwdField.press("Enter");
      await page.waitForTimeout(2000);
      continue;
    }

    // ② "Şifrenizi girin" seçeneği varsa JS ile tıkla
    const pwdOptionHandle = await page.evaluateHandle(() => {
      const els = Array.from(document.querySelectorAll("*"));
      return (
        els.find(
          (el) =>
            el.textContent
              ?.trim()
              .match(/şifrenizi girin|enter your password/i) &&
            (el.tagName === "LI" ||
              el.tagName === "DIV" ||
              el.tagName === "BUTTON" ||
              el.getAttribute("role") === "option" ||
              el.getAttribute("role") === "listitem"),
        ) ?? null
      );
    });

    const pwdOptionEl = pwdOptionHandle.asElement();
    if (pwdOptionEl) {
      console.log('  "Şifrenizi girin" JS click...');
      await pwdOptionEl.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(1500);
      continue;
    }

    // ③ "Başka bir yöntem" varsa JS ile tıkla (passkey bypass)
    const altBtnHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return (
        btns.find((b) =>
          b.textContent?.trim().match(/başka bir yöntem|try another/i),
        ) ?? null
      );
    });

    const altBtnEl = altBtnHandle.asElement();
    if (altBtnEl) {
      console.log('  "Başka bir yöntem" JS click...');
      await altBtnEl.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(1500);
      continue;
    }

    // ④ Email alanı varsa doldur
    const emailField = page.locator('input[type="email"]').first();
    if (await emailField.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log("  Email giriliyor...");
      await emailField.fill(googleEmail);
      await emailField.press("Enter");
      await page.waitForTimeout(2000);
      continue;
    }

    // Bilinmeyen durum
    console.log("  Bilinmeyen ekran, bekleniyor...");
    await page.waitForTimeout(3000);
  }

  throw new Error("Google OAuth akışı tamamlanamadı (max adım aşıldı).");
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
