import type { PreparedPolygonGeometry } from "./polygon-triangulation.js";
import type { GpuBufferPool } from "./gpu-buffer-pool.js";

/**
 * One `PreparedPolygonGeometry` (Stage 6.5) -> dedicated GPU vertex + index buffers.
 *
 * Independent of `GpuPointChunkSlot`/`GpuLineChunkSlot` (no inheritance, no shared base
 * class, no point/line-specific assumptions) — owns exactly what indexed triangle-list
 * rendering needs: per-vertex position/feature-id/style-id, plus a triangle index buffer
 * (`GPUBufferUsage.INDEX`), the one buffer kind points/lines never needed.
 *
 * Pooling covers only the three vertex-shaped buffers (position/featureId/styleId) via the
 * same `GpuBufferPool` points/lines already use — a pool is constructed with one fixed
 * `GPUBufferUsage` for every buffer it hands out, and this codebase has no
 * `GPUBufferUsage.INDEX`-flavored pool anywhere yet, so the index buffer always allocates
 * directly (`device.createBuffer`), never pooled. Documented here rather than silently
 * reusing a vertex-usage pool for an index buffer, which WebGPU would reject at bind time.
 */
export class GpuPolygonChunkSlot {
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly positionBuffer: GPUBuffer;
  readonly featureIdBuffer: GPUBuffer;
  readonly styleIdBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;

  static byteSizesForCounts(
    vertexCount: number,
    indexCount: number,
  ): {
    positionBytes: number;
    featureIdBytes: number;
    styleGpuBytes: number;
    indexBytes: number;
  } {
    const positionBytes = vertexCount * 8;
    const featureIdBytes = vertexCount * 4;
    /** Instance/vertex step uses stride 4; uint16 + 2-byte pad per vertex (matches points/lines). */
    const styleGpuBytes = vertexCount * 4;
    /** `indices` is `Uint32Array` (Stage 6.5 §2) — 4 bytes per index, 3 indices per triangle. */
    const indexBytes = indexCount * 4;
    return { positionBytes, featureIdBytes, styleGpuBytes, indexBytes };
  }

  constructor(device: GPUDevice, geom: PreparedPolygonGeometry, pool?: GpuBufferPool) {
    const { vertexCount, indexCount } = geom;
    if (vertexCount < 0) {
      throw new Error("vertexCount must be non-negative");
    }
    if (indexCount < 0) {
      throw new Error("indexCount must be non-negative");
    }
    this.vertexCount = vertexCount;
    this.indexCount = indexCount;

    const { positionBytes, featureIdBytes, styleGpuBytes, indexBytes } =
      GpuPolygonChunkSlot.byteSizesForCounts(vertexCount, indexCount);

    if (geom.positions.byteLength < positionBytes) {
      throw new Error("positions ArrayBuffer smaller than vertexCount * 8");
    }
    if (geom.featureIds.byteLength < featureIdBytes) {
      throw new Error("featureIds ArrayBuffer smaller than vertexCount * 4");
    }
    if (geom.styleIds.byteLength < vertexCount * 2) {
      throw new Error("styleIds ArrayBuffer smaller than vertexCount * 2");
    }
    if (geom.indices.byteLength < indexBytes) {
      throw new Error("indices ArrayBuffer smaller than indexCount * 4");
    }

    const vertexUsage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
    const indexUsage = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;
    const allocVertex = (minBytes: number): GPUBuffer =>
      pool !== undefined
        ? pool.acquire(minBytes)
        : device.createBuffer({ size: Math.max(minBytes, 4), usage: vertexUsage });

    this.positionBuffer = allocVertex(positionBytes);
    this.featureIdBuffer = allocVertex(featureIdBytes);
    this.styleIdBuffer = allocVertex(styleGpuBytes);
    this.indexBuffer = device.createBuffer({ size: Math.max(indexBytes, 4), usage: indexUsage });

    const queue = device.queue;
    if (positionBytes > 0) {
      queue.writeBuffer(
        this.positionBuffer,
        0,
        geom.positions.buffer,
        geom.positions.byteOffset,
        positionBytes,
      );
      queue.writeBuffer(
        this.featureIdBuffer,
        0,
        geom.featureIds.buffer,
        geom.featureIds.byteOffset,
        featureIdBytes,
      );

      const tmp = new Uint8Array(styleGpuBytes);
      for (let i = 0; i < vertexCount; i++) {
        const v = geom.styleIds[i]!;
        const o = i * 4;
        tmp[o] = v & 0xff;
        tmp[o + 1] = (v >> 8) & 0xff;
      }
      queue.writeBuffer(this.styleIdBuffer, 0, tmp.buffer, 0, styleGpuBytes);
    }
    if (indexBytes > 0) {
      queue.writeBuffer(this.indexBuffer, 0, geom.indices.buffer, geom.indices.byteOffset, indexBytes);
    }
  }

  destroy(pool?: GpuBufferPool): void {
    if (pool !== undefined) {
      pool.release(this.positionBuffer);
      pool.release(this.featureIdBuffer);
      pool.release(this.styleIdBuffer);
    } else {
      this.positionBuffer.destroy();
      this.featureIdBuffer.destroy();
      this.styleIdBuffer.destroy();
    }
    // Index buffer is never pooled (see class doc) — always destroyed directly.
    this.indexBuffer.destroy();
  }
}
