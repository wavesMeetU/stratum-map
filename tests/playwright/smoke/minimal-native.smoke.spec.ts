import { test, expect } from "@playwright/test";

/**
 * Minimal Native Smoke Test
 *
 * Verifies:
 * - Page loads successfully
 * - Canvas exists and is visible
 * - No console errors
 * - No unhandled exceptions
 * - Screenshot captured
 */
test.describe("minimal-native smoke test", () => {
  test("should load without errors", async ({ page }) => {
    const url = "http://localhost:4179/examples/minimal-native/";

    // 1. Page loads
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // 2. Capture console errors
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

    // Give page time to stabilize (WebGPU initialization)
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
    const canvas = page.locator("#canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // 7. Info panel exists
    const info = page.locator("#info");
    await expect(info).toBeVisible({ timeout: 5000 });

    // 8. Point count should show "1,000"
    const pointCount = page.locator("#point-count");
    await expect(pointCount).toHaveText("1,000");

    // 9. FPS counter exists
    const fps = page.locator("#fps");
    await expect(fps).toBeVisible({ timeout: 5000 });

    // 10. Zoom display exists
    const zoom = page.locator("#zoom");
    await expect(zoom).toHaveText("10.00");

    // 11. Screenshot captured
    await page.screenshot({
      path: "tests/playwright/screenshots/minimal-native-smoke.png",
      fullPage: false
    });
  });
});
