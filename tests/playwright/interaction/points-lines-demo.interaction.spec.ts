import { test, expect, type Page } from "@playwright/test";

/**
 * Points + Lines Demo Interaction Test (Stage 6.2, experimental)
 *
 * Exercises the smallest complete LineString rendering vertical slice against the real
 * points-lines-demo example: picking (line, point, and miss), and line-width stability
 * under zoom and rotation — measured directly from rendered pixels, not asserted.
 *
 * Screen positions for known world coordinates are computed analytically (mirroring
 * ViewState.getClipMatrix() exactly) rather than hardcoded, so this test is robust to the
 * Playwright viewport size actually in effect.
 */

const BASE_RESOLUTION = 156543.03392804103;

function resolutionForZoom(zoom: number): number {
  return BASE_RESOLUTION / Math.pow(2, zoom);
}

/** Mirrors ViewState.getClipMatrix() (core/view-state.ts) exactly. */
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

/** World -> CSS-pixel position within the canvas (assumes deviceScaleFactor 1, matching this project's interaction config). */
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

/**
 * Captures the current canvas and measures the pixel THICKNESS of a (roughly)
 * horizontal line by scanning a single VERTICAL column at `scanX` and measuring the
 * vertical extent of the CONTIGUOUS run of non-background pixels closest to `expectedY`
 * — scanning horizontally through a horizontal line would measure its length, not its
 * thickness, and a naive "first hit to last hit" span is wrong whenever the same column
 * also crosses an unrelated line elsewhere (this dataset's two lines and the zigzag's own
 * diagonal segments can all share the same x range at some zoom levels), so this isolates
 * the specific contiguous cluster nearest the expected position rather than spanning every
 * hit in the column.
 *
 * Uses `canvas.toDataURL()` + `Image` (not `createImageBitmap(canvas)`, which was found
 * empirically to return all-zero pixel data for this WebGPU-backed canvas in this
 * environment, despite the canvas visibly containing correct content — confirmed via
 * `page.screenshot()` and `toDataURL()` both capturing it correctly).
 */
async function measureLineThicknessAtColumn(page: Page, scanX: number, expectedY: number): Promise<number> {
  return page.evaluate(
    async ({ x, expectedY }) => {
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
      const col = ctx.getImageData(Math.max(0, Math.min(canvas.width - 1, Math.round(x))), 0, 1, canvas.height).data;
      const isHit = (y: number) => {
        const r = col[y * 4];
        const g = col[y * 4 + 1];
        // background is a dark navy (~10,15,24); the orange/green lines are clearly brighter.
        return r > 100 || g > 100;
      };
      const clampedExpected = Math.max(0, Math.min(canvas.height - 1, Math.round(expectedY)));
      // Find the nearest hit to expectedY (search outward in both directions), then walk
      // that hit's contiguous run to its start/end.
      let nearest = -1;
      for (let d = 0; d < canvas.height; d++) {
        const up = clampedExpected - d;
        const down = clampedExpected + d;
        if (up >= 0 && isHit(up)) {
          nearest = up;
          break;
        }
        if (down < canvas.height && isHit(down)) {
          nearest = down;
          break;
        }
      }
      if (nearest === -1) return 0;
      let first = nearest;
      while (first > 0 && isHit(first - 1)) first--;
      let last = nearest;
      while (last < canvas.height - 1 && isHit(last + 1)) last++;
      return last - first + 1;
    },
    { x: scanX, expectedY },
  );
}

test.describe("points-lines-demo interaction tests", () => {
  test("picks a line feature, a point feature, and correctly misses empty space", async ({ page }) => {
    const url = "http://localhost:4179/examples/points-lines-demo/";
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");

    const viewport: [number, number] = [box.width, box.height];
    const center: [number, number] = [0, 0];
    const zoom = 6;
    const rotation = 0;

    // Point #4 ("center") sits exactly at world (0,0).
    const centerPx = worldToCssPx(0, 0, zoom, rotation, center, viewport);
    await page.mouse.click(box.x + centerPx.x, box.y + centerPx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/point #4/);

    // Line #100's zigzag peak vertex sits at world (0, 600000).
    const linePeakPx = worldToCssPx(0, 600_000, zoom, rotation, center, viewport);
    await page.mouse.click(box.x + linePeakPx.x, box.y + linePeakPx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/line #100/);

    // Line #101's V-shape left-arm midpoint: (-600000,-200000) -> (0,-600000), midpoint (-300000,-400000).
    const line101Px = worldToCssPx(-300_000, -400_000, zoom, rotation, center, viewport);
    await page.mouse.click(box.x + line101Px.x, box.y + line101Px.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/line #101/);

    // A point that is on-canvas but clearly away from every point/line/polygon feature must
    // miss (world coordinates far off-canvas would leave the click landing outside the
    // canvas element entirely, which wouldn't exercise picking at all). (500000, -500000)
    // was used here before Stage 6.6 added the "frame (hole)" polygon, which now legitimately
    // covers that coordinate — (500000, 500000) is clear of every point/line/polygon feature.
    const emptyPx = worldToCssPx(500_000, 500_000, zoom, rotation, center, viewport);
    await page.mouse.click(box.x + emptyPx.x, box.y + emptyPx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText("—");
  });

  test("line width stays visually constant across zoom levels", async ({ page }) => {
    const url = "http://localhost:4179/examples/points-lines-demo/";
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });
    // Let the first WebGPU frame actually complete before reading pixels (page/network
    // "load" does not guarantee the GPU has finished executing the initial render).
    await page.waitForTimeout(500);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");

    // The flat left segment of the north zigzag is horizontal (world y=200000), so its
    // thickness is measured with a VERTICAL scan through a column that crosses it.
    const flatSegmentPx = worldToCssPx(-400_000, 200_000, 6, 0, [0, 0], [box.width, box.height]);
    const widthAtZoom6 = await measureLineThicknessAtColumn(page, flatSegmentPx.x, flatSegmentPx.y);
    expect(widthAtZoom6).toBeGreaterThan(0);

    // Zoom in several steps.
    for (let i = 0; i < 6; i++) {
      await canvas.dispatchEvent("wheel", { deltaY: -150, deltaX: 0 });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    const zoomText = await page.locator("#zoom-display").textContent();
    const zoomedLevel = parseFloat(zoomText ?? "6");
    expect(zoomedLevel).toBeGreaterThan(6);

    const flatSegmentPxZoomed = worldToCssPx(-400_000, 200_000, zoomedLevel, 0, [0, 0], [box.width, box.height]);
    const widthAtZoomedIn = await measureLineThicknessAtColumn(page, flatSegmentPxZoomed.x, flatSegmentPxZoomed.y);

    // Width in pixels must stay close to constant (allow a few pixels of AA/measurement slack).
    expect(Math.abs(widthAtZoomedIn - widthAtZoom6)).toBeLessThanOrEqual(4);
  });

  test("line remains rendered (non-zero visual footprint) after rotation", async ({ page }) => {
    const url = "http://localhost:4179/examples/points-lines-demo/";
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");

    const beforePx = worldToCssPx(-400_000, 200_000, 6, 0, [0, 0], [box.width, box.height]);
    const widthBefore = await measureLineThicknessAtColumn(page, beforePx.x, beforePx.y);
    expect(widthBefore).toBeGreaterThan(0);

    // Rotate via keyboard (Q/E) — the example's listener is window-level, no focus needed.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("e");
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    const rotationText = await page.locator("#rotation-display").textContent();
    const rotationDeg = parseFloat(rotationText ?? "0");
    expect(Math.abs(rotationDeg)).toBeGreaterThan(0);
    const rotationRad = (rotationDeg * Math.PI) / 180;

    // After rotation the previously-horizontal segment is tilted, so a single-column
    // vertical scan no longer measures pure perpendicular thickness — this checks only
    // that the line still has a comparable, non-zero visual footprint post-rotation, not
    // an exact width (the zoom test above is the precise, same-orientation comparison).
    const afterPx = worldToCssPx(-400_000, 200_000, 6, rotationRad, [0, 0], [box.width, box.height]);
    const widthAfter = await measureLineThicknessAtColumn(page, afterPx.x, afterPx.y);
    expect(widthAfter).toBeGreaterThan(0);
  });

  test("points and lines coexist: both are visible and independently pickable in one frame", async ({ page }) => {
    const url = "http://localhost:4179/examples/points-lines-demo/";
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const canvas = page.locator("#map-canvas");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // Both a point and a line pick succeeding in the same page session (no reload,
    // no renderer re-creation) is itself the coexistence proof: one ViewState, one
    // composited GPURenderPassEncoder, two independent renderers.
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");
    const viewport: [number, number] = [box.width, box.height];

    const pointPx = worldToCssPx(-400_000, 400_000, 6, 0, [0, 0], viewport); // NW anchor
    await page.mouse.click(box.x + pointPx.x, box.y + pointPx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/point #0/);

    const linePx = worldToCssPx(0, 600_000, 6, 0, [0, 0], viewport); // zigzag peak
    await page.mouse.click(box.x + linePx.x, box.y + linePx.y);
    await page.waitForTimeout(200);
    await expect(page.locator("#pick-display")).toHaveText(/line #100/);
  });
});
