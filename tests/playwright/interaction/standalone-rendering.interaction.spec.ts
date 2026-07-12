import { test, expect } from "@playwright/test";
import {
  dragCanvas,
  wheelZoom,
  waitForRenderStable,
  getZoomValue,
  getCenterValue,
} from "../utils/interactions";

/**
 * Standalone Rendering Interaction Tests
 *
 * Tests core user interactions:
 * - Pan (drag canvas)
 * - Zoom (wheel scroll)
 */
test.describe("standalone-rendering interaction tests", () => {
  test("should pan when dragging canvas", async ({ page }) => {
    const url = "http://localhost:4179/examples/standalone-rendering/";

    // 1. Load example and wait for initial render
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const canvas = page.locator("#map-canvas");
    const zoomDisplay = page.locator("#zoom-display");
    const centerDisplay = page.locator("#center-display");
    const fpsDisplay = page.locator("#fps-display");

    // Wait for initial render to complete
    await page.waitForTimeout(2000);

    // 2. Record initial center coordinates
    const initialCenter = await getCenterValue(page, centerDisplay);

    // 3. Perform pan drag (100px right, 50px down)
    await dragCanvas(page, canvas, 100, 50);

    // 4. Wait for render cycle
    await page.waitForTimeout(500);

    // 5. Verify center coordinates changed
    const finalCenter = await getCenterValue(page, centerDisplay);

    // Center should have moved (exact values depend on zoom level)
    expect(finalCenter[0]).not.toBe(initialCenter[0]);
    expect(finalCenter[1]).not.toBe(initialCenter[1]);

    // 6. Verify render is still active (frame counter or FPS)
    const frameText = await page.locator("#frame-display").textContent();
    expect(parseInt(frameText || "0")).toBeGreaterThan(0);
  });

  test("should zoom when using wheel", async ({ page }) => {
    const url = "http://localhost:4179/examples/standalone-rendering/";

    // 1. Load example and wait for initial render
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const canvas = page.locator("#map-canvas");
    const zoomDisplay = page.locator("#zoom-display");
    const fpsDisplay = page.locator("#fps-display");

    // Wait for initial render to complete
    await page.waitForTimeout(2000);

    // 2. Record initial zoom level
    const initialZoom = await getZoomValue(page, zoomDisplay);

    // 3. Perform wheel zoom in
    await wheelZoom(page, canvas, -100);

    // 4. Wait for render cycle
    await page.waitForTimeout(500);

    // 5. Verify zoom level INCREASED
    const finalZoom = await getZoomValue(page, zoomDisplay);
    expect(finalZoom).toBeGreaterThan(initialZoom);

    // 6. Verify render is still active
    const fpsText = await fpsDisplay.textContent();
    expect(fpsText).not.toBe("--");
    expect(fpsText).not.toBe("0");
  });
});
