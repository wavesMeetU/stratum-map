import { test, expect, type Page } from "@playwright/test";

/**
 * Points + Lines + Polygons Demo — Polygon Interaction Tests (Stage 6.6, experimental)
 *
 * Exercises the smallest complete filled-`Polygon` rendering vertical slice against the
 * real points-lines-demo example: indexed-triangle rendering (including a concave polygon
 * and a polygon with a hole), multiple fill styles, and GPU picking (interior, hole,
 * miss, and a FeatureId at the GPU-safe ceiling) — measured directly from rendered pixels
 * and the real pick pass, not asserted from source data.
 *
 * Screen positions for known world coordinates are computed analytically (mirroring
 * ViewState.getClipMatrix() exactly) rather than hardcoded, so this test is robust to the
 * Playwright viewport size actually in effect. See `points-lines-demo.interaction.spec.ts`
 * for the point/line equivalent of this same pattern.
 */

const BASE_RESOLUTION = 156543.03392804103;
const HIGH_FEATURE_ID = 0xfffffffe;

function resolutionForZoom(zoom: number): number {
  return BASE_RESOLUTION / Math.pow(2, zoom);
}

function clipMatrixCoeffs(
  center: [number, number],
  resolution: number,
  rotation: number,
  viewport: [number, number],
) {
  const [cx, cy] = center;
  const [width, height] = viewport;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return {
    m0: (cos / resolution) * (2 / width),
    m4: (-sin / resolution) * (2 / height),
    m1: (sin / resolution) * (2 / width),
    m5: (cos / resolution) * (2 / height),
    m12: ((-cx * cos - cy * sin) / resolution) * (2 / width),
    m13: ((cx * sin - cy * cos) / resolution) * (2 / height),
  };
}

function worldToCssPx(
  worldX: number,
  worldY: number,
  zoom: number,
  rotation: number,
  center: [number, number],
  viewportCssPx: [number, number],
): { x: number; y: number } {
  const m = clipMatrixCoeffs(center, resolutionForZoom(zoom), rotation, viewportCssPx);
  const ndcX = m.m0 * worldX + m.m4 * worldY + m.m12;
  const ndcY = m.m1 * worldX + m.m5 * worldY + m.m13;
  const [vx, vy] = viewportCssPx;
  return { x: ((ndcX + 1) / 2) * vx, y: ((1 - ndcY) / 2) * vy };
}

/** Samples one CSS-pixel-space RGB from the canvas, via toDataURL (see sibling spec file's `measureLineThicknessAtColumn` for why not `createImageBitmap`). */
async function samplePixelAt(page: Page, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  return page.evaluate(
    async ({ x, y }) => {
      const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
      const dataUrl = canvas.toDataURL();
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image decode failed"));
        img.src = dataUrl;
      });
      const off = new OffscreenCanvas(canvas.width, canvas.height);
      const ctx = off.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    },
    { x, y },
  );
}

// Background clear color is { r: 0.04, g: 0.06, b: 0.1 } (main.ts) ≈ (10, 15, 26) in 0-255.
const BACKGROUND_MAX = 60;

async function gotoDemo(page: Page): Promise<{ box: { x: number; y: number; width: number; height: number } }> {
  const url = "http://localhost:4179/examples/points-lines-demo/";
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  const canvas = page.locator("#map-canvas");
  await expect(canvas).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500); // let the first WebGPU frame actually complete
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  return { box };
}

const ZOOM = 6;
const ROTATION = 0;
const CENTER: [number, number] = [0, 0];

test.describe("points-lines-demo polygon interaction tests (Stage 6.6)", () => {
  test("multiple filled Polygon features render with distinct styles, both clearly brighter than background", async ({
    page,
  }) => {
    const { box } = await gotoDemo(page);
    const viewport: [number, number] = [box.width, box.height];

    const squarePx = worldToCssPx(150_000, 375_000, ZOOM, ROTATION, CENTER, viewport); // style 0 (green)
    const framePx = worldToCssPx(340_000, -500_000, ZOOM, ROTATION, CENTER, viewport); // style 1 (violet)

    const square = await samplePixelAt(page, box.x + squarePx.x, box.y + squarePx.y);
    const frame = await samplePixelAt(page, box.x + framePx.x, box.y + framePx.y);

    // Style 0: green-dominant.
    expect(square.g).toBeGreaterThan(BACKGROUND_MAX);
    expect(square.g).toBeGreaterThan(square.r);
    expect(square.g).toBeGreaterThan(square.b);

    // Style 1: violet — red and blue both clearly exceed green.
    expect(frame.r).toBeGreaterThan(BACKGROUND_MAX);
    expect(frame.r).toBeGreaterThan(frame.g);
    expect(frame.b).toBeGreaterThan(frame.g);

    // The two styles select genuinely different colors.
    expect(Math.abs(square.r - frame.r) + Math.abs(square.g - frame.g) + Math.abs(square.b - frame.b)).toBeGreaterThan(
      60,
    );
  });

  test("concave polygon (L-shape) renders correctly: both arms filled, the missing notch stays background", async ({
    page,
  }) => {
    const { box } = await gotoDemo(page);
    const viewport: [number, number] = [box.width, box.height];

    const armPx = worldToCssPx(-500_000, -550_000, ZOOM, ROTATION, CENTER, viewport); // inside the L's horizontal arm
    const notchPx = worldToCssPx(-440_000, -440_000, ZOOM, ROTATION, CENTER, viewport); // inside the bounding box, outside the L

    const arm = await samplePixelAt(page, box.x + armPx.x, box.y + armPx.y);
    const notch = await samplePixelAt(page, box.x + notchPx.x, box.y + notchPx.y);

    expect(arm.g).toBeGreaterThan(BACKGROUND_MAX);
    expect(arm.g).toBeGreaterThan(arm.r);

    // A naive convex (fan) triangulation would have filled the notch too — this is exactly
    // the case that proves earcut's concave handling, not just its existence.
    expect(notch.r).toBeLessThan(BACKGROUND_MAX);
    expect(notch.g).toBeLessThan(BACKGROUND_MAX);
    expect(notch.b).toBeLessThan(BACKGROUND_MAX);
  });

  test("polygon hole remains visually empty (background-colored), frame material does not", async ({ page }) => {
    const { box } = await gotoDemo(page);
    const viewport: [number, number] = [box.width, box.height];

    const framePx = worldToCssPx(340_000, -500_000, ZOOM, ROTATION, CENTER, viewport);
    const holePx = worldToCssPx(440_000, -515_000, ZOOM, ROTATION, CENTER, viewport);

    const frame = await samplePixelAt(page, box.x + framePx.x, box.y + framePx.y);
    const hole = await samplePixelAt(page, box.x + holePx.x, box.y + holePx.y);

    expect(frame.r).toBeGreaterThan(BACKGROUND_MAX);
    expect(hole.r).toBeLessThan(BACKGROUND_MAX);
    expect(hole.g).toBeLessThan(BACKGROUND_MAX);
    expect(hole.b).toBeLessThan(BACKGROUND_MAX);
  });

  test("polygon picking: interior picks correctly, hole and notch miss, high FeatureId decodes correctly", async ({
    page,
  }) => {
    const { box } = await gotoDemo(page);
    const viewport: [number, number] = [box.width, box.height];

    const click = async (worldX: number, worldY: number) => {
      const px = worldToCssPx(worldX, worldY, ZOOM, ROTATION, CENTER, viewport);
      await page.mouse.click(box.x + px.x, box.y + px.y);
      await page.waitForTimeout(200);
    };

    await click(150_000, 375_000); // square interior
    await expect(page.locator("#pick-display")).toHaveText(/polygon #500/);

    await click(-500_000, -550_000); // L-shape arm interior
    await expect(page.locator("#pick-display")).toHaveText(/polygon #501/);

    await click(-440_000, -440_000); // L-shape notch — structurally inside the bounding box, not the polygon
    await expect(page.locator("#pick-display")).toHaveText("—");

    await click(340_000, -500_000); // frame material
    await expect(page.locator("#pick-display")).toHaveText(/polygon #502/);

    await click(440_000, -515_000); // hole interior — must NOT pick the frame polygon
    await expect(page.locator("#pick-display")).toHaveText("—");

    await click(-50_000, 100_000); // high-FeatureId square interior
    await expect(page.locator("#pick-display")).toHaveText(new RegExp(`polygon #${HIGH_FEATURE_ID}`));
  });

  test("points, lines, and polygons coexist: all three pick correctly in one session", async ({ page }) => {
    const { box } = await gotoDemo(page);
    const viewport: [number, number] = [box.width, box.height];

    const pointPx = worldToCssPx(-400_000, 400_000, ZOOM, ROTATION, CENTER, viewport); // NW anchor
    await page.mouse.click(box.x + pointPx.x, box.y + pointPx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/point #0/);

    const linePx = worldToCssPx(0, 600_000, ZOOM, ROTATION, CENTER, viewport); // zigzag peak
    await page.mouse.click(box.x + linePx.x, box.y + linePx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/line #100/);

    const polygonPx = worldToCssPx(150_000, 375_000, ZOOM, ROTATION, CENTER, viewport); // square interior
    await page.mouse.click(box.x + polygonPx.x, box.y + polygonPx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/polygon #500/);
  });
});
