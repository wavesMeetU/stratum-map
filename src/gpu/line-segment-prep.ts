import type { GeometryBuffer } from "../core/geometry-buffer.js";
import type { FeatureRecord } from "../core/feature-record.js";

/**
 * GPU-ready line segments derived from an existing (unmodified) GeometryBuffer.
 *
 * One entry per segment (`vertexCount - 1` segments per `line`-kind feature); segment `i`
 * of a feature connects that feature's vertex `i` to vertex `i + 1`. `styleId` follows the
 * segment's start vertex, matching how points already resolve style per vertex index.
 */
export interface LineSegmentBatch {
  readonly segmentCount: number;
  /** 2 floats (x, y) per segment — the segment's start vertex, in world/prepared coordinates. */
  readonly startPositions: Float32Array;
  /** 2 floats (x, y) per segment — the segment's end vertex. */
  readonly endPositions: Float32Array;
  /** 1 uint32 per segment — the FeatureId of the line this segment belongs to. */
  readonly featureIds: Uint32Array;
  /** 1 uint16 per segment. */
  readonly styleIds: Uint16Array;
}

const EMPTY_BATCH: LineSegmentBatch = {
  segmentCount: 0,
  startPositions: new Float32Array(0),
  endPositions: new Float32Array(0),
  featureIds: new Uint32Array(0),
  styleIds: new Uint16Array(0),
};

/**
 * Derives line segments from `buffer` for every `records` entry whose `geometryKind` is
 * exactly `"line"` (a plain LineString).
 *
 * Explicitly excludes, rather than accidentally including:
 * - any other `geometryKind` (`"point"`, `"multiPoint"`, `"multiLine"`, `"polygon"`,
 *   `"multiPolygon"`, `"geometryCollection"`) — these are silently skipped, not an error,
 *   so a chunk carrying a mix of geometry kinds can be routed through multiple
 *   geometry-specific preparers, each picking out only what it understands.
 * - `"multiLine"` in particular is skipped deliberately, not merely by omission: a
 *   MultiLineString's constituent lines are flattened contiguously with no retained
 *   boundary between them (`geojson-flatten.ts`), so naively pairing its consecutive
 *   vertices would draw a spurious connecting segment between two logically separate
 *   lines. Supporting it requires a small, not-yet-added part-boundary extension
 *   (Stage 6.1 finding) and is out of scope here.
 * - features with fewer than 2 vertices (zero segments — nothing to connect).
 *
 * Never connects two different features: segments are generated strictly within one
 * feature's own `[vertexStart, vertexStart + vertexCount)` range.
 */
export function buildLineSegments(
  buffer: GeometryBuffer,
  records: readonly FeatureRecord[],
): LineSegmentBatch {
  let segmentTotal = 0;
  for (const r of records) {
    if (r.geometryKind !== "line") continue;
    if (r.vertexCount < 2) continue;
    segmentTotal += r.vertexCount - 1;
  }
  if (segmentTotal === 0) {
    return EMPTY_BATCH;
  }

  const startPositions = new Float32Array(segmentTotal * 2);
  const endPositions = new Float32Array(segmentTotal * 2);
  const featureIds = new Uint32Array(segmentTotal);
  const styleIds = new Uint16Array(segmentTotal);

  let o = 0;
  for (const r of records) {
    if (r.geometryKind !== "line") continue;
    if (r.vertexCount < 2) continue;

    const start = r.vertexStart;
    const segmentsInFeature = r.vertexCount - 1;
    for (let i = 0; i < segmentsInFeature; i++) {
      const v0 = start + i;
      const v1 = start + i + 1;

      startPositions[o * 2] = buffer.positions[v0 * 2]!;
      startPositions[o * 2 + 1] = buffer.positions[v0 * 2 + 1]!;
      endPositions[o * 2] = buffer.positions[v1 * 2]!;
      endPositions[o * 2 + 1] = buffer.positions[v1 * 2 + 1]!;
      featureIds[o] = r.id;
      styleIds[o] = buffer.styleIds[v0]!;
      o += 1;
    }
  }

  return { segmentCount: segmentTotal, startPositions, endPositions, featureIds, styleIds };
}
