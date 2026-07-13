import type { LineSegmentBatch } from "./line-segment-prep.js";
import type { GpuBufferPool } from "./gpu-buffer-pool.js";

/**
 * One line-segment batch -> dedicated GPU vertex buffers.
 *
 * Independent of `GpuPointChunkSlot` (no inheritance, no shared base class, no
 * point-specific assumptions) — owns exactly what the shader-generated segment-extrusion
 * representation needs: per-segment start/end positions, feature id, and style id. No
 * index buffer: each segment instance carries its own two endpoints directly, so there is
 * nothing for an index buffer to deduplicate (see `line-segment-prep.ts`).
 */
export class GpuLineChunkSlot {
  readonly segmentCount: number;
  readonly startPosBuffer: GPUBuffer;
  readonly endPosBuffer: GPUBuffer;
  readonly featureIdBuffer: GPUBuffer;
  readonly styleIdBuffer: GPUBuffer;

  static byteSizesForSegmentCount(segmentCount: number): {
    startPosBytes: number;
    endPosBytes: number;
    featureIdBytes: number;
    styleGpuBytes: number;
  } {
    const startPosBytes = segmentCount * 8;
    const endPosBytes = segmentCount * 8;
    const featureIdBytes = segmentCount * 4;
    /** Instance vertex step uses stride 4; uint16 + 2-byte pad per segment (matches points). */
    const styleGpuBytes = segmentCount * 4;
    return { startPosBytes, endPosBytes, featureIdBytes, styleGpuBytes };
  }

  constructor(device: GPUDevice, batch: LineSegmentBatch, pool?: GpuBufferPool) {
    const { segmentCount } = batch;
    if (segmentCount < 0) {
      throw new Error("segmentCount must be non-negative");
    }
    this.segmentCount = segmentCount;

    const { startPosBytes, endPosBytes, featureIdBytes, styleGpuBytes } =
      GpuLineChunkSlot.byteSizesForSegmentCount(segmentCount);

    if (batch.startPositions.byteLength < startPosBytes) {
      throw new Error("startPositions ArrayBuffer smaller than segmentCount * 8");
    }
    if (batch.endPositions.byteLength < endPosBytes) {
      throw new Error("endPositions ArrayBuffer smaller than segmentCount * 8");
    }
    if (batch.featureIds.byteLength < featureIdBytes) {
      throw new Error("featureIds ArrayBuffer smaller than segmentCount * 4");
    }
    if (batch.styleIds.byteLength < segmentCount * 2) {
      throw new Error("styleIds ArrayBuffer smaller than segmentCount * 2");
    }

    // Computed here (not as a module-level constant) so importing this class for its
    // pure static helper (byteSizesForSegmentCount) doesn't require a browser/WebGPU
    // global to be present — matters for plain Node unit tests.
    const vertexUsage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
    const alloc = (minBytes: number): GPUBuffer =>
      pool !== undefined
        ? pool.acquire(minBytes)
        : device.createBuffer({
            size: Math.max(minBytes, 4),
            usage: vertexUsage,
          });

    this.startPosBuffer = alloc(startPosBytes);
    this.endPosBuffer = alloc(endPosBytes);
    this.featureIdBuffer = alloc(featureIdBytes);
    this.styleIdBuffer = alloc(styleGpuBytes);

    const queue = device.queue;
    if (startPosBytes > 0) {
      queue.writeBuffer(
        this.startPosBuffer,
        0,
        batch.startPositions.buffer,
        batch.startPositions.byteOffset,
        startPosBytes,
      );
      queue.writeBuffer(
        this.endPosBuffer,
        0,
        batch.endPositions.buffer,
        batch.endPositions.byteOffset,
        endPosBytes,
      );
      queue.writeBuffer(
        this.featureIdBuffer,
        0,
        batch.featureIds.buffer,
        batch.featureIds.byteOffset,
        featureIdBytes,
      );

      const tmp = new Uint8Array(styleGpuBytes);
      for (let i = 0; i < segmentCount; i++) {
        const v = batch.styleIds[i]!;
        const o = i * 4;
        tmp[o] = v & 0xff;
        tmp[o + 1] = (v >> 8) & 0xff;
      }
      queue.writeBuffer(this.styleIdBuffer, 0, tmp.buffer, 0, styleGpuBytes);
    }
  }

  destroy(pool?: GpuBufferPool): void {
    if (pool !== undefined) {
      pool.release(this.startPosBuffer);
      pool.release(this.endPosBuffer);
      pool.release(this.featureIdBuffer);
      pool.release(this.styleIdBuffer);
    } else {
      this.startPosBuffer.destroy();
      this.endPosBuffer.destroy();
      this.featureIdBuffer.destroy();
      this.styleIdBuffer.destroy();
    }
  }
}
