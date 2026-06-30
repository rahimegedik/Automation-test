import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(dir, 'test-report-flaky-fix-verification.html'), { waitUntil: 'networkidle' });
await page.pdf({
  path: path.join(dir, 'test-report-flaky-fix-verification.pdf'),
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
});
await browser.close();
console.log('✓ test-report-flaky-fix-verification.pdf üretildi');
