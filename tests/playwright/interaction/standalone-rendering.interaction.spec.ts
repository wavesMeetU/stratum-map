import { test, expect, type Page } from "@playwright/test";
import {
  dragCanvas,
  wheelZoom,
  waitForRenderStable,
  getZoomValue,
  getCenterValue,
} from "../utils/interactions";

/**
 * Compute the world point currently under a canvas-relative CSS pixel position
 * (rotation = 0), derived from the example's HUD displays.
 */
async function worldUnderCursor(
  page: Page,
  centerDisplay: ReturnType<Page["locator"]>,
  zoomDisplay: ReturnType<Page["locator"]>,
  canvas: ReturnType<Page["locator"]>,
  px: number,
  py: number
): Promise<{ x: number; y: number }> {
  const center = await getCenterValue(page, centerDisplay);
  const zoom = await getZoomValue(page, zoomDisplay);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box not available");
  }
  const resolution = 156543.03392804103 / Math.pow(2, zoom);
  return {
    x: center[0] + (px - box.width / 2) * resolution,
    y: center[1] - (py - box.height / 2) * resolution,
  };
}

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

  test("should keep the world point under the cursor stable on double-click zoom", async ({ page }) => {
    const url = "http://localhost:4179/examples/standalone-rendering/";

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const canvas = page.locator("#map-canvas");
    const zoomDisplay = page.locator("#zoom-display");
    const centerDisplay = page.locator("#center-display");

    // Pan first so the center is away from the world origin — the anchor bug
    // only manifests when center ≠ [0, 0]
    await dragCanvas(page, canvas, 100, 50);
    await page.waitForTimeout(500);

    // World point under the cursor before double-clicking (CSS px offset
    // from the canvas origin — same space as viewportSize)
    const px = 900, py = 150;
    const before = await worldUnderCursor(page, centerDisplay, zoomDisplay, canvas, px, py);

    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Canvas bounding box not available");
    }
    await page.mouse.dblclick(box.x + px, box.y + py);
    await page.waitForTimeout(500);

    // Zoom increased
    const zoomAfter = await getZoomValue(page, zoomDisplay);
    expect(zoomAfter).toBeGreaterThan(10);

    // The world point under the cursor must not have drifted.
    // HUD displays are rounded (zoom to 2 decimals), so allow a small
    // tolerance in CSS pixels; the pre-fix bug drifted > 100 px.
    const after = await worldUnderCursor(page, centerDisplay, zoomDisplay, canvas, px, py);
    const resolutionAfter = 156543.03392804103 / Math.pow(2, zoomAfter);
    const driftPx = {
      x: (after.x - before.x) / resolutionAfter,
      y: (after.y - before.y) / resolutionAfter,
    };
    expect(Math.abs(driftPx.x)).toBeLessThan(10);
    expect(Math.abs(driftPx.y)).toBeLessThan(10);
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
