import type { FeatureRecord } from "./feature-record.js";

/**
 * GPU-oriented geometry chunk: TypedArrays are the single source of truth.
 * Layout is intentionally minimal; extend with index buffers etc. in later phases.
 */
export interface GeometryBuffer {
  /** Interleaved or flat XY… in map/world units (projection decided upstream). */
  readonly positions: Float32Array;
  /** Per-vertex feature id for picking and attribute mapping. */
  readonly featureIds: Uint32Array;
  /** Per-vertex or per-primitive style id (policy defined by parser/renderer pair). */
  readonly styleIds: Uint16Array;
  /**
   * Optional triangle indices for filled polygons / lines as meshes.
   * Empty or omitted when draw mode is implicit (e.g. point sprites).
   */
  readonly indices?: Uint32Array;
}

/**
 * Describes how much of each array is valid (supports pooled / chunked buffers).
 */
export interface GeometryBufferView {
  readonly buffer: GeometryBuffer;
  readonly vertexCount: number;
  readonly indexCount?: number;
}

/** Opaque handle for zero-copy transfer between worker and main (Phase 4). */
export type TransferableBuffer =
  | ArrayBuffer
  | MessagePort
  | ImageBitmap
  | OffscreenCanvas;

export interface TransferredGeometryChunk {
  readonly view: GeometryBufferView;
  readonly records: readonly FeatureRecord[];
  /** Buffers listed here are detached on the sending side after `postMessage`. */
  readonly transferables: readonly TransferableBuffer[];
}
