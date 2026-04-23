import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import type { WebGpuPointsRenderer } from "../renderer/webgpu-points-renderer.js";
import { IncrementalDrawScheduler } from "./incremental-draw-scheduler.js";

export interface PointStreamBridgeOptions {
  readonly renderer: WebGpuPointsRenderer;
  /** When true, each `ingest` schedules one coalesced draw for the next frame. */
  readonly scheduleDraw?: boolean;
  /** Supplies `timeMs` for `RenderFrame` when scheduling draws. */
  readonly frameTime?: () => number;
}

/**
 * Owns chunked GPU geometry lifecycle for a renderer that is in **chunked** layout mode.
 * Call `renderer.useChunkedGeometry()` before using this bridge.
 */
export class PointGeometryStreamBridge {
  private readonly renderer: WebGpuPointsRenderer;
  private readonly scheduler: IncrementalDrawScheduler | null;

  constructor(options: PointStreamBridgeOptions) {
    this.renderer = options.renderer;
    this.scheduler = options.scheduleDraw
      ? new IncrementalDrawScheduler(() => {
          const timeMs = options.frameTime?.() ?? globalThis.performance?.now() ?? Date.now();
          this.renderer.render({ timeMs });
        })
      : null;
  }

  /** Partial GPU upload for one transferred worker chunk (no CPU-side merge). */
  ingestWorkerChunk(msg: GeoJsonWorkerChunkMessage): void {
    this.renderer.ingestTransferredWorkerChunk(msg);
    this.scheduler?.request();
  }

  releaseGpu(): void {
    this.renderer.clearChunkedGeometry();
  }

  dispose(): void {
    this.scheduler?.cancel();
    this.releaseGpu();
  }
}
