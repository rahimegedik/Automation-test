import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(dir, "nadirgold-ziynet-stok-raporu-2026-06-25.html");
const out = path.join(dir, "nadirgold-ziynet-stok-raporu-2026-06-25.pdf");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + src, { waitUntil: "networkidle" });
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();
console.log("✓ " + out + " üretildi");
