import { expect, test } from "@playwright/test";

interface HarnessResult {
  ok: boolean;
  error?: string;
  summary?: { totalFeatures: number; totalChunks: number };
  checks: {
    chunkCount: number;
    recordCounts: readonly number[];
    totalVertices: number;
    uniqueFeatureIds: number;
    positionsAreArrayBuffer: boolean;
    styleDefaultApplied: boolean;
  };
}

test.describe("GeoJSON worker (browser)", () => {
  test("chunked parse → ArrayBuffers + TypedArray views; no NaN; stable feature ids", async ({
    page,
  }) => {
    await page.goto("/geojson-worker-test.html", { waitUntil: "load" });

    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __geoJsonWorkerTest?: HarnessResult }).__geoJsonWorkerTest !==
        undefined,
      null,
      { timeout: 60_000 },
    );

    const r = (await page.evaluate(() => {
      return (globalThis as unknown as { __geoJsonWorkerTest: HarnessResult }).__geoJsonWorkerTest;
    })) as HarnessResult;

    if (!r.ok) {
      throw new Error(r.error ?? "harness failed");
    }

    expect(r.summary?.totalFeatures).toBe(2500);
    expect(r.summary?.totalChunks).toBe(3);
    expect(r.checks.chunkCount).toBe(3);
    expect([...r.checks.recordCounts]).toEqual([1000, 1000, 500]);
    expect(r.checks.totalVertices).toBe(2500);
    expect(r.checks.uniqueFeatureIds).toBe(2500);
    expect(r.checks.positionsAreArrayBuffer).toBe(true);
    expect(r.checks.styleDefaultApplied).toBe(true);
  });
});
