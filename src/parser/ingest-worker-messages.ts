import type { GeoJsonWorkerEvent } from "./geojson-worker-messages.js";

/** Axis-aligned rect in dataset/map CRS (same as FlatGeobuf `Rect`). */
export interface BBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Main → ingest worker (WKB + FlatGeobuf bbox / “tile” loads). */
export type IngestWorkerRequest =
  | {
      readonly type: "parse-flatgeobuf-bbox";
      readonly parseId: number;
      readonly url: string;
      readonly bbox: BBox;
      /** Correlates chunks with a map tile or viewport (host-defined string). */
      readonly tileKey?: string;
      readonly batchFeatureCount?: number;
      readonly baseFeatureId?: number;
      readonly defaultStyleId?: number;
      /** Extra fetch headers (auth, etc.). */
      readonly headers?: Record<string, string>;
      /** Stop after this many features (safety cap per tile). */
      readonly maxFeatures?: number;
    }
  | {
      readonly type: "parse-wkb";
      readonly parseId: number;
      /** One WKB geometry (optionally EWKB). Transferred; detached on sender side. */
      readonly buffer: ArrayBuffer;
      readonly batchFeatureCount?: number;
      readonly baseFeatureId?: number;
      readonly defaultStyleId?: number;
    }
  | {
      readonly type: "cancel";
      readonly parseId: number;
    };

/** Same wire format as GeoJSON worker (chunks + done + error). */
export type IngestWorkerEvent = GeoJsonWorkerEvent;
