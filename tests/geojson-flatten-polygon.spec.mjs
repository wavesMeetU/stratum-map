/**
 * Stage 6.5: polygon ring/part topology preservation in `writeFlattenedGeometry`.
 *
 * Before Stage 6.5, `writeFlattenedGeometry` had no way to report ring boundaries at all —
 * it returned only a total vertex count. Every assertion here on `polygonTopology`'s
 * *contents* (not just vertex totals) is a test that could not have passed against the
 * pre-Stage-6.5 implementation, because the accumulator parameter — and therefore any
 * ring-length/part-boundary information — did not exist.
 *
 * Run: node --test tests/geojson-flatten-polygon.spec.mjs (after `npm run build`)
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { writeFlattenedGeometry, countVertices, createPolygonRingAccumulator } = await import(
  join(root, "dist/parser/geojson-flatten.js")
);

function allocBuffers(vertexCount) {
  return {
    positions: new Float32Array(vertexCount * 2),
    featureIds: new Uint32Array(vertexCount),
    styleIds: new Uint16Array(vertexCount),
  };
}

const SQUARE = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
]; // 5 vertices (closed)

const SMALL_HOLE = [
  [2, 2],
  [4, 2],
  [4, 4],
  [2, 4],
  [2, 2],
]; // 5 vertices (closed)

const TRIANGLE = [
  [20, 20],
  [30, 20],
  [25, 30],
  [20, 20],
]; // 4 vertices (closed)

describe("writeFlattenedGeometry — polygon ring/part topology (Stage 6.5)", () => {
  it("simple Polygon (no holes): one part, one ring, ring length matches the ring's vertex count", () => {
    const geom = { type: "Polygon", coordinates: [SQUARE] };
    const n = countVertices(geom);
    const { positions, featureIds, styleIds } = allocBuffers(n);
    const topology = createPolygonRingAccumulator();

    const written = writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);

    assert.equal(written, 5);
    assert.deepEqual(topology.partRingCounts, [1]);
    assert.deepEqual(topology.ringVertexCounts, [5]);
  });

  it("Polygon with one hole: exterior ring length and hole ring length both preserved, in order", () => {
    const geom = { type: "Polygon", coordinates: [SQUARE, SMALL_HOLE] };
    const n = countVertices(geom);
    const { positions, featureIds, styleIds } = allocBuffers(n);
    const topology = createPolygonRingAccumulator();

    const written = writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);

    assert.equal(written, 10);
    // One part, two rings: ring 0 = exterior (5 verts), ring 1 = hole (5 verts).
    assert.deepEqual(topology.partRingCounts, [2]);
    assert.deepEqual(topology.ringVertexCounts, [5, 5]);
  });

  it("Polygon with multiple holes: every ring length preserved in exterior-then-holes order", () => {
    const hole2 = [
      [6, 6],
      [7, 6],
      [7, 7],
      [6, 7],
      [6, 6],
    ];
    const geom = { type: "Polygon", coordinates: [SQUARE, SMALL_HOLE, hole2] };
    const n = countVertices(geom);
    const { positions, featureIds, styleIds } = allocBuffers(n);
    const topology = createPolygonRingAccumulator();

    writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);

    assert.deepEqual(topology.partRingCounts, [3]);
    assert.deepEqual(topology.ringVertexCounts, [5, 5, 5]);
  });

  it("MultiPolygon: part boundaries are distinguishable, not merged into one ring set", () => {
    const geom = {
      type: "MultiPolygon",
      coordinates: [
        [SQUARE, SMALL_HOLE], // part 0: exterior + 1 hole
        [TRIANGLE], // part 1: exterior only
      ],
    };
    const n = countVertices(geom);
    const { positions, featureIds, styleIds } = allocBuffers(n);
    const topology = createPolygonRingAccumulator();

    const written = writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);

    assert.equal(written, 5 + 5 + 4);
    // Two parts: part 0 has 2 rings, part 1 has 1 ring — never collapsed into a single part.
    assert.deepEqual(topology.partRingCounts, [2, 1]);
    assert.deepEqual(topology.ringVertexCounts, [5, 5, 4]);
  });

  it("MultiPolygon topology survives multiple features sharing one accumulator (chunk-wide)", () => {
    const geomA = { type: "MultiPolygon", coordinates: [[SQUARE], [TRIANGLE]] };
    const geomB = { type: "Polygon", coordinates: [SQUARE, SMALL_HOLE] };
    const topology = createPolygonRingAccumulator();
    const nA = countVertices(geomA);
    const nB = countVertices(geomB);
    const bufs = allocBuffers(nA + nB);

    const wA = writeFlattenedGeometry(geomA, bufs.positions, bufs.featureIds, bufs.styleIds, 1, 0, 0, topology);
    const wB = writeFlattenedGeometry(
      geomB,
      bufs.positions,
      bufs.featureIds,
      bufs.styleIds,
      2,
      0,
      wA,
      topology,
    );

    assert.equal(wA, 5 + 4);
    assert.equal(wB, 10);
    // Feature A contributes parts [0,1] (2 parts), feature B contributes part [2] (1 part).
    assert.deepEqual(topology.partRingCounts, [1, 1, 2]);
    assert.deepEqual(topology.ringVertexCounts, [5, 4, 5, 5]);
  });

  it("Polygon nested inside a GeometryCollection still records ring topology", () => {
    const geom = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [0, 0] },
        { type: "Polygon", coordinates: [SQUARE, SMALL_HOLE] },
      ],
    };
    const n = countVertices(geom);
    const { positions, featureIds, styleIds } = allocBuffers(n);
    const topology = createPolygonRingAccumulator();

    const written = writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);

    assert.equal(written, 1 + 10);
    assert.deepEqual(topology.partRingCounts, [2]);
    assert.deepEqual(topology.ringVertexCounts, [5, 5]);
  });

  it("empty Polygon (coordinates: []) contributes zero parts, not one degenerate part", () => {
    const geom = { type: "Polygon", coordinates: [] };
    const { positions, featureIds, styleIds } = allocBuffers(0);
    const topology = createPolygonRingAccumulator();

    const written = writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);

    assert.equal(written, 0);
    assert.deepEqual(topology.partRingCounts, []);
    assert.deepEqual(topology.ringVertexCounts, []);
  });

  it("point/line geometry never touches the topology accumulator (negligible cost)", () => {
    const geoms = [
      { type: "Point", coordinates: [1, 2] },
      { type: "MultiPoint", coordinates: [[1, 2], [3, 4]] },
      { type: "LineString", coordinates: [[1, 2], [3, 4], [5, 6]] },
      { type: "MultiLineString", coordinates: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]] },
    ];
    for (const geom of geoms) {
      const n = countVertices(geom);
      const { positions, featureIds, styleIds } = allocBuffers(n);
      const topology = createPolygonRingAccumulator();
      writeFlattenedGeometry(geom, positions, featureIds, styleIds, 1, 0, 0, topology);
      assert.deepEqual(topology.partRingCounts, [], `${geom.type} must not add parts`);
      assert.deepEqual(topology.ringVertexCounts, [], `${geom.type} must not add rings`);
    }
  });

  it("vertex output is byte-for-byte identical whether or not the topology accumulator is passed", () => {
    const geom = {
      type: "MultiPolygon",
      coordinates: [[SQUARE, SMALL_HOLE], [TRIANGLE]],
    };
    const n = countVertices(geom);

    const withTopo = allocBuffers(n);
    writeFlattenedGeometry(
      geom,
      withTopo.positions,
      withTopo.featureIds,
      withTopo.styleIds,
      7,
      3,
      0,
      createPolygonRingAccumulator(),
    );

    const withoutTopo = allocBuffers(n);
    writeFlattenedGeometry(geom, withoutTopo.positions, withoutTopo.featureIds, withoutTopo.styleIds, 7, 3, 0);

    assert.deepEqual(Array.from(withTopo.positions), Array.from(withoutTopo.positions));
    assert.deepEqual(Array.from(withTopo.featureIds), Array.from(withoutTopo.featureIds));
    assert.deepEqual(Array.from(withTopo.styleIds), Array.from(withoutTopo.styleIds));
  });

  it("Polygon/MultiPolygon vertex output is unchanged from the pre-Stage-6.5 concatenation order", () => {
    // Rings are still concatenated exterior-then-holes, in source order, with the closing
    // duplicate retained — exactly the pre-Stage-6.5 contract (writeFlattenedGeometry's own
    // doc). Only new *metadata* was added; no existing vertex-writing behavior changed.
    const geom = { type: "Polygon", coordinates: [SQUARE, SMALL_HOLE] };
    const n = countVertices(geom);
    const { positions, featureIds, styleIds } = allocBuffers(n);
    writeFlattenedGeometry(geom, positions, featureIds, styleIds, 9, 4, 0, createPolygonRingAccumulator());

    const expected = [...SQUARE, ...SMALL_HOLE].flat();
    assert.deepEqual(Array.from(positions), expected);
    for (let i = 0; i < n; i++) {
      assert.equal(featureIds[i], 9);
      assert.equal(styleIds[i], 4);
    }
  });
});
