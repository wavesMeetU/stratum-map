import { expect, test } from "@playwright/test";

interface BenchPayload {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  frames: number;
  pointCount: number;
  p95FrameMs: number;
}

test.describe("pan/zoom smoothness (synthetic)", () => {
  test("p95 frame time within budget at 100k points (WebGPU)", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __panZoomBenchResult?: BenchPayload }).__panZoomBenchResult !==
        undefined,
      null,
      { timeout: 110_000 },
    );

    const r = (await page.evaluate(() => {
      return (globalThis as unknown as { __panZoomBenchResult: BenchPayload }).__panZoomBenchResult;
    })) as BenchPayload;

    console.log("pan-zoom bench:", r);

    if (r.skipped) {
      const envOnly =
        /WebGPU unavailable|WebGPU init failed|WebGPU init timeout/i.test(r.reason ?? "") ||
        /bench error: WebGPU init timeout/i.test(r.reason ?? "");
      if (envOnly) {
        test.skip(true, r.reason ?? "WebGPU not available in this environment");
        return;
      }
      throw new Error(`Bench failed: ${r.reason ?? "unknown"}`);
    }

    expect(r.frames).toBeGreaterThan(0);
    expect(r.pointCount).toBe(100_000);
    expect(
      r.ok,
      `p95 ${r.p95FrameMs.toFixed(2)}ms exceeds budget (see examples/pan-zoom-bench/main.ts P95_BUDGET_MS)`,
    ).toBe(true);
  });
});
