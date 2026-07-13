import type { GeometryKind } from "../types/geometry.js";
import type { GeoJsonGeometry, Position } from "./geojson-types.js";

function xy(p: Position): { x: number; y: number } {
  return { x: p[0], y: p[1] };
}

/**
 * Chunk-scoped polygon ring/part topology (Stage 6.5), accumulated across every feature in
 * a chunk instead of being discarded during flattening. Two flat, growable arrays — never
 * one object per ring:
 *
 * - `ringVertexCounts`: one entry per ring written so far, in write order (matching the
 *   order rings land in `positions`). Ring 0 of each part is the exterior ring, the rest
 *   are holes (GeoJSON/WKB/FlatGeobuf convention, preserved by writing rings in source
 *   order — never reordered).
 * - `partRingCounts`: one entry per polygon part written so far (in write order). Value =
 *   how many of the next `ringVertexCounts` entries belong to that part. A `Polygon`
 *   contributes exactly one part; a `MultiPolygon` contributes one part per constituent
 *   polygon.
 *
 * A feature with no polygon geometry (or an empty `Polygon`/`MultiPolygon`, e.g.
 * `coordinates: []`) contributes zero entries to either array — negligible cost for the
 * point/line path, which never passes this accumulator at all.
 */
export interface PolygonRingAccumulator {
  readonly partRingCounts: number[];
  readonly ringVertexCounts: number[];
}

export function createPolygonRingAccumulator(): PolygonRingAccumulator {
  return { partRingCounts: [], ringVertexCounts: [] };
}

/** Appends one polygon part's ring lengths (`ringLens`, exterior first) to `topology`. */
function pushPolygonPart(topology: PolygonRingAccumulator, ringLens: readonly number[]): void {
  if (ringLens.length === 0) return; // empty part (e.g. a Polygon with coordinates: []) — nothing to record
  for (const len of ringLens) topology.ringVertexCounts.push(len);
  topology.partRingCounts.push(ringLens.length);
}

export function geometryKindFor(geom: GeoJsonGeometry): GeometryKind {
  switch (geom.type) {
    case "Point":
      return "point";
    case "MultiPoint":
      return "multiPoint";
    case "LineString":
      return "line";
    case "MultiLineString":
      return "multiLine";
    case "Polygon":
      return "polygon";
    case "MultiPolygon":
      return "multiPolygon";
    case "GeometryCollection":
      return "geometryCollection";
    default: {
      throw new Error(`Unsupported geometry type: ${String((geom as { type?: string }).type)}`);
    }
  }
}

export function countVertices(geom: GeoJsonGeometry | null): number {
  if (geom === null) return 0;
  switch (geom.type) {
    case "Point":
      return 1;
    case "MultiPoint":
      return geom.coordinates.length;
    case "LineString":
      return geom.coordinates.length;
    case "MultiLineString": {
      let n = 0;
      for (const line of geom.coordinates) n += line.length;
      return n;
    }
    case "Polygon": {
      let n = 0;
      for (const ring of geom.coordinates) n += ring.length;
      return n;
    }
    case "MultiPolygon": {
      let n = 0;
      for (const poly of geom.coordinates) {
        for (const ring of poly) n += ring.length;
      }
      return n;
    }
    case "GeometryCollection": {
      let n = 0;
      for (const g of geom.geometries) n += countVertices(g);
      return n;
    }
    default: {
      throw new Error(`Unsupported geometry type: ${String((geom as { type?: string }).type)}`);
    }
  }
}

/**
 * Writes flattened XY vertices for one geometry. Returns the number of vertices written.
 * Polygon / MultiPolygon: rings are concatenated in GeoJSON order (no duplicate closing point
 * removed) — byte-for-byte identical to before Stage 6.5 regardless of `polygonTopology`.
 *
 * `polygonTopology`, when passed, additionally records each ring's/part's boundary (Stage
 * 6.5) instead of letting it disappear into the flat vertex run — see
 * `PolygonRingAccumulator`. Omitting it reproduces the pre-Stage-6.5 behavior exactly (no
 * topology recorded, same vertex output) — used by callers that only need points/lines.
 */
export function writeFlattenedGeometry(
  geom: GeoJsonGeometry | null,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
  polygonTopology?: PolygonRingAccumulator,
): number {
  if (geom === null) return 0;

  let o = vertexOffset;

  const writePos = (p: Position) => {
    const { x, y } = xy(p);
    positions[o * 2] = x;
    positions[o * 2 + 1] = y;
    featureIds[o] = featureId;
    styleIds[o] = styleId;
    o += 1;
  };

  const writeRing = (ring: Position[]): number => {
    const before = o;
    for (const p of ring) writePos(p);
    return o - before;
  };

  switch (geom.type) {
    case "Point":
      writePos(geom.coordinates);
      break;
    case "MultiPoint":
      for (const p of geom.coordinates) writePos(p);
      break;
    case "LineString":
      writeRing(geom.coordinates);
      break;
    case "MultiLineString":
      for (const line of geom.coordinates) writeRing(line);
      break;
    case "Polygon": {
      const ringLens = geom.coordinates.map(writeRing);
      if (polygonTopology) pushPolygonPart(polygonTopology, ringLens);
      break;
    }
    case "MultiPolygon":
      for (const poly of geom.coordinates) {
        const ringLens = poly.map(writeRing);
        if (polygonTopology) pushPolygonPart(polygonTopology, ringLens);
      }
      break;
    case "GeometryCollection": {
      let at = o;
      for (const g of geom.geometries) {
        const n = writeFlattenedGeometry(
          g,
          positions,
          featureIds,
          styleIds,
          featureId,
          styleId,
          at,
          polygonTopology,
        );
        at += n;
      }
      o = at;
      break;
    }
    default: {
      throw new Error(`Unsupported geometry type: ${String((geom as { type?: string }).type)}`);
    }
  }

  return o - vertexOffset;
}
