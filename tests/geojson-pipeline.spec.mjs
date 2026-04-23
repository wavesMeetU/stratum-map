/**
 * GeoJSON → GPU-ready buffers (worker + chunk builder).
 * Run: npm run test:geojson-pipeline
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { buildGeoJsonFeatureChunk } = await import(
  join(root, "dist/parser/geojson-chunk-build.js")
);
const { geometryBufferViewFromChunkMessage } = await import(
  join(root, "dist/parser/geojson-chunk.js")
);

function fcPointFeatures(n) {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: n }, (_, i) => ({
      type: "Feature",
      properties: { i },
      geometry: { type: "Point", coordinates: [i * 0.01, -i * 0.02] },
    })),
  };
}

function assertNoNaNInPositions(positions) {
  for (let i = 0; i < positions.length; i++) {
    assert.equal(
      Number.isFinite(positions[i]),
      true,
      `positions[${i}] must be finite`,
    );
  }
}

function assertApproxF32(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-5, `${msg}: ${a} vs ${b}`);
}

describe("GeoJSON chunk builder (GPU-ready buffers)", () => {
  it("buildGeoJsonFeatureChunk produces ArrayBuffers + records; views are Float32/Uint32/Uint16", () => {
    const features = fcPointFeatures(3).features;
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 1, 0, 1);
    assert.equal(chunk.type, "chunk");
    assert.equal(chunk.vertexCount, 3);
    assert.ok(chunk.positions instanceof ArrayBuffer);
    assert.ok(chunk.featureIds instanceof ArrayBuffer);
    assert.ok(chunk.styleIds instanceof ArrayBuffer);

    const { view, records } = geometryBufferViewFromChunkMessage(chunk);
    assert.ok(view.buffer.positions instanceof Float32Array);
    assert.ok(view.buffer.featureIds instanceof Uint32Array);
    assert.ok(view.buffer.styleIds instanceof Uint16Array);
    assert.equal(view.vertexCount, 3);
    assert.equal(records.length, 3);

    assertNoNaNInPositions(view.buffer.positions);

    for (let i = 0; i < 3; i++) {
      assertApproxF32(view.buffer.positions[i * 2], i * 0.01, `x ${i}`);
      assertApproxF32(view.buffer.positions[i * 2 + 1], -i * 0.02, `y ${i}`);
      assert.equal(view.buffer.featureIds[i], i);
      assert.equal(view.buffer.styleIds[i], 1);
      assert.equal(records[i].vertexStart, i);
      assert.equal(records[i].vertexCount, 1);
      assert.equal(records[i].id, i);
    }
  });

  it("MultiPoint flattens to multiple vertices with shared featureId", () => {
    const features = [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiPoint",
          coordinates: [
            [0, 0],
            [1, 2],
            [3, 4],
          ],
        },
      },
    ];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 100, 0, 0, 1);
    assert.equal(chunk.vertexCount, 3);
    const { view, records } = geometryBufferViewFromChunkMessage(chunk);
    assertNoNaNInPositions(view.buffer.positions);
    assert.equal(records.length, 1);
    assert.equal(records[0].vertexCount, 3);
    assert.equal(records[0].vertexStart, 0);
    for (let v = 0; v < 3; v++) {
      assert.equal(view.buffer.featureIds[v], 100);
    }
  });

  it("overlapping id space: two chunks built with same base+start both emit feature id 0 (caller footgun)", () => {
    const f = fcPointFeatures(1).features;
    const c0 = buildGeoJsonFeatureChunk(f, 0, 0, 0, 0, 1);
    const c1 = buildGeoJsonFeatureChunk(f, 0, 0, 0, 1, 1);
    const v0 = geometryBufferViewFromChunkMessage(c0).view;
    const v1 = geometryBufferViewFromChunkMessage(c1).view;
    assert.equal(v0.buffer.featureIds[0], 0);
    assert.equal(v1.buffer.featureIds[0], 0);
  });

  it("independent chunks: vertexStart restarts at 0; buffers do not overlap", () => {
    const a = buildGeoJsonFeatureChunk(fcPointFeatures(2).features, 0, 0, 0, 0, 1);
    const b = buildGeoJsonFeatureChunk(fcPointFeatures(3).features, 2, 0, 0, 1, 1);
    assert.notEqual(a.positions, b.positions);
    const va = geometryBufferViewFromChunkMessage(a).view;
    const vb = geometryBufferViewFromChunkMessage(b).view;
    assert.equal(va.buffer.positions.buffer, a.positions);
    assert.equal(vb.buffer.positions.buffer, b.positions);
    assert.equal(va.buffer.positions[0], 0);
    assert.equal(vb.buffer.positions[0], 0);
  });
});

