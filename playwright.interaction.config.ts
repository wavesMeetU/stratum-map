import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for interaction tests
 *
 * This config is specifically for testing user interactions (pan, zoom, clicks).
 * Uses fixed viewport for consistent behavior across runs.
 *
 * Usage:
 *   npm run test:interaction
 */
export default defineConfig({
  testDir: "tests/playwright/interaction",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  workers: 4, // Parallel execution
  projects: [
    {
      name: "chrome-interaction-tests",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: true,
        deviceScaleFactor: 1,
        viewport: { width: 1280, height: 720 }, // Fixed viewport for consistency
        baseURL: "http://127.0.0.1:4179",
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            "--disable-web-security",
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
