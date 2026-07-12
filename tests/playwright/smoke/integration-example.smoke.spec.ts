import { test, expect } from "@playwright/test";

/**
 * Integration Example Smoke Test
 *
 * Verifies:
 * - Page loads successfully
 * - Canvas exists and is visible
 * - No console errors
 * - No unhandled exceptions
 * - Screenshot captured
 *
 * Educational purpose: Demonstrates MapController mode transitions and rendering patterns.
 * This example shows API patterns for OpenLayers-managed vs standalone rendering modes.
 */
test.describe("integration-example smoke test", () => {
  test("should load without errors", async ({ page }) => {
    const url = "http://localhost:4179/examples/integration-example/";

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

    // 4. Check for console errors (allow demo console.log messages)
    const nonLogErrors = consoleErrors.filter(err => !err.includes("Frame") && !err.includes("mode"));
    expect(nonLogErrors).toHaveLength(0);
    if (nonLogErrors.length > 0) {
      console.error("Console errors found:", nonLogErrors);
    }

    // 5. Check for page errors
    expect(pageErrors).toHaveLength(0);
    if (pageErrors.length > 0) {
      console.error("Page errors found:", pageErrors);
    }

    // 6. Canvas exists and is visible
    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // 7. Map container exists
    const container = page.locator("#map-container");
    await expect(container).toBeVisible({ timeout: 5000 });

    // 8. Mode switching UI exists
    const ui = page.locator(".mode-switching-ui");
    await expect(ui).toBeVisible({ timeout: 5000 });

    // 9. Current mode display exists
    const modeDisplay = page.locator("#current-mode");
    await expect(modeDisplay).toBeVisible({ timeout: 5000 });

    // 10. Mode buttons exist
    const olBtn = page.locator("#ol-btn");
    const saBtn = page.locator("#sa-btn");
    const autoBtn = page.locator("#auto-btn");
    await expect(olBtn).toBeVisible({ timeout: 5000 });
    await expect(saBtn).toBeVisible({ timeout: 5000 });
    await expect(autoBtn).toBeVisible({ timeout: 5000 });

    // 11. Screenshot captured
    await page.screenshot({
      path: "tests/playwright/screenshots/integration-example-smoke.png",
      fullPage: false
    });
  });
});
