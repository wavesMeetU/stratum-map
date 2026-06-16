import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for smoke tests
 *
 * This config is specifically for running smoke tests on examples.
 * Examples are served via a simple static server.
 *
 * Usage:
 *   npm run test:smoke
 */
export default defineConfig({
  testDir: "tests/playwright/smoke",
  timeout: 60000,
  expect: {
    timeout: 5000,
  },
  projects: [
    {
      name: "chrome-smoke-tests",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: true,
        deviceScaleFactor: 1,
        baseURL: "http://127.0.0.1:4179",
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            "--disable-web-security",  // For local testing
          ],
        },
      },
    },
  ],
  webServer: {
    command: "vite preview --config vite.examples.config.ts --port 4179 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4179/examples/minimal-native/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
