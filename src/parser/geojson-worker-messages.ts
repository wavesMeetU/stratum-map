import type { FeatureRecord } from "../core/feature-record.js";

/** Main → worker */
export type GeoJsonWorkerRequest =
  | {
      readonly type: "parse";
      readonly parseId: number;
      /** Raw GeoJSON text (FeatureCollection or single Feature). */
      readonly text: string;
      /** Max features per outbound chunk (default 10_000). */
      readonly batchFeatureCount?: number;
      /** First feature id for the first feature in the payload (default 0). */
      readonly baseFeatureId?: number;
      /** Per-vertex style id when not overridden per feature (default 0). */
      readonly defaultStyleId?: number;
    }
  | {
      readonly type: "cancel";
      readonly parseId: number;
    };

/** Serializable record payload (structured clone). Mirrors FeatureRecord. */
export type GeoJsonWorkerFeatureRecord = Pick<
  FeatureRecord,
  "id" | "geometryKind" | "vertexStart" | "vertexCount" | "properties"
>;

/** Worker → main: one geometry batch with strict TypedArray backing. */
export interface GeoJsonWorkerChunkMessage {
  readonly type: "chunk";
  readonly parseId: number;
  /** Monotonic chunk index for this parse (0-based). */
  readonly chunkIndex: number;
  readonly vertexCount: number;
  readonly positions: ArrayBuffer;
  readonly featureIds: ArrayBuffer;
  readonly styleIds: ArrayBuffer;
  readonly records: readonly GeoJsonWorkerFeatureRecord[];
  /** Optional tile / viewport key for cache-oriented hosts (FlatGeobuf bbox loads). */
  readonly tileKey?: string;
  /**
   * Triangulated polygon geometry for this chunk (Stage 6.5), already worker-side
   * triangulated via `earcut` — see `PreparedPolygonGeometry`
   * (`src/gpu/polygon-triangulation.ts`). Always present, zero-length/zero-count when the
   * chunk has no polygon-kind features — never `undefined`, matching how `positions` etc.
   * are already zero-length rather than optional for an empty chunk. `polygonPositions`
   * and `polygonIndices` use their own tightly-packed, chunk-local vertex numbering — do
   * NOT index them with values derived from `vertexCount`/`positions`.
   */
  readonly polygonVertexCount: number;
  readonly polygonIndexCount: number;
  readonly polygonPositions: ArrayBuffer;
  readonly polygonFeatureIds: ArrayBuffer;
  readonly polygonStyleIds: ArrayBuffer;
  readonly polygonIndices: ArrayBuffer;
}

export interface GeoJsonWorkerDoneMessage {
  readonly type: "done";
  readonly parseId: number;
  readonly totalFeatures: number;
  readonly totalChunks: number;
}

export interface GeoJsonWorkerErrorMessage {
  readonly type: "error";
  readonly parseId: number;
  readonly message: string;
}

export type GeoJsonWorkerEvent =
  | GeoJsonWorkerChunkMessage
  | GeoJsonWorkerDoneMessage
  | GeoJsonWorkerErrorMessage;
