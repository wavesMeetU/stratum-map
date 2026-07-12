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

describe("Stable feature identity (Stage 5.1)", () => {
  function pointFeature(id, x, y) {
    return {
      type: "Feature",
      ...(id !== undefined ? { id } : {}),
      properties: {},
      geometry: { type: "Point", coordinates: [x, y] },
    };
  }

  it("repeated ingestion of the same source feature resolves to the same FeatureId", () => {
    const f = pointFeature(42, 1, 2);
    // Two independent calls, as if the same feature arrived via two separate loads
    // (different parseId/chunkIndex), with the default baseFeatureId/globalStartIndex.
    const c0 = buildGeoJsonFeatureChunk([f], 0, 0, 0, 0, 1);
    const c1 = buildGeoJsonFeatureChunk([f], 0, 0, 0, 5, 2);
    const v0 = geometryBufferViewFromChunkMessage(c0);
    const v1 = geometryBufferViewFromChunkMessage(c1);

    assert.equal(v0.view.buffer.featureIds[0], 42);
    assert.equal(v1.view.buffer.featureIds[0], 42);
    assert.equal(v0.records[0].id, 42);
    assert.equal(v1.records[0].id, 42);
  });

  it("overlapping chunks containing the same source feature agree on its FeatureId", () => {
    const shared = pointFeature(7, 5, 5);
    const chunkA = buildGeoJsonFeatureChunk(
      [pointFeature(1, 0, 0), shared],
      0, 0, 0, 0, 1,
    );
    const chunkB = buildGeoJsonFeatureChunk(
      [shared, pointFeature(3, 9, 9)],
      0, 0, 0, 1, 1,
    );
    const va = geometryBufferViewFromChunkMessage(chunkA).view;
    const vb = geometryBufferViewFromChunkMessage(chunkB).view;

    // shared feature (id=7) is at index 1 in chunkA, index 0 in chunkB.
    assert.equal(va.buffer.featureIds[1], 7);
    assert.equal(vb.buffer.featureIds[0], 7);
  });

  it("features without an id fall back to the positional scheme unchanged", () => {
    const features = fcPointFeatures(3).features; // no .id set
    const chunk = buildGeoJsonFeatureChunk(features, 10, 100, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    for (let i = 0; i < 3; i++) {
      assert.equal(view.buffer.featureIds[i], 100 + 10 + i);
    }
  });

  it("string source ids fall back to positional ids (never coerced)", () => {
    const features = [pointFeature("abc", 0, 0), pointFeature("def", 1, 1)];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    assert.equal(view.buffer.featureIds[0], 0);
    assert.equal(view.buffer.featureIds[1], 1);
  });

  it("uint32-safe numeric source ids are used verbatim, without baseFeatureId offset", () => {
    const features = [pointFeature(123456, 0, 0)];
    const chunk = buildGeoJsonFeatureChunk(features, 50, 1000, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    // NOT 1000 + 50 + 0 — the source id is used directly.
    assert.equal(view.buffer.featureIds[0], 123456);
  });

  it("out-of-range numeric ids (negative, non-integer, above GPU-safe max) fall back to positional", () => {
    const features = [
      pointFeature(-5, 0, 0),
      pointFeature(3.5, 1, 1),
      // 0xFFFFFFFF is one above MAX_SAFE_GPU_FEATURE_ID (Stage 5.1.1): its `+1` sentinel
      // encoding would wrap to 0 in the shader's u32 arithmetic, colliding with the
      // reserved background/miss value, so it is never a usable FeatureId.
      pointFeature(0xffffffff, 2, 2),
    ];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    assert.equal(view.buffer.featureIds[0], 0);
    assert.equal(view.buffer.featureIds[1], 1);
    assert.equal(view.buffer.featureIds[2], 2);
  });

  it("a numeric id at exactly the GPU-safe max (0xFFFFFFFE) is accepted", () => {
    const features = [pointFeature(0xfffffffe, 0, 0)];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    assert.equal(view.buffer.featureIds[0], 0xfffffffe);
  });

  it("a numeric id one below the GPU-safe max (0x7FFFFFFF, previously the artificial ceiling) is accepted", () => {
    // Before the Stage 5.1.1 unsigned-decode fix, this value would have been rejected by
    // the old (incorrect) MAX_SAFE_GPU_FEATURE_ID = 0x7FFFFFFE ceiling.
    const features = [pointFeature(0x7fffffff, 0, 0)];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    assert.equal(view.buffer.featureIds[0], 0x7fffffff);
  });

  it("duplicate source ids within one chunk both fall back to positional (no collision)", () => {
    const features = [pointFeature(9, 0, 0), pointFeature(9, 1, 1)];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    // Neither uses 9 (ambiguous which one legitimately owns it); both get distinct
    // positional fallback ids instead.
    assert.notEqual(view.buffer.featureIds[0], view.buffer.featureIds[1]);
    assert.equal(view.buffer.featureIds[0], 0);
    assert.equal(view.buffer.featureIds[1], 1);
  });

  it("a fallback id never collides with a reserved source id in the same chunk", () => {
    // Feature at index 0 has no id (would positionally want id 0), but feature at
    // index 1 legitimately reserves id 0 via its source id — index 0 must be bumped.
    const features = [pointFeature(undefined, 0, 0), pointFeature(0, 1, 1)];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const view = geometryBufferViewFromChunkMessage(chunk).view;
    assert.equal(view.buffer.featureIds[1], 0); // reserved source id honored
    assert.notEqual(view.buffer.featureIds[0], 0); // fallback avoided the collision
    assert.notEqual(view.buffer.featureIds[0], view.buffer.featureIds[1]);
  });

  it("FeatureRecord.id and the GPU featureIds buffer always agree (picking/FeatureStore compatibility)", () => {
    const features = [pointFeature(500, 0, 0), pointFeature(undefined, 1, 1), pointFeature("x", 2, 2)];
    const chunk = buildGeoJsonFeatureChunk(features, 0, 0, 0, 0, 1);
    const { view, records } = geometryBufferViewFromChunkMessage(chunk);
    for (let i = 0; i < features.length; i++) {
      assert.equal(records[i].id, view.buffer.featureIds[i]);
    }
  });
});

