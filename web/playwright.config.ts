import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1,
  retries: process.env.CI ? 1 : 0, timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/browser-results.xml" }]],
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.CI || process.env.E2E_PRODUCTION
      ? "node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/e2e --ip 127.0.0.1 --inspector-port 0 --port 5173"
      : "node scripts/run-framework.mjs dev", url: "http://127.0.0.1:5173/api/health",
    reuseExistingServer: !process.env.CI, timeout: 120_000,
    env: { NO_COLOR: "1" },
  },
});
