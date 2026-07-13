import { test, expect } from "@playwright/test";

/**
 * Points + Lines Demo Smoke Test (Stage 6.2, experimental)
 *
 * Verifies:
 * - Page loads successfully
 * - Canvas exists and is visible
 * - No console errors
 * - No unhandled exceptions
 * - Screenshot captured
 *
 * Proves the smallest complete LineString rendering vertical slice loads cleanly
 * alongside WebGpuPointsRenderer with no owning relationship between the two.
 */
test.describe("points-lines-demo smoke test", () => {
  test("should load without errors", async ({ page }) => {
    const url = "http://localhost:4179/examples/points-lines-demo/";

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const errorText = msg.text();
        const isWebSocketError = errorText.includes("WebSocket") &&
                               (errorText.includes("404") || errorText.includes("ERR_CONNECTION_REFUSED"));
        const isFaviconError = errorText.includes("favicon.ico") && errorText.includes("404");
        if (!isWebSocketError && !isFaviconError) {
          consoleErrors.push(errorText);
        }
      }
    });

    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    await page.waitForTimeout(1500);

    expect(consoleErrors).toHaveLength(0);
    if (consoleErrors.length > 0) {
      console.error("Console errors found:", consoleErrors);
    }

    expect(pageErrors).toHaveLength(0);
    if (pageErrors.length > 0) {
      console.error("Page errors found:", pageErrors);
    }

    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    const info = page.locator("#info");
    await expect(info).toBeVisible({ timeout: 5000 });

    const zoomDisplay = page.locator("#zoom-display");
    await expect(zoomDisplay).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: "tests/playwright/screenshots/points-lines-demo-smoke.png",
      fullPage: false,
    });
  });
});
