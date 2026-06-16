import { test, expect } from "@playwright/test";

/**
 * Standalone Rendering Example Smoke Test
 *
 * Verifies:
 * - Page loads successfully
 * - Canvas exists and is visible
 * - No console errors
 * - No unhandled exceptions
 * - Screenshot captured
 *
 * Educational purpose: Demonstrates manual renderer setup without bootstrapAuto()
 */
test.describe("standalone-rendering smoke test", () => {
  test("should load without errors", async ({ page }) => {
    const url = "http://localhost:4179/examples/standalone-rendering/";

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
    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // 7. Info panel exists
    const info = page.locator("#info");
    await expect(info).toBeVisible({ timeout: 5000 });

    // 8. Mode display should show "Standalone"
    const modeDisplay = page.locator("#mode-display");
    await expect(modeDisplay).toHaveText("Standalone");

    // 9. Frame counter exists
    const frameDisplay = page.locator("#frame-display");
    await expect(frameDisplay).toBeVisible({ timeout: 5000 });

    // 10. FPS counter exists
    const fpsDisplay = page.locator("#fps-display");
    await expect(fpsDisplay).toBeVisible({ timeout: 5000 });

    // 11. Zoom display exists
    const zoomDisplay = page.locator("#zoom-display");
    await expect(zoomDisplay).toHaveText("10.00");

    // 12. Center display exists
    const centerDisplay = page.locator("#center-display");
    await expect(centerDisplay).toBeVisible({ timeout: 5000 });

    // 13. Screenshot captured
    await page.screenshot({
      path: "tests/playwright/screenshots/standalone-rendering-smoke.png",
      fullPage: false
    });
  });
});
