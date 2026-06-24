import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const env = (process.env.NADIRGOLD_ENV ?? "prod").toLowerCase();
const validEnvs = ["prod", "staging", "dev", "local"] as const;
type Env = (typeof validEnvs)[number];

if (!validEnvs.includes(env as Env)) {
  throw new Error(
    `Geçersiz NADIRGOLD_ENV='${env}'. Geçerli değerler: ${validEnvs.join(", ")}`,
  );
}

const baseURLKey = `BASE_URL_${env.toUpperCase()}`;
const baseURL = process.env[baseURLKey];

if (!baseURL) {
  throw new Error(
    `${baseURLKey} .env içinde tanımlı değil. ` +
      `Şu anki env='${env}'. .env dosyana ${baseURLKey}=https://... ekle.`,
  );
}

export default defineConfig({
  testDir: "./tests",
  workers: 1,

  globalSetup: require.resolve("./global-setup"),

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  use: {
    baseURL,
    storageState: `playwright/.auth/${env}-user.json`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
});
