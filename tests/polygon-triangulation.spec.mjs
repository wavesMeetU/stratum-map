/**
 * Stage 6.5: worker-side polygon triangulation (`triangulatePolygonFeatures`).
 *
 * `triangulatePolygonFeatures` is new in Stage 6.5 — before it existed, there was no way
 * to produce indexed triangle geometry for any polygon at all, so every assertion here on
 * triangle *content* (counts, index bounds, feature/style propagation) is necessarily a
 * test that could not have passed against the pre-Stage-6.5 codebase.
 *
 * Run: node --test tests/polygon-triangulation.spec.mjs (after `npm run build`)
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { deviation } from "earcut";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { triangulatePolygonFeatures } = await import(join(root, "dist/gpu/polygon-triangulation.js"));

const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0]; // flat XY, 5 verts (closed)
const SMALL_HOLE = [2, 2, 4, 2, 4, 4, 2, 4, 2, 2]; // flat XY, 5 verts (closed)
const TRIANGLE = [20, 20, 30, 20, 25, 30, 20, 20]; // flat XY, 4 verts (closed)
// Concave "arrow" shape (7 verts + closing dup) — a plain earcut ear-clip would fail on a
// naive fan triangulation but earcut's algorithm handles concave rings correctly.
const CONCAVE = [0, 0, 10, 0, 10, 10, 5, 5, 0, 10, 0, 0];

/** Builds a chunk-wide flat positions/featureIds/styleIds buffer from a list of rings (each a flat-XY array), tagging every vertex with the given featureId/styleId. */
function chunkFromRings(ringsFlat, featureId, styleId) {
  const positions = [];
  for (const ring of ringsFlat) positions.push(...ring);
  const vertexCount = positions.length / 2;
  return {
    positions: Float32Array.from(positions),
    featureIds: Uint32Array.from({ length: vertexCount }, () => featureId),
    styleIds: Uint16Array.from({ length: vertexCount }, () => styleId),
  };
}

function ringVertexCounts(ringsFlat) {
  return ringsFlat.map((r) => r.length / 2);
}

function assertTrianglesReferenceOnlyRange(indices, lo, hi, msg) {
  for (const idx of indices) {
    assert.ok(idx >= lo && idx < hi, `${msg}: index ${idx} out of range [${lo}, ${hi})`);
  }
}

describe("triangulatePolygonFeatures — basic shapes", () => {
  it("simple square (no holes): 2 triangles, valid index bounds", () => {
    const { positions, featureIds, styleIds } = chunkFromRings([SQUARE], 5, 2);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [1],
      ringVertexCounts([SQUARE]),
      [{ vertexStart: 0, ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 }],
    );

    assert.equal(result.vertexCount, 5);
    assert.equal(result.indexCount, 6); // 2 triangles
    assert.equal(result.indexCount % 3, 0);
    for (const idx of result.indices) {
      assert.ok(idx < result.vertexCount);
      assert.equal(result.featureIds[idx], 5);
      assert.equal(result.styleIds[idx], 2);
    }
    const dev = deviation(
      Array.from(result.positions),
      null,
      2,
      Array.from(result.indices),
    );
    assert.ok(Math.abs(dev) < 1e-9, `triangulation deviation too high: ${dev}`);
  });

  it("concave polygon: earcut still produces a correct-area triangulation", () => {
    const { positions, featureIds, styleIds } = chunkFromRings([CONCAVE], 1, 0);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [1],
      ringVertexCounts([CONCAVE]),
      [{ vertexStart: 0, ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 }],
    );

    assert.ok(result.indexCount > 0);
    const dev = deviation(Array.from(result.positions), null, 2, Array.from(result.indices));
    assert.ok(Math.abs(dev) < 1e-9, `concave triangulation deviation too high: ${dev}`);
  });

  it("polygon with one hole: triangulated area excludes the hole", () => {
    const { positions, featureIds, styleIds } = chunkFromRings([SQUARE, SMALL_HOLE], 3, 1);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [2],
      ringVertexCounts([SQUARE, SMALL_HOLE]),
      [{ vertexStart: 0, ringStart: 0, ringCount: 2, partStart: 0, partCount: 1 }],
    );

    assert.equal(result.vertexCount, 10);
    assert.ok(result.indexCount > 0);
    // The exterior ring is 5 vertices (0..4), so the hole starts at local vertex index 5 —
    // matches earcut's own `holeIndices` convention (vertex index, not coordinate index).
    const dev = deviation(Array.from(result.positions), [5], 2, Array.from(result.indices));
    assert.ok(Math.abs(dev) < 1e-9, `hole triangulation deviation too high: ${dev}`);
  });

  it("polygon with multiple holes: all holes excluded from triangulated area", () => {
    const hole2 = [6, 6, 7, 6, 7, 7, 6, 7, 6, 6];
    const rings = [SQUARE, SMALL_HOLE, hole2];
    const { positions, featureIds, styleIds } = chunkFromRings(rings, 8, 0);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [3],
      ringVertexCounts(rings),
      [{ vertexStart: 0, ringStart: 0, ringCount: 3, partStart: 0, partCount: 1 }],
    );

    assert.equal(result.vertexCount, 15);
    const dev = deviation(Array.from(result.positions), [5, 10], 2, Array.from(result.indices));
    assert.ok(Math.abs(dev) < 1e-9, `multi-hole triangulation deviation too high: ${dev}`);
  });
});

describe("triangulatePolygonFeatures — MultiPolygon and multi-feature independence", () => {
  it("MultiPolygon parts triangulate independently: no triangle spans both parts", () => {
    const rings = [SQUARE, SMALL_HOLE, TRIANGLE]; // part 0: square+hole (2 rings), part 1: triangle (1 ring)
    const { positions, featureIds, styleIds } = chunkFromRings(rings, 42, 6);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [2, 1], // part 0 has 2 rings, part 1 has 1 ring
      ringVertexCounts(rings),
      [{ vertexStart: 0, ringStart: 0, ringCount: 3, partStart: 0, partCount: 2 }],
    );

    // Part 0 (square + hole) occupies output vertices [0, 10); part 1 (triangle) [10, 14).
    assert.equal(result.vertexCount, 14);
    for (let t = 0; t < result.indexCount; t += 3) {
      const a = result.indices[t];
      const b = result.indices[t + 1];
      const c = result.indices[t + 2];
      const inPart0 = [a, b, c].every((i) => i < 10);
      const inPart1 = [a, b, c].every((i) => i >= 10);
      assert.ok(inPart0 || inPart1, `triangle [${a},${b},${c}] spans both MultiPolygon parts`);
    }
    // Every vertex still carries the one shared FeatureId/styleId (one feature, two parts).
    for (let i = 0; i < result.vertexCount; i++) {
      assert.equal(result.featureIds[i], 42);
      assert.equal(result.styleIds[i], 6);
    }
  });

  it("multiple polygon features in one call: no triangle spans two features", () => {
    const featA = { rings: [SQUARE], featureId: 100, styleId: 1 };
    const featB = { rings: [TRIANGLE], featureId: 200, styleId: 2 };
    const allRings = [...featA.rings, ...featB.rings];

    const positions = Float32Array.from(allRings.flat());
    const featureIds = new Uint32Array(positions.length / 2);
    const styleIds = new Uint16Array(positions.length / 2);
    let cursor = 0;
    for (const feat of [featA, featB]) {
      for (const ring of feat.rings) {
        const n = ring.length / 2;
        featureIds.fill(feat.featureId, cursor, cursor + n);
        styleIds.fill(feat.styleId, cursor, cursor + n);
        cursor += n;
      }
    }

    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [1, 1],
      ringVertexCounts(allRings),
      [
        { vertexStart: 0, ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 },
        { vertexStart: 5, ringStart: 1, ringCount: 1, partStart: 1, partCount: 1 },
      ],
    );

    assert.equal(result.vertexCount, 9); // 5 (square) + 4 (triangle)
    for (let t = 0; t < result.indexCount; t += 3) {
      const tri = [result.indices[t], result.indices[t + 1], result.indices[t + 2]];
      const fids = tri.map((i) => result.featureIds[i]);
      assert.ok(
        fids.every((f) => f === fids[0]),
        `triangle spans two features: featureIds ${fids}`,
      );
    }
    // FeatureId/styleId propagation, per vertex.
    for (let i = 0; i < 5; i++) {
      assert.equal(result.featureIds[i], 100);
      assert.equal(result.styleIds[i], 1);
    }
    for (let i = 5; i < 9; i++) {
      assert.equal(result.featureIds[i], 200);
      assert.equal(result.styleIds[i], 2);
    }
  });
});

describe("triangulatePolygonFeatures — degenerate and invalid input", () => {
  it("no polygon features: returns a valid empty result, does not throw", () => {
    const result = triangulatePolygonFeatures(
      new Float32Array(0),
      new Uint32Array(0),
      new Uint16Array(0),
      [],
      [],
      [],
    );
    assert.equal(result.vertexCount, 0);
    assert.equal(result.indexCount, 0);
    assert.ok(result.positions instanceof Float32Array);
    assert.ok(result.indices instanceof Uint32Array);
  });

  it("exterior ring with too few vertices: whole part skipped, no vertices or indices written", () => {
    const degenerate = [0, 0, 1, 1, 0, 0]; // 3 verts — below MIN_RING_VERTICES (4)
    const { positions, featureIds, styleIds } = chunkFromRings([degenerate], 1, 0);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [1],
      ringVertexCounts([degenerate]),
      [{ vertexStart: 0, ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 }],
    );
    assert.equal(result.vertexCount, 0);
    assert.equal(result.indexCount, 0);
  });

  it("degenerate hole ring is dropped individually; exterior still triangulates", () => {
    const degenerateHole = [3, 3, 3.1, 3.1, 3, 3]; // 3 verts — below MIN_RING_VERTICES
    const rings = [SQUARE, degenerateHole];
    const { positions, featureIds, styleIds } = chunkFromRings(rings, 1, 0);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [2],
      ringVertexCounts(rings),
      [{ vertexStart: 0, ringStart: 0, ringCount: 2, partStart: 0, partCount: 1 }],
    );
    // Only the exterior (5 verts) is written; the degenerate hole ring is dropped entirely,
    // not merely un-triangulated — its vertices never reach the output.
    assert.equal(result.vertexCount, 5);
    assert.ok(result.indexCount > 0);
  });

  it("repeated closing coordinate (standard GeoJSON ring) triangulates correctly, no extra/degenerate triangle", () => {
    const { positions, featureIds, styleIds } = chunkFromRings([SQUARE], 1, 0);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [1],
      ringVertexCounts([SQUARE]),
      [{ vertexStart: 0, ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 }],
    );
    // A 4-distinct-vertex square (5 verts incl. closing dup) triangulates to exactly 2
    // triangles — earcut collapses the duplicate into a degenerate, discarded ear rather
    // than emitting a spurious third triangle.
    assert.equal(result.indexCount / 3, 2);
  });

  it("numerically degenerate but structurally valid ring (collinear points): vertices written, zero triangles", () => {
    const collinear = [0, 0, 1, 0, 2, 0, 3, 0, 0, 0]; // all on one line — zero area
    const { positions, featureIds, styleIds } = chunkFromRings([collinear], 9, 0);
    const result = triangulatePolygonFeatures(
      positions,
      featureIds,
      styleIds,
      [1],
      ringVertexCounts([collinear]),
      [{ vertexStart: 0, ringStart: 0, ringCount: 1, partStart: 0, partCount: 1 }],
    );
    assert.equal(result.vertexCount, 5); // vertices preserved for feature-id/style-id completeness
    assert.equal(result.indexCount, 0); // but no triangle can be formed
  });
});
