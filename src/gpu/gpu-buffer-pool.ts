import { bucketByteSizeCeil } from "./buffer-bucket.js";

/**
 * Reuses `GPUBuffer` allocations of identical `size` (see `bucketByteSizeCeil`).
 * Typical usage: one pool per usage flag set (e.g. vertex + COPY_DST).
 */
export class GpuBufferPool {
  private readonly free = new Map<number, GPUBuffer[]>();

  constructor(
    private readonly device: GPUDevice,
    private readonly usage: GPUBufferUsageFlags,
    private readonly label?: string,
  ) {}

  /** Returns a buffer with `size >= bucketByteSizeCeil(minBytes)`. */
  acquire(minBytes: number): GPUBuffer {
    const size = bucketByteSizeCeil(minBytes);
    const stack = this.free.get(size);
    if (stack !== undefined && stack.length > 0) {
      return stack.pop()!;
    }
    return this.device.createBuffer({
      size,
      usage: this.usage,
      label: this.label,
    });
  }

  /** Returns a buffer to the pool; caller must not use it afterward. */
  release(buffer: GPUBuffer): void {
    const size = buffer.size;
    let stack = this.free.get(size);
    if (stack === undefined) {
      stack = [];
      this.free.set(size, stack);
    }
    stack.push(buffer);
  }

  /** Destroys all pooled buffers (not buffers still in use by the app). */
  clear(): void {
    for (const stack of this.free.values()) {
      for (const b of stack) {
        b.destroy();
      }
    }
    this.free.clear();
  }
}
