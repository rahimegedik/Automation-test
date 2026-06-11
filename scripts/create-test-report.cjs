const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RESULTS_PATH = path.join(process.cwd(), "test-results", "results.json");
const REPORTS_DIR = path.join(process.cwd(), "reports");

const HTML_REPORT_PATH = path.join(REPORTS_DIR, "nadirgold-test-report.html");
const PDF_REPORT_PATH = path.join(REPORTS_DIR, "nadirgold-test-report.pdf");

const reportTitle = "NadirGold E2E — Test Koşum Raporu";

const branch = process.env.BRANCH_NAME || "feature/playwright-tests";
const environment = process.env.NADIRGOLD_ENV || "prod";
const baseUrl =
  process.env.BASE_URL ||
  process.env.BASE_URL_PROD ||
  process.env.BASE_URL_STAGING ||
  "nadirgold.work";

const command = process.env.TEST_COMMAND || "npx playwright test";
const worker = process.env.WORKER || "1";
const fixCommit = process.env.FIX_COMMIT || "-";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readResults() {
  if (!fs.existsSync(RESULTS_PATH)) {
    throw new Error(
      `Playwright JSON sonucu bulunamadı: ${RESULTS_PATH}\n` +
        `Önce testleri çalıştırmalısın.`,
    );
  }

  return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
}

function formatDate() {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return "-";

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}.${Math.round((seconds / 60) * 10)}m`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getShortFileName(filePath) {
  if (!filePath) return "-";
  return path.basename(filePath);
}

function collectTestsFromSuite(suite, collected = []) {
  if (suite.specs) {
    for (const spec of suite.specs) {
      for (const test of spec.tests || []) {
        const result = test.results?.[test.results.length - 1] || {};

        const status =
          test.outcome ||
          test.status ||
          result.status ||
          (result.error ? "failed" : "unknown");

        collected.push({
          file: getShortFileName(spec.file),
          title: spec.title || test.title || "-",
          status,
          duration: result.duration || 0,
          error: result.error?.message || "",
        });
      }
    }
  }

  if (suite.suites) {
    for (const childSuite of suite.suites) {
      collectTestsFromSuite(childSuite, collected);
    }
  }

  return collected;
}

function collectAllTests(results) {
  const collected = [];

  for (const suite of results.suites || []) {
    collectTestsFromSuite(suite, collected);
  }

  return collected;
}

function isPassed(status) {
  return ["passed", "expected"].includes(String(status).toLowerCase());
}

function isFailed(status) {
  return ["failed", "unexpected", "timedout", "timedOut"].includes(
    String(status).toLowerCase(),
  );
}

function statusLabel(status) {
  const normalized = String(status).toLowerCase();

  if (["passed", "expected"].includes(normalized)) {
    return `<span class="badge pass">PASS</span>`;
  }

  if (["failed", "unexpected", "timedout"].includes(normalized)) {
    return `<span class="badge fail">FAIL</span>`;
  }

  if (normalized === "skipped") {
    return `<span class="badge skip">SKIP</span>`;
  }

  if (normalized === "flaky") {
    return `<span class="badge flaky">FLAKY</span>`;
  }

  return `<span class="badge unknown">${escapeHtml(status)}</span>`;
}

function buildRows(tests) {
  return tests
    .map((testItem, index) => {
      return `
        <tr>
          <td>${String(index + 1).padStart(2, "0")}</td>
          <td><code>${escapeHtml(testItem.file)}</code></td>
          <td>${escapeHtml(testItem.title)}</td>
          <td>${statusLabel(testItem.status)}</td>
          <td>${formatDuration(testItem.duration)}</td>
        </tr>
      `;
    })
    .join("");
}

function getSummary(results, tests) {
  const passed = tests.filter((t) => isPassed(t.status)).length;
  const failed = tests.filter((t) => isFailed(t.status)).length;

  const skipped = tests.filter(
    (t) => String(t.status).toLowerCase() === "skipped",
  ).length;

  const flaky = tests.filter(
    (t) => String(t.status).toLowerCase() === "flaky",
  ).length;

  const total = tests.length;

  const duration =
    results.stats?.duration ||
    tests.reduce((sum, test) => sum + test.duration, 0);

  return {
    total,
    passed,
    failed,
    skipped,
    flaky,
    duration,
  };
}

function buildHtml(results, tests) {
  const summary = getSummary(results, tests);
  const failedTests = tests.filter((t) => isFailed(t.status));

  const errorNotes = failedTests
    .map((testItem) => {
      return `
        <li>
          <strong>${escapeHtml(testItem.file)}</strong> —
          ${escapeHtml(testItem.title)}
          ${
            testItem.error
              ? `<br><code>${escapeHtml(testItem.error)}</code>`
              : ""
          }
        </li>
      `;
    })
    .join("");

  return `
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportTitle)}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 32px;
      font-family: Arial, Helvetica, sans-serif;
      color: #1f2937;
      background: #f8fafc;
    }

    .page {
      max-width: 1100px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
      border-radius: 18px;
      box-shadow: 0 10px 35px rgba(15, 23, 42, 0.08);
    }

    .header {
      border-bottom: 4px solid #164e7a;
      padding-bottom: 14px;
      margin-bottom: 22px;
    }

    h1 {
      margin: 0 0 10px;
      color: #12385a;
      font-size: 30px;
    }

    .meta {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.7;
    }

    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 5px;
      font-family: Consolas, Monaco, monospace;
      font-size: 12px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 14px;
      margin: 24px 0;
    }

    .card {
      padding: 20px 14px;
      border-radius: 14px;
      text-align: center;
      background: #eef6ff;
    }

    .card.pass {
      background: #dcfce7;
    }

    .card.fail {
      background: #fee2e2;
    }

    .card.skip {
      background: #fef3c7;
    }

    .card.duration {
      background: #e0f2fe;
    }

    .number {
      display: block;
      font-size: 34px;
      font-weight: 800;
      color: #12385a;
      margin-bottom: 6px;
    }

    .label {
      display: block;
      font-size: 11px;
      letter-spacing: 1.2px;
      color: #475569;
      font-weight: 700;
    }

    h2 {
      color: #12385a;
      font-size: 20px;
      border-bottom: 1px solid #dbe3ea;
      padding-bottom: 8px;
      margin-top: 30px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }

    th {
      text-align: left;
      background: #f1f5f9;
      color: #334155;
      padding: 11px;
      border-bottom: 1px solid #dbe3ea;
    }

    td {
      padding: 11px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
    }

    .badge.pass {
      background: #bbf7d0;
      color: #166534;
    }

    .badge.fail {
      background: #fecaca;
      color: #991b1b;
    }

    .badge.skip {
      background: #fde68a;
      color: #92400e;
    }

    .badge.flaky {
      background: #e9d5ff;
      color: #6b21a8;
    }

    .badge.unknown {
      background: #e5e7eb;
      color: #374151;
    }

    .note {
      background: #fff7ed;
      border-left: 5px solid #f97316;
      padding: 14px 16px;
      border-radius: 10px;
      line-height: 1.6;
      font-size: 13px;
    }

    ul, ol {
      line-height: 1.7;
      padding-left: 20px;
    }

    .footer {
      margin-top: 32px;
      padding-top: 14px;
      border-top: 1px solid #dbe3ea;
      color: #64748b;
      font-size: 12px;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .page {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>

<body>
  <main class="page">
    <section class="header">
      <h1>${escapeHtml(reportTitle)}</h1>

      <div class="meta">
        Tarih: ${formatDate()}
        · Branch: <code>${escapeHtml(branch)}</code>
        · Ortam: <code>${escapeHtml(environment)}</code>
        · URL: <code>${escapeHtml(baseUrl)}</code>
        · Worker: <code>${escapeHtml(worker)}</code>
        · Fix commit: <code>${escapeHtml(fixCommit)}</code>
        · Komut: <code>${escapeHtml(command)}</code>
      </div>
    </section>

    <section class="cards">
      <div class="card">
        <span class="number">${summary.total}</span>
        <span class="label">TOPLAM TEST</span>
      </div>

      <div class="card pass">
        <span class="number">${summary.passed}</span>
        <span class="label">PASSED</span>
      </div>

      <div class="card fail">
        <span class="number">${summary.failed}</span>
        <span class="label">FAILED</span>
      </div>

      <div class="card skip">
        <span class="number">${summary.skipped}</span>
        <span class="label">SKIPPED</span>
      </div>

      <div class="card duration">
        <span class="number">${formatDuration(summary.duration)}</span>
        <span class="label">TOPLAM SÜRE</span>
      </div>
    </section>

    <section>
      <h2>Test Sonuçları</h2>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Dosya</th>
            <th>Test</th>
            <th>Sonuç</th>
            <th>Süre</th>
          </tr>
        </thead>

        <tbody>
          ${buildRows(tests)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Yapılan Kontroller</h2>

      <ol>
        <li>Ana sayfa açılışı ve login session doğrulandı.</li>
        <li>Sepet temizleme adımı çalıştırıldı.</li>
        <li>Popup / overlay kontrolü yapıldı.</li>
        <li>Ürün seçimi ve sepete ekleme akışı doğrulandı.</li>
        <li>Checkout ve ödeme adımları çalıştırıldı.</li>
        <li>Ödeme sonrası Siparişlerim ve Profil sayfası kontrol edildi.</li>
      </ol>
    </section>

    <section>
      <h2>Teşhis Notu</h2>

      <div class="note">
        Bu rapor Playwright JSON çıktısından otomatik oluşturulmuştur.
        Fail olan test varsa Fail Detayları bölümünden hata incelenmelidir.
        Gerçek sipariş oluşturan testler çalıştırıldıysa admin panelinden oluşan siparişler kontrol edilmelidir.
      </div>
    </section>

    ${
      failedTests.length
        ? `
          <section>
            <h2>Fail Detayları</h2>
            <ul>${errorNotes}</ul>
          </section>
        `
        : `
          <section>
            <h2>Önemli Notlar</h2>
            <ul>
              <li>${summary.total} test koşuldu.</li>
              <li>${summary.passed} test başarılı tamamlandı.</li>
              <li>${summary.failed} test başarısız oldu.</li>
              <li>Rapor HTML ve PDF formatında oluşturuldu.</li>
            </ul>
          </section>
        `
    }

    <section class="footer">
      NadirGold QA Automation · Playwright + Chromium · ${formatDate()}
    </section>
  </main>
</body>
</html>
  `;
}

async function createPdfFromHtml() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`file://${HTML_REPORT_PATH}`, {
    waitUntil: "networkidle",
  });

  await page.pdf({
    path: PDF_REPORT_PATH,
    format: "A4",
    printBackground: true,
    margin: {
      top: "14mm",
      right: "10mm",
      bottom: "14mm",
      left: "10mm",
    },
  });

  await browser.close();
}

async function main() {
  ensureDir(REPORTS_DIR);

  const results = readResults();
  const tests = collectAllTests(results);

  const html = buildHtml(results, tests);

  fs.writeFileSync(HTML_REPORT_PATH, html, "utf-8");

  await createPdfFromHtml();

  console.log("✓ HTML rapor oluşturuldu:", HTML_REPORT_PATH);
  console.log("✓ PDF rapor oluşturuldu:", PDF_REPORT_PATH);
}

main().catch((error) => {
  console.error("Rapor oluşturulamadı:");
  console.error(error);
  process.exit(1);
});
