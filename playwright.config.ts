import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4179",
    locale: "zh-CN",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
