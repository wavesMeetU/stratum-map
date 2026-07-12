import { test, expect } from "@playwright/test";

/**
 * Integration Example Interaction Tests
 *
 * Tests mode switching functionality:
 * - Mode button navigation
 * - Hash changes
 * - Mode indicator updates
 */
test.describe("integration-example interaction tests", () => {
  test("should switch to standalone mode via button", async ({ page }) => {
    const url = "http://localhost:4179/examples/integration-example/";

    // 1. Load example (defaults to OpenLayers mode)
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // 2. Verify initial mode display
    const modeDisplay = page.locator("#current-mode");
    await expect(modeDisplay).toBeVisible();

    const initialMode = await modeDisplay.textContent();
    expect(initialMode).toContain("OpenLayers");

    // 3. Click Standalone Mode button
    const saBtn = page.locator("#sa-btn");
    await saBtn.click();

    // 4. Wait for page reload (button triggers location change)
    await page.waitForTimeout(1000);

    // 5. Verify URL now contains #standalone hash
    expect(page.url()).toContain("#standalone");

    // 6. Verify mode display updated (page should have reloaded)
    const finalMode = await modeDisplay.textContent();
    expect(finalMode).toContain("Standalone");
  });

  test("should display correct mode indicator", async ({ page }) => {
    const url = "http://localhost:4179/examples/integration-example/";

    // 1. Load with standalone mode hash
    await page.goto(url + "#standalone", {
      waitUntil: "networkidle",
      timeout: 30000
    });

    let modeDisplay = page.locator("#current-mode");

    // 2. Wait for mode display to update
    await page.waitForTimeout(500);

    // 3. Verify Standalone mode indicator (with animation suffix)
    const saMode = await modeDisplay.textContent();
    expect(saMode).toContain("Standalone");

    // 4. Navigate to OpenLayers mode with reload to ensure hash is processed
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.goto(url + "#openlayers", {
      waitUntil: "networkidle",
      timeout: 30000
    });

    await page.waitForTimeout(500);

    // 5. Verify OpenLayers mode indicator (with simulation suffix)
    modeDisplay = page.locator("#current-mode");
    const olMode = await modeDisplay.textContent();
    expect(olMode).toContain("OpenLayers-managed");
  });
});
