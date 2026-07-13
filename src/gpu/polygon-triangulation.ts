import earcut from "earcut";

/**
 * Triangulated polygon geometry, tightly packed and chunk-local — mirrors
 * `LineSegmentBatch`'s "own positions, not indices into the mixed-geometry chunk buffer"
 * convention (`line-segment-prep.ts`), not `GeometryBuffer.indices` (whose ownership
 * semantics were never defined and which is unused everywhere in this codebase — Stage 6.4
 * audit finding).
 */
export interface PreparedPolygonGeometry {
  readonly vertexCount: number;
  readonly indexCount: number;
  /** 2 floats (x, y) per vertex — prepared world coordinates, unprojected. */
  readonly positions: Float32Array;
  /** 1 uint32 per vertex — the FeatureId of the polygon this vertex belongs to. */
  readonly featureIds: Uint32Array;
  /** 1 uint16 per vertex. */
  readonly styleIds: Uint16Array;
  /**
   * 3 uint32 per triangle, triangle-list order. Chunk-local: indices reference this
   * structure's own `positions`/`featureIds`/`styleIds` arrays, not the original mixed
   * chunk's position buffer.
   */
  readonly indices: Uint32Array;
}

/**
 * A fresh, empty `PreparedPolygonGeometry` — deliberately a factory, not a shared module-level
 * constant. `ArrayBuffer`s that are ever placed in a `postMessage` transfer list become
 * detached after the first transfer; a shared empty instance reused across multiple
 * zero-polygon chunks in the same parse would silently break the second chunk's transfer
 * (`DataCloneError: cannot transfer a detached ArrayBuffer`) the moment a caller transfers
 * its buffers unconditionally. A fresh instance per call has nothing to share, so there is
 * no such invariant to violate.
 */
export function emptyPreparedPolygonGeometry(): PreparedPolygonGeometry {
  return {
    vertexCount: 0,
    indexCount: 0,
    positions: new Float32Array(0),
    featureIds: new Uint32Array(0),
    styleIds: new Uint16Array(0),
    indices: new Uint32Array(0),
  };
}

/**
 * Minimum vertices for a ring to be usable: 3 distinct vertices plus the mandatory GeoJSON
 * closing duplicate (first coordinate repeated as the last). Rings are fed to `earcut`
 * exactly as written — including that closing duplicate — since `earcut` tolerates a
 * closed ring natively (the duplicate collapses into one degenerate, correctly-discarded
 * ear); this repository's flattening has never removed it (`writeFlattenedGeometry`'s own
 * doc), so triangulation input stays consistent with every other vertex array it emits.
 */
const MIN_RING_VERTICES = 4;

/** One polygon-kind feature's location within the chunk's shared position buffer and its ring topology. */
export interface PolygonFeatureInput {
  /** Absolute vertex index (into the chunk's full `positions`) where this feature's rings begin. */
  readonly vertexStart: number;
  /** Index into `ringVertexCounts` where this feature's rings begin. */
  readonly ringStart: number;
  readonly ringCount: number;
  /** Index into `partRingCounts` where this feature's polygon parts begin. */
  readonly partStart: number;
  /** 1 for a `Polygon`, one per constituent polygon for a `MultiPolygon`. */
  readonly partCount: number;
}

/**
 * Triangulates every polygon part described by `polygonFeatures` against the chunk's full
 * flat position/feature-id/style-id buffers (spanning all features — point/line/polygon
 * alike), producing one tightly-packed, chunk-local `PreparedPolygonGeometry` containing
 * only polygon vertices and triangles.
 *
 * One `earcut` call per polygon part — never per feature, never across parts — so a
 * `MultiPolygon`'s constituent polygons triangulate fully independently: no triangle can
 * ever connect two parts or two features. FeatureId/styleId are read per original vertex
 * (not assumed constant per feature) directly from `featureIds`/`styleIds`, mirroring how
 * `buildLineSegments` reads `buffer.styleIds[v0]` rather than taking a scalar parameter.
 *
 * Degenerate input policy (Stage 6.5 §9): a part whose exterior ring has fewer than
 * `MIN_RING_VERTICES` is skipped entirely (no vertices, no indices — cannot form any valid
 * polygon without a valid exterior). A degenerate hole ring is dropped individually,
 * without invalidating the rest of the part. A structurally valid part that `earcut`
 * numerically triangulates to zero triangles (e.g. collinear points) still has its vertices
 * written (for feature-id/style-id completeness) but contributes zero indices — never a
 * thrown error, matching this codebase's existing "silently skip, don't fail the chunk"
 * convention (`buildLineSegments` does the same for non-`"line"` geometry kinds).
 *
 * Runs entirely off the browser main thread: called only from worker-side chunk building
 * (`geojson-chunk-build.ts`, itself invoked only from `src/worker/*.ts`).
 */
export function triangulatePolygonFeatures(
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  partRingCounts: readonly number[] | Uint32Array,
  ringVertexCounts: readonly number[] | Uint32Array,
  polygonFeatures: readonly PolygonFeatureInput[],
): PreparedPolygonGeometry {
  if (polygonFeatures.length === 0) {
    return emptyPreparedPolygonGeometry();
  }

  const outPositions: number[] = [];
  const outFeatureIds: number[] = [];
  const outStyleIds: number[] = [];
  const outIndices: number[] = [];

  for (const feature of polygonFeatures) {
    let ringCursor = feature.ringStart;
    let vertexCursor = feature.vertexStart;

    for (let p = 0; p < feature.partCount; p++) {
      const ringsInPart = partRingCounts[feature.partStart + p]!;

      // Gather each ring's absolute [start, len) vertex range before touching earcut, so a
      // degenerate exterior can skip the whole part before any coordinates are copied.
      const ringRanges: { start: number; len: number }[] = [];
      for (let r = 0; r < ringsInPart; r++) {
        const len = ringVertexCounts[ringCursor + r]!;
        ringRanges.push({ start: vertexCursor, len });
        vertexCursor += len;
      }
      ringCursor += ringsInPart;

      const exterior = ringRanges[0];
      if (exterior === undefined || exterior.len < MIN_RING_VERTICES) {
        continue; // degenerate/missing exterior: no valid polygon, skip the whole part
      }
      const holes = ringRanges.slice(1).filter((r) => r.len >= MIN_RING_VERTICES);

      // Single pass per ring: builds earcut's flat coordinate input and this part's slice
      // of the output positions/featureIds/styleIds simultaneously, in the same vertex
      // order, so earcut's local indices map 1:1 onto `outPositions` once offset by
      // `outVertexBase` — no second derivation, nothing that could disagree with it.
      const flat: number[] = [];
      const holeIndices: number[] = [];
      const outVertexBase = outPositions.length / 2;
      const appendRing = (range: { start: number; len: number }): void => {
        for (let i = 0; i < range.len; i++) {
          const abs = range.start + i;
          const x = positions[abs * 2]!;
          const y = positions[abs * 2 + 1]!;
          flat.push(x, y);
          outPositions.push(x, y);
          outFeatureIds.push(featureIds[abs]!);
          outStyleIds.push(styleIds[abs]!);
        }
      };
      appendRing(exterior);
      for (const hole of holes) {
        holeIndices.push(flat.length / 2);
        appendRing(hole);
      }

      const localTriangles = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);
      for (const idx of localTriangles) {
        outIndices.push(outVertexBase + idx);
      }
    }
  }

  return {
    vertexCount: outPositions.length / 2,
    indexCount: outIndices.length,
    positions: Float32Array.from(outPositions),
    featureIds: Uint32Array.from(outFeatureIds),
    styleIds: Uint16Array.from(outStyleIds),
    indices: Uint32Array.from(outIndices),
  };
}
