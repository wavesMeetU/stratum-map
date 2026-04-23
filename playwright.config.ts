import { defineConfig, devices } from "@playwright/test";

/**
 * Uses installed Google Chrome (`channel: "chrome"`) so `playwright install` is not
 * required (helpful when Playwright CDN downloads fail behind TLS inspection).
 */
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 5_000 },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: true,
        baseURL: "http://127.0.0.1:4174",
        launchOptions: {
          args: ["--enable-unsafe-webgpu"],
        },
      },
    },
  ],
  webServer: {
    command: "vite preview --config vite.bench.config.ts --port 4174 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
