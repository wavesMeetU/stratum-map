import { expect, test, type Page } from "@playwright/test";
import { createCanvas, loadImage } from "canvas";
import { WEBGPU_CANVAS_SCREENSHOT } from "./visual-baseline";

test.describe.configure({ mode: "serial" });

async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function samplePixelRgba(png: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

interface HarnessSnapshot {
  readonly ready: boolean;
  readonly skipped: boolean;
  readonly reason: string | null;
  readonly pointCount: number;
}

async function gotoHarness(page: Page): Promise<{ skip: boolean; reason?: string }> {
  await page.goto("/visual-harness.html", { waitUntil: "load" });
  await page.waitForFunction(
    () => {
      const h = (globalThis as unknown as { __visualHarness?: HarnessSnapshot }).__visualHarness;
      return h !== undefined && (h.ready || h.skipped);
    },
    null,
    { timeout: 60_000 },
  );

  const meta = (await page.evaluate(() => {
    const h = (globalThis as unknown as { __visualHarness: HarnessSnapshot }).__visualHarness;
    return { skipped: h.skipped, reason: h.reason, ready: h.ready };
  })) as { skipped: boolean; reason: string | null; ready: boolean };

  if (meta.skipped) {
    const reason = meta.reason ?? "skipped";
    const envOnly = /WebGPU unavailable|no GPUCanvasContext|adapter not available/i.test(reason);
    if (envOnly) {
      return { skip: true, reason };
    }
    throw new Error(`Visual harness failed: ${reason}`);
  }
  if (!meta.ready) {
    throw new Error("Visual harness not ready");
  }
  return { skip: false };
}

test.describe("WebGPU visual regression (points)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
  });

  test("baseline — identity clip, 1600 points", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }
    await settleFrames(page);
    await expect(page.locator("#gpu-canvas")).toHaveScreenshot(
      "points-identity-1600.png",
      WEBGPU_CANVAS_SCREENSHOT,
    );
    const n = await page.evaluate(() => {
      return (globalThis as unknown as { __visualHarness: HarnessSnapshot }).__visualHarness
        .pointCount;
    });
    expect(n).toBe(1600);
  });

  test("zoom — clip scale matrix", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const scales = [
      { scale: 0.62, name: "zoom-out-062" },
      { scale: 1, name: "zoom-100" },
      { scale: 1.45, name: "zoom-in-145" },
    ] as const;

    for (const { scale, name } of scales) {
      await page.evaluate((s) => {
        const h = (globalThis as unknown as { __visualHarness: { setZoomScale: (x: number) => void } })
          .__visualHarness;
        h.setZoomScale(s);
      }, scale);
      await settleFrames(page);
      await expect(page.locator("#gpu-canvas")).toHaveScreenshot(`points-${name}.png`, WEBGPU_CANVAS_SCREENSHOT);
    }
  });

  test("dataset density — 400 vs 8000 points", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    await page.evaluate(() => {
      const h = (globalThis as unknown as { __visualHarness: { setPointCount: (n: number, s?: number) => void } })
        .__visualHarness;
      h.setPointCount(400, 0xdeadbeef);
    });
    await settleFrames(page);
    await expect(page.locator("#gpu-canvas")).toHaveScreenshot("points-dataset-400.png", WEBGPU_CANVAS_SCREENSHOT);

    await page.evaluate(() => {
      const h = (globalThis as unknown as { __visualHarness: { setPointCount: (n: number, s?: number) => void } })
        .__visualHarness;
      h.setPointCount(8000, 0xcafebabe);
    });
    await settleFrames(page);
    await expect(page.locator("#gpu-canvas")).toHaveScreenshot("points-dataset-8000.png", WEBGPU_CANVAS_SCREENSHOT);
  });

  /**
   * Regression probe for Stage 6.2.1: `GpuStyle`'s WGSL struct previously included a
   * trailing `_pad: vec3<f32>` field, which (per WGSL alignment rules) inflated the struct
   * to a 48-byte array stride, while the JS-side `setStyleTable` upload used a 32-byte
   * stride. `style_table[0]` still landed on real style-0 data (offset 0 matches in both
   * layouts), but `style_table[1]` read 16 bytes into what the JS side had written as style
   * 0's tail + style 1's own head — decoding a color with alpha 0, i.e. fully invisible.
   * This test isolates exactly that: two non-overlapping points, one per style index,
   * pixel-probed by decoded color rather than a full-canvas screenshot diff so it fails
   * deterministically on the underlying defect instead of on incidental AA/GPU drift.
   */
  test("style table — style index 0 and style index 1 both render distinct, non-transparent colors", async ({
    page,
  }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    await page.evaluate(() => {
      const h = (globalThis as unknown as { __visualHarness: { setStyleProbe: () => void } }).__visualHarness;
      h.setStyleProbe();
    });
    await settleFrames(page);

    const canvasLocator = page.locator("#gpu-canvas");
    const box = await canvasLocator.boundingBox();
    if (!box) {
      throw new Error("#gpu-canvas has no bounding box");
    }
    const png = await canvasLocator.screenshot();

    // Harness places style-0 point at clip x=-0.5 (≈25% width) and style-1 point at clip
    // x=+0.5 (≈75% width), both vertically centered (clip y=0 ≈ 50% height).
    const leftX = Math.round(box.width * 0.25);
    const rightX = Math.round(box.width * 0.75);
    const midY = Math.round(box.height * 0.5);

    const [style0R, style0G, style0B] = await samplePixelRgba(png, leftX, midY);
    const [style1R, style1G, style1B] = await samplePixelRgba(png, rightX, midY);

    // Page screenshots always report alpha 255 (opaque page composite) — background vs.
    // rendered-point is distinguished by brightness, not alpha. Canvas clear color is
    // near-black (#0a0a0c ≈ rgb(10,10,12)); "rendered" means clearly brighter than that.
    const BACKGROUND_MAX = 60;

    // Style 0 renders correctly: red-dominant [0.92, 0.28, 0.22, 1.0].
    expect(style0R).toBeGreaterThan(BACKGROUND_MAX);
    expect(style0R).toBeGreaterThan(style0G);
    expect(style0R).toBeGreaterThan(style0B);

    // Style 1 renders correctly: blue-dominant [0.22, 0.58, 0.96, 1.0]. Before the fix, this
    // pixel was indistinguishable from background (alpha 0 in the shader means nothing was
    // drawn there) — the exact defect under test.
    expect(style1B).toBeGreaterThan(BACKGROUND_MAX);
    expect(style1B).toBeGreaterThan(style1R);
    expect(style1B).toBeGreaterThan(style1G);

    // Multiple style ids select genuinely different colors, not the same (mis-decoded) one.
    expect(Math.abs(style0R - style1R) + Math.abs(style0G - style1G) + Math.abs(style0B - style1B)).toBeGreaterThan(
      60,
    );
  });
});

interface LineEvictionScenarioResult {
  readonly keysBefore: readonly string[];
  readonly residentBytesBefore: number;
  readonly bytesPerChunk: number;
  readonly evicted: readonly string[];
  readonly keysAfter: readonly string[];
  readonly residentBytesAfter: number;
  readonly chunkCountAfter: number;
}

async function runLineEvictionScenario(
  page: Page,
  ingestCount: number,
  evictCount: number,
): Promise<LineEvictionScenarioResult> {
  return page.evaluate(
    ({ ingestCount, evictCount }) => {
      const h = (globalThis as unknown as {
        __visualHarness: { runLineEvictionScenario: (i: number, e: number) => LineEvictionScenarioResult };
      }).__visualHarness;
      return h.runLineEvictionScenario(ingestCount, evictCount);
    },
    { ingestCount, evictCount },
  );
}

/**
 * Stage 6.3: `WebGpuLineRenderer.evictOldestChunks(count)` regression coverage. Each
 * synthetic chunk ingested by `runLineEvictionScenario` (see `visual-harness.ts`) is an
 * identical, deterministic byte size, so `bytesPerChunk` gives an exact expected value for
 * byte accounting without re-deriving GPU buffer sizes on the Node side.
 */
test.describe("WebGPU line renderer chunk eviction (points+lines harness)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
  });

  test("zero count evicts nothing and leaves residency unchanged", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runLineEvictionScenario(page, 5, 0);

    expect(result.evicted).toEqual([]);
    expect(result.keysAfter).toEqual(result.keysBefore);
    expect(result.residentBytesAfter).toBe(result.residentBytesBefore);
    expect(result.chunkCountAfter).toBe(5);
  });

  test("positive count evicts exactly that many, oldest-ingested first", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runLineEvictionScenario(page, 5, 2);

    // Ingest order is evict-test-0 .. evict-test-4; no chunk is re-touched after ingest, so
    // LRU order matches ingest order — the two oldest are evicted first, in that order.
    expect(result.evicted).toEqual(["evict-test-0", "evict-test-1"]);
    expect(result.keysAfter).toEqual(["evict-test-2", "evict-test-3", "evict-test-4"]);
    expect(result.chunkCountAfter).toBe(3);
  });

  test("count larger than residency evicts everything and stops cleanly (no throw, no over-eviction)", async ({
    page,
  }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runLineEvictionScenario(page, 3, 10);

    expect(result.evicted).toEqual(["evict-test-0", "evict-test-1", "evict-test-2"]);
    expect(result.keysAfter).toEqual([]);
    expect(result.chunkCountAfter).toBe(0);
    expect(result.residentBytesAfter).toBe(0);
  });

  test("byte accounting: resident bytes after eviction match remaining chunk count exactly", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runLineEvictionScenario(page, 6, 4);

    expect(result.bytesPerChunk).toBeGreaterThan(0);
    expect(result.residentBytesBefore).toBe(6 * result.bytesPerChunk);
    expect(result.chunkCountAfter).toBe(2);
    expect(result.residentBytesAfter).toBe(2 * result.bytesPerChunk);
    expect(result.residentBytesBefore - result.residentBytesAfter).toBe(4 * result.bytesPerChunk);
  });
});

interface PolygonEvictionScenarioResult {
  readonly keysBefore: readonly string[];
  readonly residentBytesBefore: number;
  readonly bytesPerChunk: number;
  readonly evicted: readonly string[];
  readonly keysAfter: readonly string[];
  readonly residentBytesAfter: number;
  readonly chunkCountAfter: number;
}

interface PolygonReplacementScenarioResult {
  readonly residentBytesAfterFirst: number;
  readonly residentBytesAfterReplace: number;
  readonly chunkCountAfterFirst: number;
  readonly chunkCountAfterReplace: number;
  readonly bytesForSmall: number;
  readonly bytesForLarge: number;
}

async function runPolygonEvictionScenario(
  page: Page,
  ingestCount: number,
  evictCount: number,
): Promise<PolygonEvictionScenarioResult> {
  return page.evaluate(
    ({ ingestCount, evictCount }) => {
      const h = (globalThis as unknown as {
        __visualHarness: { runPolygonEvictionScenario: (i: number, e: number) => PolygonEvictionScenarioResult };
      }).__visualHarness;
      return h.runPolygonEvictionScenario(ingestCount, evictCount);
    },
    { ingestCount, evictCount },
  );
}

async function runPolygonReplacementScenario(page: Page): Promise<PolygonReplacementScenarioResult> {
  return page.evaluate(() => {
    const h = (globalThis as unknown as {
      __visualHarness: { runPolygonReplacementScenario: () => PolygonReplacementScenarioResult };
    }).__visualHarness;
    return h.runPolygonReplacementScenario();
  });
}

/**
 * Stage 6.6: `WebGpuPolygonRenderer` chunk-residency coverage — `evictOldestChunks(count)`
 * (mirrors the line renderer's proven eviction contract exactly, independently
 * implemented) and replacement byte accounting (indexed geometry adds a fourth,
 * index-buffer term to `chunkByteSize`; this proves replacement still subtracts the old
 * chunk's full size — including its index buffer — before adding the new one's).
 */
test.describe("WebGPU polygon renderer chunk residency (points+lines+polygons harness)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 480 });
  });

  test("zero count evicts nothing and leaves residency unchanged", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runPolygonEvictionScenario(page, 5, 0);

    expect(result.evicted).toEqual([]);
    expect(result.keysAfter).toEqual(result.keysBefore);
    expect(result.residentBytesAfter).toBe(result.residentBytesBefore);
    expect(result.chunkCountAfter).toBe(5);
  });

  test("positive count evicts exactly that many, oldest-ingested first", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runPolygonEvictionScenario(page, 5, 2);

    expect(result.evicted).toEqual(["poly-evict-test-0", "poly-evict-test-1"]);
    expect(result.keysAfter).toEqual(["poly-evict-test-2", "poly-evict-test-3", "poly-evict-test-4"]);
    expect(result.chunkCountAfter).toBe(3);
  });

  test("count larger than residency evicts everything and stops cleanly (no throw, no over-eviction)", async ({
    page,
  }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runPolygonEvictionScenario(page, 3, 10);

    expect(result.evicted).toEqual(["poly-evict-test-0", "poly-evict-test-1", "poly-evict-test-2"]);
    expect(result.keysAfter).toEqual([]);
    expect(result.chunkCountAfter).toBe(0);
    expect(result.residentBytesAfter).toBe(0);
  });

  test("byte accounting (including the index buffer) matches remaining chunk count exactly", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runPolygonEvictionScenario(page, 6, 4);

    expect(result.bytesPerChunk).toBeGreaterThan(0);
    expect(result.residentBytesBefore).toBe(6 * result.bytesPerChunk);
    expect(result.chunkCountAfter).toBe(2);
    expect(result.residentBytesAfter).toBe(2 * result.bytesPerChunk);
    expect(result.residentBytesBefore - result.residentBytesAfter).toBe(4 * result.bytesPerChunk);
  });

  test("replacement under the same key does not double-count bytes", async ({ page }) => {
    const r = await gotoHarness(page);
    if (r.skip) {
      test.skip(true, r.reason ?? "WebGPU not available");
      return;
    }

    const result = await runPolygonReplacementScenario(page);

    expect(result.chunkCountAfterFirst).toBe(1);
    expect(result.chunkCountAfterReplace).toBe(1); // still one chunk — replaced, not appended
    expect(result.residentBytesAfterFirst).toBe(result.bytesForSmall);
    // The larger replacement's resident total must equal exactly its own size — not
    // small + large (double-counted) and not stale (still reporting the small chunk's size).
    expect(result.residentBytesAfterReplace).toBe(result.bytesForLarge);
    expect(result.bytesForLarge).toBeGreaterThan(result.bytesForSmall);
  });
});
