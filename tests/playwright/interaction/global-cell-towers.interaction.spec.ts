import { test, expect } from "@playwright/test";
import { retryAtLocations } from "../utils/interactions";

/**
 * Global Cell Towers Interaction Tests
 *
 * Tests tower picking functionality:
 * - Click canvas to select tower
 * - Verify popup appears with metadata
 */
test.describe("global-cell-towers interaction tests", () => {
  test("should show popup when clicking on towers", async ({ page }) => {
    const url = "http://localhost:4179/examples/global-cell-towers/";

    // 1. Load example and wait for data render
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const canvas = page.locator("#gpu-canvas");

    // Wait for data to load (tower count should populate).
    // Timeout is generous (30s) because the 5.1M-point binary fetch can be
    // slow under parallel test-worker contention (network + CPU shared across workers).
    const towerCount = page.locator("#tower-count");
    await expect(towerCount).not.toHaveText("—", { timeout: 30000 });

    // Wait for loading overlay to disappear
    const loading = page.locator("#loading");
    if (await loading.isVisible()) {
      await expect(loading).toBeHidden({ timeout: 30000 });
    }

    // 2. Try clicking at multiple locations to find a tower
    const popupFound = await retryAtLocations(
      page,
      canvas,
      async (x, y) => {
        // Click at location
        await page.mouse.click(x, y);

        // Wait for popup to appear
        await page.waitForTimeout(300);

        // Check if popup is visible
        const popup = page.locator("#popup");
        const isVisible = await popup.isVisible();

        if (isVisible) {
          // Verify popup has content
          const radioBadge = page.locator("#popup-radio-badge");
          const mccValue = page.locator("#popup-mcc");
          const mncValue = page.locator("#popup-net");
          const rangeValue = page.locator("#popup-range");

          // At least some fields should be populated
          const radioText = await radioBadge.textContent();
          const hasContent = radioText && radioText !== "—";

          return hasContent;
        }

        return false;
      },
      8 // Try up to 8 locations
    );

    // 3. Verify popup was found
    expect(popupFound).toBe(true);

    // 4. If popup found, verify it contains tower metadata
    if (popupFound) {
      const popup = page.locator("#popup");
      await expect(popup).toBeVisible();

      // Check that at least one field has content (not "—")
      const radioBadge = page.locator("#popup-radio-badge");
      const radioText = await radioBadge.textContent();

      // We don't validate exact values, just that metadata exists
      expect(radioText).toBeTruthy();
      expect(radioText).not.toBe("—");
    }
  });

  test("should display tower metadata in popup", async ({ page }) => {
    const url = "http://localhost:4179/examples/global-cell-towers/";

    // 1. Load example and wait for stability
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const canvas = page.locator("#gpu-canvas");

    // Wait for data to load (same generous timeout as above — parallel workers
    // share network/CPU bandwidth while fetching the 5.1M-point binary dataset)
    const towerCount = page.locator("#tower-count");
    await expect(towerCount).not.toHaveText("—", { timeout: 30000 });

    const loading = page.locator("#loading");
    if (await loading.isVisible()) {
      await expect(loading).toBeHidden({ timeout: 30000 });
    }

    // 2. Find and click on a tower (retry at multiple locations)
    let metadataFound = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!metadataFound && attempts < maxAttempts) {
      attempts++;

      // Click at center + small offset
      const box = await canvas.boundingBox();
      if (!box) break;

      const centerX = box.x + box.width / 2 + (Math.random() - 0.5) * 200;
      const centerY = box.y + box.height / 2 + (Math.random() - 0.5) * 200;

      await page.mouse.click(centerX, centerY);
      await page.waitForTimeout(300);

      // Check if popup appeared with metadata
      const popup = page.locator("#popup");
      if (await popup.isVisible()) {
        // Verify at least one metadata field is populated
        const fields = [
          page.locator("#popup-radio-badge"),
          page.locator("#popup-mcc"),
          page.locator("#popup-net"),
          page.locator("#popup-range")
        ];

        for (const field of fields) {
          const text = await field.textContent();
          if (text && text !== "—" && text.trim() !== "") {
            metadataFound = true;
            break;
          }
        }
      }
    }

    // 3. Verify tower metadata was found
    expect(metadataFound).toBe(true);
  });
});
