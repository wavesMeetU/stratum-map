/**
 * GpuLineChunkSlot — byte-accounting formula only (Stage 6.2).
 *
 * The constructor itself requires a real GPUDevice (not available in Node), so this file
 * covers exactly the deterministic, GPU-free part: `byteSizesForSegmentCount`. Full
 * construction/destruction/replacement behavior is covered by the interaction test
 * against the real points-lines-demo example (tests/playwright/interaction/).
 *
 * Run: node --test tests/gpu-line-chunk-slot.spec.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { GpuLineChunkSlot } = await import(join(root, "dist/gpu/gpu-line-chunk-slot.js"));

describe("GpuLineChunkSlot.byteSizesForSegmentCount", () => {
  it("returns zero for zero segments", () => {
    const s = GpuLineChunkSlot.byteSizesForSegmentCount(0);
    assert.deepEqual(s, { startPosBytes: 0, endPosBytes: 0, featureIdBytes: 0, styleGpuBytes: 0 });
  });

  it("computes exact byte sizes matching the 4-buffer layout (8+8+4+4 bytes/segment)", () => {
    const s = GpuLineChunkSlot.byteSizesForSegmentCount(10);
    assert.deepEqual(s, { startPosBytes: 80, endPosBytes: 80, featureIdBytes: 40, styleGpuBytes: 40 });
    const total = s.startPosBytes + s.endPosBytes + s.featureIdBytes + s.styleGpuBytes;
    assert.equal(total, 10 * 24, "total bytes per segment must be 24 (8 start + 8 end + 4 featureId + 4 styleId, no index buffer)");
  });

  it("scales linearly with segment count", () => {
    const a = GpuLineChunkSlot.byteSizesForSegmentCount(100);
    const b = GpuLineChunkSlot.byteSizesForSegmentCount(200);
    assert.equal(b.startPosBytes, a.startPosBytes * 2);
    assert.equal(b.endPosBytes, a.endPosBytes * 2);
    assert.equal(b.featureIdBytes, a.featureIdBytes * 2);
    assert.equal(b.styleGpuBytes, a.styleGpuBytes * 2);
  });
});
