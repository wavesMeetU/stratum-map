import { defineConfig, devices } from "@playwright/test";

/**
 * Uses installed Google Chrome (`channel: "chrome"`).
 * CI installs Chrome via `.github/workflows/pr-tests.yml` (`browser-actions/setup-chrome`).
 */
export default defineConfig({
  testDir: "tests",
  /** Per-OS baselines (`linux/` for CI, `darwin/` for local Mac); see `tests/visual-regression/visual-baseline.ts`. */
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{platform}/{arg}{ext}",
  timeout: 120_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixels: 3500,
      threshold: 0.3,
      animations: "disabled",
    },
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        headless: true,
        deviceScaleFactor: 1,
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
