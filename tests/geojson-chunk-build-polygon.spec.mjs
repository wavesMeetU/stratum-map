/**
 * Stage 6.5: end-to-end polygon triangulation through `buildGeoJsonFeatureChunk` — the
 * actual function called from `src/worker/geojson-worker.ts` and
 * `src/worker/ingest-worker.ts` (FlatGeobuf/WKB shim to the same GeoJSON-shaped path).
 *
 * Run: node --test tests/geojson-chunk-build-polygon.spec.mjs (after `npm run build`)
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { buildGeoJsonFeatureChunk } = await import(join(root, "dist/parser/geojson-chunk-build.js"));
const { geometryBufferViewFromChunkMessage } = await import(join(root, "dist/parser/geojson-chunk.js"));

const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const HOLE = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
const TRIANGLE = [[20, 20], [30, 20], [25, 30], [20, 20]];

function polygonFeature(id, coordinates, properties = {}) {
  return { type: "Feature", ...(id !== undefined ? { id } : {}), properties, geometry: { type: "Polygon", coordinates } };
}
function multiPolygonFeature(id, coordinates, properties = {}) {
  return {
    type: "Feature",
    ...(id !== undefined ? { id } : {}),
    properties,
    geometry: { type: "MultiPolygon", coordinates },
  };
}
function pointFeature(id, x, y) {
  return { type: "Feature", ...(id !== undefined ? { id } : {}), properties: {}, geometry: { type: "Point", coordinates: [x, y] } };
}
function lineFeature(id, coords) {
  return { type: "Feature", ...(id !== undefined ? { id } : {}), properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

function assertPlainArrayBuffer(buf, name) {
  assert.ok(buf instanceof ArrayBuffer, `${name} must be a plain ArrayBuffer (transferable), got ${buf?.constructor?.name}`);
}

describe("buildGeoJsonFeatureChunk — polygon triangulation (Stage 6.5)", () => {
  it("chunk with no polygon features: polygon* fields present, zero-length, valid ArrayBuffers", () => {
    const chunk = buildGeoJsonFeatureChunk([pointFeature(1, 0, 0)], 0, 0, 0, 0, 1);
    assert.equal(chunk.polygonVertexCount, 0);
    assert.equal(chunk.polygonIndexCount, 0);
    for (const key of ["polygonPositions", "polygonFeatureIds", "polygonStyleIds", "polygonIndices"]) {
      assertPlainArrayBuffer(chunk[key], key);
      assert.equal(chunk[key].byteLength, 0);
    }
  });

  it("simple Polygon feature triangulates: vertex/index counts positive, indices % 3 === 0", () => {
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(1, [SQUARE])], 0, 0, 0, 0, 1);
    assert.ok(chunk.polygonVertexCount > 0);
    assert.ok(chunk.polygonIndexCount > 0);
    assert.equal(chunk.polygonIndexCount % 3, 0);
    assert.equal(chunk.polygonVertexCount, 5);
    assert.equal(chunk.polygonIndexCount, 6);
  });

  it("Polygon with a hole triangulates, excluding the hole's area", () => {
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(1, [SQUARE, HOLE])], 0, 0, 0, 0, 1);
    assert.equal(chunk.polygonVertexCount, 10);
    assert.ok(chunk.polygonIndexCount > 0);
    const indices = new Uint32Array(chunk.polygonIndices);
    // No index may reference a hole-interior phantom vertex — every index must be < vertexCount.
    for (const idx of indices) assert.ok(idx < chunk.polygonVertexCount);
  });

  it("MultiPolygon feature: parts triangulated independently, all vertices share the feature's id", () => {
    const chunk = buildGeoJsonFeatureChunk(
      [multiPolygonFeature(77, [[SQUARE], [TRIANGLE]])],
      0,
      0,
      0,
      0,
      1,
    );
    assert.equal(chunk.polygonVertexCount, 5 + 4);
    const featureIds = new Uint32Array(chunk.polygonFeatureIds);
    for (const fid of featureIds) assert.equal(fid, 77);

    const indices = new Uint32Array(chunk.polygonIndices);
    for (let t = 0; t < indices.length; t += 3) {
      const tri = [indices[t], indices[t + 1], indices[t + 2]];
      const inPart0 = tri.every((i) => i < 5);
      const inPart1 = tri.every((i) => i >= 5);
      assert.ok(inPart0 || inPart1, `triangle [${tri}] spans both MultiPolygon parts`);
    }
  });

  it("multiple polygon features in one chunk: featureIds distinguish them, no cross-feature triangle", () => {
    const chunk = buildGeoJsonFeatureChunk(
      [polygonFeature(10, [SQUARE]), polygonFeature(20, [TRIANGLE])],
      0,
      0,
      0,
      0,
      1,
    );
    assert.equal(chunk.polygonVertexCount, 5 + 4);
    const featureIds = new Uint32Array(chunk.polygonFeatureIds);
    const indices = new Uint32Array(chunk.polygonIndices);
    for (let t = 0; t < indices.length; t += 3) {
      const fids = [indices[t], indices[t + 1], indices[t + 2]].map((i) => featureIds[i]);
      assert.ok(fids.every((f) => f === fids[0]), `triangle spans two features: ${fids}`);
    }
    assert.ok(Array.from(featureIds).includes(10));
    assert.ok(Array.from(featureIds).includes(20));
  });

  it("styleId propagates to every triangulated polygon vertex", () => {
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(1, [SQUARE, HOLE])], 0, 0, 9, 0, 1);
    const styleIds = new Uint16Array(chunk.polygonStyleIds);
    for (const sid of styleIds) assert.equal(sid, 9);
  });

  it("chunk-local index bounds: every polygon index is within [0, polygonVertexCount)", () => {
    const chunk = buildGeoJsonFeatureChunk(
      [polygonFeature(1, [SQUARE, HOLE]), multiPolygonFeature(2, [[SQUARE], [TRIANGLE]])],
      0,
      0,
      0,
      0,
      1,
    );
    const indices = new Uint32Array(chunk.polygonIndices);
    for (const idx of indices) {
      assert.ok(idx >= 0 && idx < chunk.polygonVertexCount, `index ${idx} out of [0, ${chunk.polygonVertexCount})`);
    }
  });

  it("degenerate polygon (too few ring vertices) does not throw and contributes zero triangles", () => {
    const degenerate = [[0, 0], [1, 1], [0, 0]]; // 3 verts
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(1, [degenerate])], 0, 0, 0, 0, 1);
    assert.equal(chunk.polygonVertexCount, 0);
    assert.equal(chunk.polygonIndexCount, 0);
  });

  it("mixed-geometry chunk: point/line records and buffers are unchanged by polygon presence", () => {
    const withoutPolygon = buildGeoJsonFeatureChunk(
      [pointFeature(1, 0, 0), lineFeature(2, [[0, 0], [1, 1]])],
      0,
      0,
      0,
      0,
      1,
    );
    const withPolygon = buildGeoJsonFeatureChunk(
      [pointFeature(1, 0, 0), lineFeature(2, [[0, 0], [1, 1]]), polygonFeature(3, [SQUARE])],
      0,
      0,
      0,
      0,
      1,
    );

    const vA = geometryBufferViewFromChunkMessage(withoutPolygon);
    const vB = geometryBufferViewFromChunkMessage(withPolygon);

    // Point/line portion (first 2 features' worth of vertices) is byte-for-byte identical
    // whether or not a third, polygon-kind feature is also present in the same chunk.
    assert.equal(vA.view.vertexCount, 3); // 1 point + 2-vertex line
    assert.deepEqual(
      Array.from(vB.view.buffer.positions.slice(0, vA.view.vertexCount * 2)),
      Array.from(vA.view.buffer.positions),
    );
    assert.deepEqual(
      Array.from(vB.view.buffer.featureIds.slice(0, vA.view.vertexCount)),
      Array.from(vA.view.buffer.featureIds),
    );
    assert.equal(vA.records[0].vertexStart, vB.records[0].vertexStart);
    assert.equal(vA.records[1].vertexStart, vB.records[1].vertexStart);
    assert.equal(vA.records[0].vertexCount, vB.records[0].vertexCount);
    assert.equal(vA.records[1].vertexCount, vB.records[1].vertexCount);

    // The polygon feature's triangulated output exists only in the polygon* fields, not in
    // the shared point/line vertex buffer.
    assert.ok(withPolygon.polygonVertexCount > 0);
    assert.equal(withoutPolygon.polygonVertexCount, 0);
  });

  it("polygon* buffers are plain transferable ArrayBuffers, matching positions/featureIds/styleIds", () => {
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(1, [SQUARE, HOLE])], 0, 0, 0, 0, 1);
    for (const key of ["polygonPositions", "polygonFeatureIds", "polygonStyleIds", "polygonIndices"]) {
      assertPlainArrayBuffer(chunk[key], key);
    }
    assert.equal(new Float32Array(chunk.polygonPositions).length, chunk.polygonVertexCount * 2);
    assert.equal(new Uint32Array(chunk.polygonFeatureIds).length, chunk.polygonVertexCount);
    assert.equal(new Uint16Array(chunk.polygonStyleIds).length, chunk.polygonVertexCount);
    assert.equal(new Uint32Array(chunk.polygonIndices).length, chunk.polygonIndexCount);
  });

  it("FeatureRecord.id and the triangulated polygonFeatureIds buffer agree", () => {
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(555, [SQUARE])], 0, 0, 0, 0, 1);
    const { records } = geometryBufferViewFromChunkMessage(chunk);
    const polyFeatureIds = new Uint32Array(chunk.polygonFeatureIds);
    assert.equal(records[0].id, 555);
    for (const fid of polyFeatureIds) assert.equal(fid, 555);
  });

  it("GeoJSON records for GeoJSON-path polygons never set polygonRingRange (fully consumed internally)", () => {
    const chunk = buildGeoJsonFeatureChunk([polygonFeature(1, [SQUARE, HOLE])], 0, 0, 0, 0, 1);
    const { records } = geometryBufferViewFromChunkMessage(chunk);
    assert.equal(records[0].polygonRingRange, undefined);
  });
});
