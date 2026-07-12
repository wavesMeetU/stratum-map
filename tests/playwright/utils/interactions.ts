/**
 * Interaction Test Utilities
 *
 * Shared helper functions for Playwright interaction tests.
 * Provides consistent patterns for common user interactions.
 */

import type { Page, Locator } from "@playwright/test";

/**
 * Drag the canvas by specified pixel deltas
 *
 * @param page - Playwright page object
 * @param canvas - Canvas element locator
 * @param deltaX - Horizontal drag distance in pixels (positive = right)
 * @param deltaY - Vertical drag distance in pixels (positive = down)
 */
export async function dragCanvas(
  page: Page,
  canvas: Locator,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box not available");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + deltaX;
  const endY = startY + deltaY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
}

/**
 * Perform wheel zoom on canvas
 *
 * @param page - Playwright page object
 * @param canvas - Canvas element locator
 * @param deltaY - Wheel delta (positive = zoom out, negative = zoom in)
 */
export async function wheelZoom(
  page: Page,
  canvas: Locator,
  deltaY: number
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box not available");
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await canvas.dispatchEvent("wheel", { deltaY, deltaX: 0 });
}

/**
 * Wait for render to stabilize by monitoring FPS counter
 *
 * @param page - Playwright page object
 * @param fpsLocator - Locator for FPS counter element
 * @param stableFrames - Number of consistent FPS readings required (default: 2)
 * @returns Promise that resolves when FPS is stable
 */
export async function waitForRenderStable(
  page: Page,
  fpsLocator: Locator,
  stableFrames: number = 2
): Promise<void> {
  let lastFPS = "";
  let stableCount = 0;

  // Wait up to 5 seconds for stable FPS
  const startTime = Date.now();
  while (Date.now() - startTime < 5000) {
    const fps = await fpsLocator.textContent();

    if (fps && fps !== lastFPS && fps !== "--" && fps !== "0") {
      lastFPS = fps;
      stableCount = 0;
    } else if (fps === lastFPS) {
      stableCount++;
      if (stableCount >= stableFrames) {
        return;
      }
    }

    await page.waitForTimeout(100);
  }

  // If we timeout, that's okay - just ensure some FPS value was seen
  if (!lastFPS || lastFPS === "--" || lastFPS === "0") {
    // Try one more time with a simple wait
    await page.waitForTimeout(1000);
    const finalFPS = await fpsLocator.textContent();
    if (finalFPS && finalFPS !== "--" && finalFPS !== "0") {
      return; // Success on retry
    }
    throw new Error("FPS counter never stabilized");
  }
}

/**
 * Get current zoom value from a display element
 *
 * @param page - Playwright page object
 * @param zoomLocator - Locator for zoom display element
 * @returns Current zoom value as number
 */
export async function getZoomValue(
  page: Page,
  zoomLocator: Locator
): Promise<number> {
  const text = await zoomLocator.textContent();
  if (!text) {
    throw new Error("Zoom display not found");
  }
  return parseFloat(text);
}

/**
 * Get current center coordinates from a display element
 *
 * @param page - Playwright page object
 * @param centerLocator - Locator for center display element
 * @returns Current center coordinates [x, y]
 */
export async function getCenterValue(
  page: Page,
  centerLocator: Locator
): Promise<[number, number]> {
  const text = await centerLocator.textContent();
  if (!text) {
    throw new Error("Center display not found");
  }

  // Parse format: "[12345, 67890]"
  const match = text.match(/\[(.+?), (.+?)\]/);
  if (!match) {
    throw new Error(`Unable to parse center value: ${text}`);
  }

  return [parseFloat(match[1]), parseFloat(match[2])];
}

/**
 * Retry an operation at multiple nearby canvas locations
 *
 * Useful for interactions that may not succeed on the first attempt
 * (e.g., clicking on sparse features).
 *
 * @param page - Playwright page object
 * @param canvas - Canvas element locator
 * @param operation - Function to try at each location
 * @param attempts - Number of different locations to try (default: 5)
 */
export async function retryAtLocations(
  page: Page,
  canvas: Locator,
  operation: (x: number, y: number) => Promise<boolean>,
  attempts: number = 5
): Promise<boolean> {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box not available");
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Try center and nearby positions
  const offsets = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: -50, y: 0 },
    { x: 0, y: 50 },
    { x: 0, y: -50 },
  ];

  for (let i = 0; i < Math.min(attempts, offsets.length); i++) {
    const offset = offsets[i];
    const x = centerX + offset.x;
    const y = centerY + offset.y;

    const success = await operation(x, y);
    if (success) {
      return true;
    }

    await page.waitForTimeout(200);
  }

  return false;
}
