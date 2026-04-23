import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import { alignTo4Bytes } from "./byte-align.js";

/**
 * One worker chunk → dedicated GPU vertex buffers.
 * Upload uses the transferred `ArrayBuffer`s directly (no TypedArray reshape on main).
 */
export class GpuPointChunkSlot {
  readonly vertexCount: number;
  readonly positionBuffer: GPUBuffer;
  readonly styleIdBuffer: GPUBuffer;

  constructor(device: GPUDevice, msg: GeoJsonWorkerChunkMessage) {
    const { vertexCount } = msg;
    if (vertexCount < 0) {
      throw new Error("vertexCount must be non-negative");
    }
    this.vertexCount = vertexCount;

    const positionBytes = vertexCount * 8;
    const styleBytesRaw = vertexCount * 2;
    const styleWriteBytes = alignTo4Bytes(styleBytesRaw);

    if (msg.positions.byteLength < positionBytes) {
      throw new Error("positions ArrayBuffer smaller than vertexCount * 8");
    }
    if (msg.styleIds.byteLength < styleWriteBytes) {
      throw new Error("styleIds ArrayBuffer smaller than padded style upload");
    }

    this.positionBuffer = device.createBuffer({
      size: Math.max(positionBytes, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.styleIdBuffer = device.createBuffer({
      size: Math.max(styleWriteBytes, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const queue = device.queue;
    queue.writeBuffer(this.positionBuffer, 0, msg.positions, 0, positionBytes);
    queue.writeBuffer(this.styleIdBuffer, 0, msg.styleIds, 0, styleWriteBytes);
  }

  destroy(): void {
    this.positionBuffer.destroy();
    this.styleIdBuffer.destroy();
  }
}
