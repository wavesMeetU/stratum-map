import type { FeatureId } from "../types/ids.js";
import type { GeometryKind } from "../types/geometry.js";

/**
 * User-facing metadata for one feature. No OpenLayers `Feature` type —
 * only JSON-serializable fields and ids that tie into TypedArray buffers.
 */
export interface FeatureRecord {
  readonly id: FeatureId;
  /** Which logical geometry this record describes (buffers hold the rest). */
  readonly geometryKind: GeometryKind;
  /**
   * Half-open vertex range in the shared position buffer for this feature.
   * Semantics depend on `geometryKind` (e.g. one vertex per point).
   */
  readonly vertexStart: number;
  readonly vertexCount: number;
  /** Arbitrary properties (GeoJSON-style); keep small for worker transfer. */
  readonly properties: Readonly<Record<string, unknown>>;
  /**
   * Polygon ring/part topology (Stage 6.5), preserved instead of discarded during
   * flattening. Present only for `"polygon"`/`"multiPolygon"` features (or one nested
   * inside a `"geometryCollection"`) produced by a pipeline that preserves — but does not
   * necessarily triangulate — ring boundaries. Currently populated only by the GeoArrow
   * adapter (`flattenGeoArrowGeometryData`); the GeoJSON/FlatGeobuf/WKB worker pipeline
   * fully consumes this internally and triangulates before returning; its records never
   * set this field (there is nothing left to reference once triangulation has run — see
   * the triangulated output's own `featureIds` array instead).
   *
   * `ringStart`/`ringCount` index a chunk-scoped `ringVertexCounts` array (one entry per
   * ring, in the order rings were written into the position buffer; ring 0 of each part is
   * the exterior ring, the rest are holes). `partStart`/`partCount` index a chunk-scoped
   * `partRingCounts` array (one entry per polygon part — always 1 for a `Polygon`, one per
   * constituent polygon for a `MultiPolygon` — giving how many of the following
   * `ringVertexCounts` entries belong to that part). Both arrays are returned alongside
   * this record by the producing function (e.g. `FlattenGeoArrowChunkResult.polygonTopology`)
   * — never stored on `GeometryBuffer` itself.
   */
  readonly polygonRingRange?: {
    readonly ringStart: number;
    readonly ringCount: number;
    readonly partStart: number;
    readonly partCount: number;
  };
}
