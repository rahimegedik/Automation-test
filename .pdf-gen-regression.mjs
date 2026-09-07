import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "regression-2026-08-14", "rapor.html");
const out = path.join(dir, "nadirgold-android-regresyon-2026-08-14.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
// rapor light/dark tema token'larıyla yazıldı; baskıda light şema sabitlenir
await page.emulateMedia({ colorScheme: "light" });
await page.goto("file://" + src, { waitUntil: "networkidle" });

// baskıya özel: sayfa içi kart/tablo bölünmesini engelle, gölgeleri sadeleştir
await page.addStyleTag({
  content: `
    @page { size: A4; }
    .wrap { padding: 0 !important; gap: 28px !important; max-width: none !important; }
    .find, .tablewrap, figure, .verdict { break-inside: avoid; page-break-inside: avoid; box-shadow: none; }
    tr, .stat { break-inside: avoid; page-break-inside: avoid; }
    section { break-inside: auto; }
    h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
    figure { max-width: 260px; }
    body { background: #fff; }
  `,
});

await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();
console.log("✓ " + path.basename(out) + " üretildi");
