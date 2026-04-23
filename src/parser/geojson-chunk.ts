import type { GeometryBufferView } from "../core/geometry-buffer.js";
import type { FeatureRecord } from "../core/feature-record.js";
import type { GeoJsonWorkerChunkMessage } from "./geojson-worker-messages.js";

/**
 * Reconstructs views on the main thread after a zero-copy `postMessage` transfer.
 * `vertexCount` may be 0 (empty chunk); arrays are still valid zero-length views.
 */
export function geometryBufferViewFromChunkMessage(msg: GeoJsonWorkerChunkMessage): {
  view: GeometryBufferView;
  records: readonly FeatureRecord[];
} {
  const { vertexCount } = msg;
  const positions = new Float32Array(msg.positions, 0, Math.max(0, vertexCount) * 2);
  const featureIds = new Uint32Array(msg.featureIds, 0, Math.max(0, vertexCount));
  const styleIds = new Uint16Array(msg.styleIds, 0, Math.max(0, vertexCount));
  return {
    view: {
      buffer: { positions, featureIds, styleIds },
      vertexCount,
    },
    records: msg.records,
  };
}
