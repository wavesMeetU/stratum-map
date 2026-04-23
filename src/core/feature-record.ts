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
}
