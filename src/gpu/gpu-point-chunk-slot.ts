import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import { alignTo4Bytes } from "./byte-align.js";
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
    styleWriteBytes: number;
    featureIdBytes: number;
  } {
    const positionBytes = vertexCount * 8;
    const styleBytesRaw = vertexCount * 2;
    const styleWriteBytes = alignTo4Bytes(styleBytesRaw);
    const featureIdBytes = vertexCount * 4;
    return { positionBytes, styleWriteBytes, featureIdBytes };
  }

  constructor(device: GPUDevice, msg: GeoJsonWorkerChunkMessage, pool?: GpuBufferPool) {
    const { vertexCount } = msg;
    if (vertexCount < 0) {
      throw new Error("vertexCount must be non-negative");
    }
    this.vertexCount = vertexCount;

    const { positionBytes, styleWriteBytes, featureIdBytes } =
      GpuPointChunkSlot.byteSizesForVertexCount(vertexCount);

    if (msg.positions.byteLength < positionBytes) {
      throw new Error("positions ArrayBuffer smaller than vertexCount * 8");
    }
    if (msg.styleIds.byteLength < styleWriteBytes) {
      throw new Error("styleIds ArrayBuffer smaller than padded style upload");
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
    this.styleIdBuffer = alloc(styleWriteBytes);
    this.featureIdBuffer = alloc(featureIdBytes);

    const queue = device.queue;
    if (positionBytes > 0) {
      queue.writeBuffer(this.positionBuffer, 0, msg.positions, 0, positionBytes);
    }
    if (styleWriteBytes > 0) {
      queue.writeBuffer(this.styleIdBuffer, 0, msg.styleIds, 0, styleWriteBytes);
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
   * Partial upload of per-vertex style ids. `queue.writeBuffer` size must be 4-byte aligned;
   * a small scratch pad is used only when `vertexCount * 2` is odd.
   */
  writeStyleIdRange(queue: GPUQueue, firstVertex: number, styleIds: Uint16Array): void {
    const n = styleIds.length;
    const rawBytes = n * 2;
    const byteOffset = firstVertex * 2;
    const paddedBytes = alignTo4Bytes(rawBytes);
    if (byteOffset + paddedBytes > this.styleIdBuffer.size) {
      throw new Error("writeStyleIdRange exceeds chunk styleId buffer");
    }
    if (firstVertex + n > this.vertexCount) {
      throw new Error("writeStyleIdRange exceeds chunk vertexCount");
    }
    if (paddedBytes === rawBytes) {
      queue.writeBuffer(this.styleIdBuffer, byteOffset, styleIds.buffer, styleIds.byteOffset, paddedBytes);
      return;
    }
    const tmp = new Uint8Array(paddedBytes);
    tmp.set(new Uint8Array(styleIds.buffer, styleIds.byteOffset, rawBytes));
    queue.writeBuffer(this.styleIdBuffer, byteOffset, tmp.buffer, 0, paddedBytes);
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
