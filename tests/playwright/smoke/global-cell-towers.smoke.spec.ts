import { test, expect } from "@playwright/test";

/**
 * Global Cell Towers Smoke Test
 *
 * Verifies:
 * - Page loads successfully
 * - Canvas exists and is visible
 * - No console errors
 * - No unhandled exceptions
 * - Screenshot captured
 */
test.describe("global-cell-towers smoke test", () => {
  test("should load without errors", async ({ page }) => {
    const url = "http://localhost:4179/examples/global-cell-towers/";

    // 1. Page loads (allow time for WebGPU initialization)
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // 2. Capture console errors during page load
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        // Filter out benign 404 errors - WebSocket and favicon expected in production mode
        const errorText = msg.text();
        const isWebSocketError = errorText.includes("WebSocket") &&
                               (errorText.includes("404") || errorText.includes("ERR_CONNECTION_REFUSED"));
        const isFaviconError = errorText.includes("favicon.ico") && errorText.includes("404");
        if (!isWebSocketError && !isFaviconError) {
          consoleErrors.push(errorText);
        }
      }
    });

    // 3. Capture page errors
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    // Give page time to stabilize (WebGPU initialization may take time)
    await page.waitForTimeout(3000);

    // 4. Check for console errors
    expect(consoleErrors).toHaveLength(0);
    if (consoleErrors.length > 0) {
      console.error("Console errors found:", consoleErrors);
    }

    // 5. Check for page errors
    expect(pageErrors).toHaveLength(0);
    if (pageErrors.length > 0) {
      console.error("Page errors found:", pageErrors);
    }

    // 6. Canvas exists and is visible
    const canvas = page.locator("#gpu-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // 7. Check for loading overlay to disappear
    const loading = page.locator("#loading");
    if (await loading.isVisible()) {
      await expect(loading).toBeHidden({ timeout: 30000 });
    }

    // 8. Metrics panel should exist
    const metrics = page.locator("#metrics");
    await expect(metrics).toBeVisible({ timeout: 5000 });

    // 9. Point count should be populated
    const towerCount = page.locator("#tower-count");
    await expect(towerCount).not.toHaveText("—");

    const countText = await towerCount.textContent();
    expect(countText).toMatch(/5,\d{3}/); // Should show 5,181,123

    // 10. FPS counter should exist
    const fps = page.locator("#fps");
    await expect(fps).toBeVisible({ timeout: 5000 });

    // 11. Screenshot captured
    await page.screenshot({
      path: "tests/playwright/screenshots/global-cell-towers-smoke.png",
      fullPage: false
    });
  });
});
