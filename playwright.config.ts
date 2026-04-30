import { defineConfig, devices } from "@playwright/test";

/**
 * Uses installed Google Chrome (`channel: "chrome"`).
 * CI installs Chrome via `.github/workflows/pr-tests.yml` (`browser-actions/setup-chrome`).
 */
export default defineConfig({
  testDir: "tests",
  /** One baseline per screenshot name; rely on tolerance for OS/GPU variance (see visual-baseline.ts). */
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  timeout: 120_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixels: 2500,
      threshold: 0.32,
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
