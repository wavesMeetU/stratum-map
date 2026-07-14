/**
 * GpuPolygonChunkSlot — byte-accounting formula only (Stage 6.6).
 *
 * The constructor itself requires a real GPUDevice (not available in Node), so this file
 * covers exactly the deterministic, GPU-free part: `byteSizesForCounts`. Full
 * construction/destruction/replacement/eviction behavior is covered by the interaction
 * test against the real points-lines-polygons demo (tests/playwright/interaction/).
 *
 * Run: node --test tests/gpu-polygon-chunk-slot.spec.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { GpuPolygonChunkSlot } = await import(join(root, "dist/gpu/gpu-polygon-chunk-slot.js"));

describe("GpuPolygonChunkSlot.byteSizesForCounts", () => {
  it("returns zero for zero vertices and zero indices", () => {
    const s = GpuPolygonChunkSlot.byteSizesForCounts(0, 0);
    assert.deepEqual(s, { positionBytes: 0, featureIdBytes: 0, styleGpuBytes: 0, indexBytes: 0 });
  });

  it("computes exact byte sizes matching the 4-buffer layout (8+4+4 bytes/vertex, 4 bytes/index)", () => {
    const s = GpuPolygonChunkSlot.byteSizesForCounts(10, 24); // 10 verts, 8 triangles (24 indices)
    assert.deepEqual(s, { positionBytes: 80, featureIdBytes: 40, styleGpuBytes: 40, indexBytes: 96 });
    const total = s.positionBytes + s.featureIdBytes + s.styleGpuBytes + s.indexBytes;
    assert.equal(
      total,
      10 * 16 + 24 * 4,
      "16 bytes/vertex (8 position + 4 featureId + 4 styleId) plus 4 bytes/index",
    );
  });

  it("vertex-derived byte sizes scale linearly with vertexCount, independent of indexCount", () => {
    const a = GpuPolygonChunkSlot.byteSizesForCounts(100, 300);
    const b = GpuPolygonChunkSlot.byteSizesForCounts(200, 300); // same indexCount, doubled vertexCount
    assert.equal(b.positionBytes, a.positionBytes * 2);
    assert.equal(b.featureIdBytes, a.featureIdBytes * 2);
    assert.equal(b.styleGpuBytes, a.styleGpuBytes * 2);
    assert.equal(b.indexBytes, a.indexBytes, "indexBytes must not change when only vertexCount changes");
  });

  it("index byte size scales linearly with indexCount, independent of vertexCount", () => {
    const a = GpuPolygonChunkSlot.byteSizesForCounts(50, 30);
    const b = GpuPolygonChunkSlot.byteSizesForCounts(50, 60); // same vertexCount, doubled indexCount
    assert.equal(b.indexBytes, a.indexBytes * 2);
    assert.equal(b.positionBytes, a.positionBytes, "positionBytes must not change when only indexCount changes");
  });

  it("index buffer uses Uint32Array sizing (4 bytes/index), matching Stage 6.5's declared index type", () => {
    const s = GpuPolygonChunkSlot.byteSizesForCounts(0, 3); // one triangle
    assert.equal(s.indexBytes, 12);
  });
});
