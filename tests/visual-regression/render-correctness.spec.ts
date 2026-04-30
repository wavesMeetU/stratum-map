import { expect, test, type Page } from "@playwright/test";
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
});
