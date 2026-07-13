/**
 * Stage 6.5: polygon ring/part topology preservation in the independent GeoArrow flattening
 * path (`flattenGeoArrowGeometryData` / `writePolygonRow` / `writeMultiPolygonRow`). Shares
 * no code with `geojson-flatten.ts` — this is the "do not assume the GeoJSON implementation
 * automatically fixes GeoArrow" verification the Stage 6.5 spec calls for.
 *
 * Unlike the GeoJSON/FlatGeobuf/WKB worker path, GeoArrow flattening has no worker call
 * site in this codebase (no `geoarrow-worker.ts`), so it does not triangulate — it only
 * preserves ring/part topology, exposed on `FlattenGeoArrowChunkResult.polygonTopology` and
 * per-record via `FeatureRecord.polygonRingRange`.
 *
 * Run: node --test tests/geoarrow-polygon-topology.spec.mjs (after `npm run build`)
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { makeData, Float32, FixedSizeList, List, Field } from "apache-arrow";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { flattenGeoArrowGeometryData } = await import(join(root, "dist/geoarrow/geoarrow-chunk.js"));

// ── minimal GeoArrow Polygon/MultiPolygon column builders (no fixture library exists in
// this repo yet — constructed directly against apache-arrow's low-level Data API) ──

function coordData(flatXY) {
  return makeData({
    type: new FixedSizeList(2, new Field("xy", new Float32(), false)),
    length: flatXY.length / 2,
    child: makeData({ type: new Float32(), data: Float32Array.from(flatXY) }),
  });
}

/** rows: array of { rings: number[][] } (each ring a flat XY array) — one Polygon per row. */
function buildPolygonData(rows) {
  const allCoords = [];
  const ringOffsets = [0];
  const polyOffsets = [0];
  for (const row of rows) {
    for (const ring of row.rings) {
      allCoords.push(...ring);
      ringOffsets.push(allCoords.length / 2);
    }
    polyOffsets.push(ringOffsets.length - 1);
  }
  const coords = coordData(allCoords);
  const ringsList = makeData({
    type: new List(new Field("vertices", coords.type, false)),
    length: ringOffsets.length - 1,
    child: coords,
    valueOffsets: Int32Array.from(ringOffsets),
  });
  return makeData({
    type: new List(new Field("rings", ringsList.type, false)),
    length: polyOffsets.length - 1,
    child: ringsList,
    valueOffsets: Int32Array.from(polyOffsets),
  });
}

/** rows: array of { parts: { rings: number[][] }[] } — one MultiPolygon per row. */
function buildMultiPolygonData(rows) {
  const allCoords = [];
  const ringOffsets = [0];
  const polyOffsets = [0];
  const multiOffsets = [0];
  for (const row of rows) {
    for (const part of row.parts) {
      for (const ring of part.rings) {
        allCoords.push(...ring);
        ringOffsets.push(allCoords.length / 2);
      }
      polyOffsets.push(ringOffsets.length - 1);
    }
    multiOffsets.push(polyOffsets.length - 1);
  }
  const coords = coordData(allCoords);
  const ringsList = makeData({
    type: new List(new Field("vertices", coords.type, false)),
    length: ringOffsets.length - 1,
    child: coords,
    valueOffsets: Int32Array.from(ringOffsets),
  });
  const polysList = makeData({
    type: new List(new Field("rings", ringsList.type, false)),
    length: polyOffsets.length - 1,
    child: ringsList,
    valueOffsets: Int32Array.from(polyOffsets),
  });
  return makeData({
    type: new List(new Field("polygons", polysList.type, false)),
    length: multiOffsets.length - 1,
    child: polysList,
    valueOffsets: Int32Array.from(multiOffsets),
  });
}

const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0]; // 5 verts
const HOLE = [2, 2, 4, 2, 4, 4, 2, 4, 2, 2]; // 5 verts
const TRIANGLE = [20, 20, 30, 20, 25, 30, 20, 20]; // 4 verts

describe("GeoArrow flattening — polygon ring/part topology (Stage 6.5)", () => {
  it("simple Polygon (no holes): one part, one ring recorded", () => {
    const data = buildPolygonData([{ rings: [SQUARE] }]);
    const result = flattenGeoArrowGeometryData(data, { baseFeatureId: 0, defaultStyleId: 0, globalFeatureIndexStart: 0 });

    assert.equal(result.view.vertexCount, 5);
    assert.deepEqual(Array.from(result.polygonTopology.partRingCounts), [1]);
    assert.deepEqual(Array.from(result.polygonTopology.ringVertexCounts), [5]);
    assert.deepEqual(result.records[0].polygonRingRange, { ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 });
  });

  it("Polygon with one hole: exterior + hole ring lengths both recorded, in order", () => {
    const data = buildPolygonData([{ rings: [SQUARE, HOLE] }]);
    const result = flattenGeoArrowGeometryData(data, { baseFeatureId: 0, defaultStyleId: 0, globalFeatureIndexStart: 0 });

    assert.equal(result.view.vertexCount, 10);
    // One part (the polygon itself), which has 2 rings (exterior + hole).
    assert.deepEqual(Array.from(result.polygonTopology.partRingCounts), [2]);
    assert.deepEqual(Array.from(result.polygonTopology.ringVertexCounts), [5, 5]);
    assert.deepEqual(result.records[0].polygonRingRange, { ringStart: 0, ringCount: 2, partStart: 0, partCount: 1 });
  });

  it("MultiPolygon: part boundaries preserved, not merged", () => {
    const data = buildMultiPolygonData([
      { parts: [{ rings: [SQUARE, HOLE] }, { rings: [TRIANGLE] }] },
    ]);
    const result = flattenGeoArrowGeometryData(data, { baseFeatureId: 0, defaultStyleId: 0, globalFeatureIndexStart: 0 });

    assert.equal(result.view.vertexCount, 5 + 5 + 4);
    assert.deepEqual(Array.from(result.polygonTopology.partRingCounts), [2, 1]);
    assert.deepEqual(Array.from(result.polygonTopology.ringVertexCounts), [5, 5, 4]);
    assert.deepEqual(result.records[0].polygonRingRange, { ringStart: 0, ringCount: 3, partStart: 0, partCount: 2 });
  });

  it("multiple polygon features in one chunk: each record's ring/part range is correct and non-overlapping", () => {
    const data = buildPolygonData([{ rings: [SQUARE, HOLE] }, { rings: [TRIANGLE] }]);
    const result = flattenGeoArrowGeometryData(data, { baseFeatureId: 0, defaultStyleId: 0, globalFeatureIndexStart: 0 });

    assert.equal(result.records.length, 2);
    assert.deepEqual(result.records[0].polygonRingRange, { ringStart: 0, ringCount: 2, partStart: 0, partCount: 1 });
    assert.deepEqual(result.records[1].polygonRingRange, { ringStart: 2, ringCount: 1, partStart: 1, partCount: 1 });
    assert.deepEqual(Array.from(result.polygonTopology.partRingCounts), [2, 1]);
    assert.deepEqual(Array.from(result.polygonTopology.ringVertexCounts), [5, 5, 4]);

    // Vertex ranges also don't overlap: feature 0 owns [0,10), feature 1 owns [10,14).
    assert.equal(result.records[0].vertexStart, 0);
    assert.equal(result.records[0].vertexCount, 10);
    assert.equal(result.records[1].vertexStart, 10);
    assert.equal(result.records[1].vertexCount, 4);
  });

  it("FeatureId propagates correctly across triangulation-independent polygon vertices", () => {
    const data = buildPolygonData([{ rings: [SQUARE] }, { rings: [TRIANGLE] }]);
    const result = flattenGeoArrowGeometryData(data, { baseFeatureId: 1000, defaultStyleId: 0, globalFeatureIndexStart: 0 });
    for (let i = 0; i < 5; i++) assert.equal(result.view.buffer.featureIds[i], 1000);
    for (let i = 5; i < 9; i++) assert.equal(result.view.buffer.featureIds[i], 1001);
  });
});
