import { test, expect } from "@playwright/test";
import {
  dragCanvas,
  wheelZoom,
  waitForRenderStable,
  getZoomValue,
} from "../utils/interactions";

/**
 * Minimal Native Interaction Tests
 *
 * Tests core user interactions:
 * - Pan (drag canvas)
 * - Zoom (wheel scroll)
 */
test.describe("minimal-native interaction tests", () => {
  test("should pan when dragging canvas", async ({ page }) => {
    const url = "http://localhost:4179/examples/minimal-native/";

    // 1. Load example and wait for stability
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const canvas = page.locator("#canvas");
    const zoomDisplay = page.locator("#zoom");
    const fpsDisplay = page.locator("#fps");

    // Wait for render to be stable
    await waitForRenderStable(page, fpsDisplay);

    // 2. Record initial zoom level
    const initialZoom = await getZoomValue(page, zoomDisplay);

    // 3. Perform pan drag (100px right)
    await dragCanvas(page, canvas, 100, 0);

    // 4. Wait for render cycle
    await page.waitForTimeout(500);

    // 5. Verify zoom level did NOT change (pan shouldn't affect zoom)
    const finalZoom = await getZoomValue(page, zoomDisplay);
    expect(finalZoom).toBe(initialZoom);

    // 6. Verify FPS is still updating (render still active)
    const fpsText = await fpsDisplay.textContent();
    expect(fpsText).not.toBe("--");
    expect(fpsText).not.toBe("0");
  });

  test("should zoom when using wheel", async ({ page }) => {
    const url = "http://localhost:4179/examples/minimal-native/";

    // 1. Load example and wait for stability
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const canvas = page.locator("#canvas");
    const zoomDisplay = page.locator("#zoom");
    const fpsDisplay = page.locator("#fps");

    // Wait for render to be stable
    await waitForRenderStable(page, fpsDisplay);

    // 2. Record initial zoom level
    const initialZoom = await getZoomValue(page, zoomDisplay);

    // 3. Perform wheel zoom in (negative delta = zoom in)
    await wheelZoom(page, canvas, -100);

    // 4. Wait for render cycle
    await page.waitForTimeout(500);

    // 5. Verify zoom level INCREASED
    const finalZoom = await getZoomValue(page, zoomDisplay);
    expect(finalZoom).toBeGreaterThan(initialZoom);

    // 6. Verify FPS is still updating
    const fpsText = await fpsDisplay.textContent();
    expect(fpsText).not.toBe("--");
    expect(fpsText).not.toBe("0");
  });
});
