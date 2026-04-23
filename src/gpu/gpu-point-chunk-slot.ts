import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import type { GpuBufferPool } from "./gpu-buffer-pool.js";

const VERTEX_USAGE = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;

/**
 * One worker chunk → dedicated GPU vertex buffers.
 * Upload uses the transferred `ArrayBuffer`s directly (no TypedArray reshape on main).
 * Optional `GpuBufferPool` reuses allocations via power-of-two bucket sizes.
 */
export class GpuPointChunkSlot {
  readonly vertexCount: number;
  readonly positionBuffer: GPUBuffer;
  readonly styleIdBuffer: GPUBuffer;
  readonly featureIdBuffer: GPUBuffer;

  static byteSizesForVertexCount(vertexCount: number): {
    positionBytes: number;
    styleGpuBytes: number;
    featureIdBytes: number;
  } {
    const positionBytes = vertexCount * 8;
    /** Instance vertex step uses stride 4; uint16 + 2-byte pad per point. */
    const styleGpuBytes = vertexCount * 4;
    const featureIdBytes = vertexCount * 4;
    return { positionBytes, styleGpuBytes, featureIdBytes };
  }

  constructor(device: GPUDevice, msg: GeoJsonWorkerChunkMessage, pool?: GpuBufferPool) {
    const { vertexCount } = msg;
    if (vertexCount < 0) {
      throw new Error("vertexCount must be non-negative");
    }
    this.vertexCount = vertexCount;

    const { positionBytes, styleGpuBytes, featureIdBytes } =
      GpuPointChunkSlot.byteSizesForVertexCount(vertexCount);

    if (msg.positions.byteLength < positionBytes) {
      throw new Error("positions ArrayBuffer smaller than vertexCount * 8");
    }
    if (msg.styleIds.byteLength < vertexCount * 2) {
      throw new Error("styleIds ArrayBuffer smaller than vertexCount * 2");
    }
    if (msg.featureIds.byteLength < featureIdBytes) {
      throw new Error("featureIds ArrayBuffer smaller than vertexCount * 4");
    }

    const alloc = (minBytes: number): GPUBuffer =>
      pool !== undefined
        ? pool.acquire(minBytes)
        : device.createBuffer({
            size: Math.max(minBytes, 4),
            usage: VERTEX_USAGE,
          });

    this.positionBuffer = alloc(positionBytes);
    this.styleIdBuffer = alloc(styleGpuBytes);
    this.featureIdBuffer = alloc(featureIdBytes);

    const queue = device.queue;
    if (positionBytes > 0) {
      queue.writeBuffer(this.positionBuffer, 0, msg.positions, 0, positionBytes);
    }
    if (styleGpuBytes > 0) {
      const tmp = new Uint8Array(styleGpuBytes);
      tmp.set(new Uint8Array(msg.styleIds, 0, vertexCount * 2), 0);
      queue.writeBuffer(this.styleIdBuffer, 0, tmp.buffer, 0, styleGpuBytes);
    }
    if (featureIdBytes > 0) {
      queue.writeBuffer(this.featureIdBuffer, 0, msg.featureIds, 0, featureIdBytes);
    }
  }

  /**
   * Partial upload: overwrites interleaved XY for `xy.length / 2` vertices starting at `firstVertex`.
   */
  writePositionRange(queue: GPUQueue, firstVertex: number, xy: Float32Array): void {
    if (xy.length % 2 !== 0) {
      throw new Error("xy length must be a multiple of 2");
    }
    const verts = xy.length / 2;
    const byteOffset = firstVertex * 8;
    const byteLength = verts * 8;
    if (byteOffset + byteLength > this.positionBuffer.size) {
      throw new Error("writePositionRange exceeds chunk position buffer");
    }
    if (firstVertex + verts > this.vertexCount) {
      throw new Error("writePositionRange exceeds chunk vertexCount");
    }
    queue.writeBuffer(this.positionBuffer, byteOffset, xy.buffer, xy.byteOffset, byteLength);
  }

  /**
   * Partial upload: contiguous `featureIds` slice mapped to vertices `[firstVertex, firstVertex + length)`.
   */
  writeFeatureIdRange(queue: GPUQueue, firstVertex: number, featureIds: Uint32Array): void {
    const n = featureIds.length;
    const byteOffset = firstVertex * 4;
    const byteLength = n * 4;
    if (byteOffset + byteLength > this.featureIdBuffer.size) {
      throw new Error("writeFeatureIdRange exceeds chunk featureId buffer");
    }
    if (firstVertex + n > this.vertexCount) {
      throw new Error("writeFeatureIdRange exceeds chunk vertexCount");
    }
    queue.writeBuffer(this.featureIdBuffer, byteOffset, featureIds.buffer, featureIds.byteOffset, byteLength);
  }

  /**
   * Partial upload of per-point style ids (one u16 per instance slot, stride 4 bytes on GPU).
   */
  writeStyleIdRange(queue: GPUQueue, firstVertex: number, styleIds: Uint16Array): void {
    const n = styleIds.length;
    const byteOffset = firstVertex * 4;
    const byteLength = n * 4;
    if (byteOffset + byteLength > this.styleIdBuffer.size) {
      throw new Error("writeStyleIdRange exceeds chunk styleId buffer");
    }
    if (firstVertex + n > this.vertexCount) {
      throw new Error("writeStyleIdRange exceeds chunk vertexCount");
    }
    const tmp = new Uint8Array(byteLength);
    const src = new Uint16Array(styleIds.buffer, styleIds.byteOffset, n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const v = src[i]!;
      tmp[o] = v & 0xff;
      tmp[o + 1] = (v >> 8) & 0xff;
    }
    queue.writeBuffer(this.styleIdBuffer, byteOffset, tmp.buffer, 0, byteLength);
  }

  destroy(pool?: GpuBufferPool): void {
    if (pool !== undefined) {
      pool.release(this.positionBuffer);
      pool.release(this.styleIdBuffer);
      pool.release(this.featureIdBuffer);
    } else {
      this.positionBuffer.destroy();
      this.styleIdBuffer.destroy();
      this.featureIdBuffer.destroy();
    }
  }
}
