/**
 * buildLineSegments — pure LineString segment preparation (Stage 6.2).
 *
 * Run: node --test tests/line-segment-prep.spec.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { buildLineSegments } = await import(join(root, "dist/gpu/line-segment-prep.js"));

/** Builds a GeometryBuffer + records for one or more "line" features laid out contiguously. */
function bufferFor(features) {
  let totalVerts = 0;
  for (const f of features) totalVerts += f.coords.length;

  const positions = new Float32Array(totalVerts * 2);
  const featureIds = new Uint32Array(totalVerts);
  const styleIds = new Uint16Array(totalVerts);
  const records = [];

  let v = 0;
  for (const f of features) {
    const vertexStart = v;
    for (const [x, y] of f.coords) {
      positions[v * 2] = x;
      positions[v * 2 + 1] = y;
      featureIds[v] = f.id;
      styleIds[v] = f.styleId ?? 0;
      v += 1;
    }
    records.push({
      id: f.id,
      geometryKind: f.geometryKind ?? "line",
      vertexStart,
      vertexCount: f.coords.length,
      properties: {},
    });
  }

  return { buffer: { positions, featureIds, styleIds }, records };
}

describe("buildLineSegments", () => {
  it("a 2-vertex LineString produces exactly 1 segment", () => {
    const { buffer, records } = bufferFor([{ id: 1, coords: [[0, 0], [10, 0]] }]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 1);
    assert.deepEqual(Array.from(batch.startPositions), [0, 0]);
    assert.deepEqual(Array.from(batch.endPositions), [10, 0]);
    assert.deepEqual(Array.from(batch.featureIds), [1]);
  });

  it("a 5-vertex LineString produces exactly 4 segments, all sharing the feature's id", () => {
    const { buffer, records } = bufferFor([
      { id: 7, coords: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    ]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 4);
    assert.deepEqual(Array.from(batch.featureIds), [7, 7, 7, 7]);
    // v0->v1, v1->v2, v2->v3, v3->v4
    assert.deepEqual(Array.from(batch.startPositions), [0, 0, 1, 0, 2, 0, 3, 0]);
    assert.deepEqual(Array.from(batch.endPositions), [1, 0, 2, 0, 3, 0, 4, 0]);
  });

  it("features with fewer than 2 vertices produce zero segments", () => {
    const { buffer, records } = bufferFor([
      { id: 1, coords: [[0, 0]] }, // 1 vertex
      { id: 2, coords: [] }, // 0 vertices
    ]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 0);
  });

  it("never connects across feature boundaries", () => {
    const { buffer, records } = bufferFor([
      { id: 1, coords: [[0, 0], [1, 0]] },
      { id: 2, coords: [[100, 100], [101, 100]] },
    ]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 2);
    // No segment should span feature 1's last vertex (1,0) to feature 2's first vertex (100,100).
    for (let i = 0; i < batch.segmentCount; i++) {
      const sx = batch.startPositions[i * 2];
      const ex = batch.endPositions[i * 2];
      assert.ok(
        (sx < 50 && ex < 50) || (sx >= 50 && ex >= 50),
        `segment ${i} must not span both features: start=${sx} end=${ex}`,
      );
    }
    assert.deepEqual(Array.from(batch.featureIds), [1, 2]);
  });

  it("explicitly skips non-line geometry kinds, including multiLine", () => {
    const kinds = ["point", "multiPoint", "multiLine", "polygon", "multiPolygon", "geometryCollection"];
    const { buffer, records } = bufferFor(
      kinds.map((k, i) => ({ id: i, coords: [[0, 0], [1, 1], [2, 2]], geometryKind: k })),
    );
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 0, "no non-line geometry kind should ever produce a segment");
  });

  it("processes only the line-kind records in a mixed slice", () => {
    const { buffer, records } = bufferFor([
      { id: 1, coords: [[0, 0], [1, 0], [2, 0]], geometryKind: "point" },
      { id: 2, coords: [[10, 10], [11, 10]], geometryKind: "line" },
      { id: 3, coords: [[20, 20], [21, 20], [22, 20]], geometryKind: "polygon" },
    ]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 1);
    assert.deepEqual(Array.from(batch.featureIds), [2]);
  });

  it("propagates featureId across every segment of a feature", () => {
    const { buffer, records } = bufferFor([{ id: 42, coords: [[0, 0], [1, 1], [2, 2], [3, 3]] }]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 3);
    assert.deepEqual(Array.from(batch.featureIds), [42, 42, 42]);
  });

  it("propagates styleId per segment, following the segment's start vertex", () => {
    // A feature whose per-vertex styleIds vary is unusual in practice, but the function
    // must still correctly resolve each segment's style from its own start vertex.
    const positions = new Float32Array([0, 0, 1, 0, 2, 0]);
    const featureIds = new Uint32Array([5, 5, 5]);
    const styleIds = new Uint16Array([9, 3, 1]);
    const records = [{ id: 5, geometryKind: "line", vertexStart: 0, vertexCount: 3, properties: {} }];
    const batch = buildLineSegments({ positions, featureIds, styleIds }, records);
    assert.equal(batch.segmentCount, 2);
    assert.deepEqual(Array.from(batch.styleIds), [9, 3]); // segment 0 follows vertex 0 (style 9), segment 1 follows vertex 1 (style 3)
  });

  it("carries FeatureId boundary values through unchanged (0 and the Stage 5.1.1 GPU-safe max)", () => {
    const { buffer, records } = bufferFor([
      { id: 0, coords: [[0, 0], [1, 0]] },
      { id: 0xfffffffe, coords: [[2, 2], [3, 3]] },
    ]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 2);
    assert.equal(batch.featureIds[0], 0);
    assert.equal(batch.featureIds[1], 0xfffffffe);
  });

  it("returns an empty batch for an empty records array", () => {
    const batch = buildLineSegments({ positions: new Float32Array(0), featureIds: new Uint32Array(0), styleIds: new Uint16Array(0) }, []);
    assert.equal(batch.segmentCount, 0);
    assert.equal(batch.startPositions.length, 0);
    assert.equal(batch.endPositions.length, 0);
    assert.equal(batch.featureIds.length, 0);
    assert.equal(batch.styleIds.length, 0);
  });

  it("handles multiple LineString features together, each independently segmented", () => {
    const { buffer, records } = bufferFor([
      { id: 1, coords: [[0, 0], [1, 0], [2, 0]] }, // 2 segments
      { id: 2, coords: [[10, 10], [11, 10]] }, // 1 segment
      { id: 3, coords: [[20, 20], [21, 20], [22, 20], [23, 20]] }, // 3 segments
    ]);
    const batch = buildLineSegments(buffer, records);
    assert.equal(batch.segmentCount, 6);
    assert.deepEqual(Array.from(batch.featureIds), [1, 1, 2, 3, 3, 3]);
  });
});
