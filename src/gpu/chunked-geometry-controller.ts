import type { FeatureStore } from "../core/feature-store.js";
import type { GeoJsonWorkerChunkMessage } from "../parser/geojson-worker-messages.js";
import type {
  IngestTransferredWorkerChunkOptions,
  WebGpuPointsRenderer,
} from "../renderer/webgpu-points-renderer.js";
import type { GpuChunkFeatureIndex } from "./gpu-chunk-feature-index.js";
import { GpuBufferPool } from "./gpu-buffer-pool.js";
import { IncrementalDrawScheduler } from "./incremental-draw-scheduler.js";

export interface ChunkedGeometryControllerOptions {
  readonly renderer: WebGpuPointsRenderer;
  /**
   * When set, evicts LRU GPU chunks before ingest if `getChunkCount() >= maxGpuChunks`.
   * Pair with `onGpuChunkEvicted` to prune CPU-side indexes so picking/metadata stay consistent.
   */
  readonly maxGpuChunks?: number;
  /**
   * Drops chunks whose `parseId` is strictly less than this value (stale worker results).
   * Mutually exclusive with `minParseId` — prefer one.
   */
  readonly acceptedParseId?: number;
  /** Dynamic floor for `msg.parseId` (e.g. bump when user cancels / starts new load). */
  readonly minParseId?: () => number;
  /** When true, coalesce draws after each accepted ingest. */
  readonly scheduleDraw?: boolean;
  readonly frameTime?: () => number;
  /** Optional: mirror accepted chunks into the feature store (same as stream bridge). */
  readonly featureStore?: FeatureStore;
  /**
   * Optional: updated on each ingest and pruned on eviction so you can call
   * `featureStore.retainIds(chunkFeatureIndex.unionOfAllChunks())` after evictions.
   */
  readonly chunkFeatureIndex?: GpuChunkFeatureIndex;
  /**
   * Called after a GPU chunk is evicted (LRU or explicit remove).
   * If `chunkFeatureIndex` is set, `forgetChunk` runs before this callback.
   */
  readonly onGpuChunkEvicted?: (chunkKey: string) => void;
}

/**
 * Production-oriented orchestration: optional parse-id filtering, GPU chunk caps (LRU),
 * batched draws, and hooks for keeping CPU state aligned with evictions.
 */
export class ChunkedGeometryController {
  private readonly renderer: WebGpuPointsRenderer;
  private readonly scheduler: IncrementalDrawScheduler | null;
  private readonly options: ChunkedGeometryControllerOptions;

  private notifyChunkEvicted(chunkKey: string): void {
    this.options.chunkFeatureIndex?.forgetChunk(chunkKey);
    this.options.onGpuChunkEvicted?.(chunkKey);
  }

  constructor(options: ChunkedGeometryControllerOptions) {
    this.renderer = options.renderer;
    this.options = options;
    this.scheduler = options.scheduleDraw
      ? new IncrementalDrawScheduler(() => {
          const timeMs = options.frameTime?.() ?? globalThis.performance?.now() ?? Date.now();
          this.renderer.render({ timeMs });
        })
      : null;
  }

  /**
   * Ingests one worker chunk. Builds a default `chunkKey` from `parseId` + `chunkIndex` when omitted.
   */
  ingestWorkerChunk(
    msg: GeoJsonWorkerChunkMessage,
    ingestOptions?: IngestTransferredWorkerChunkOptions,
  ): void {
    const minDyn = this.options.minParseId?.() ?? this.options.acceptedParseId ?? 0;
    if (msg.parseId < minDyn) {
      return;
    }

    const max = this.options.maxGpuChunks;
    if (max !== undefined) {
      while (this.renderer.getChunkCount() >= max) {
        const k = this.renderer.evictOldestChunk();
        if (k === undefined) {
          break;
        }
        this.notifyChunkEvicted(k);
      }
    }

    const chunkKey =
      ingestOptions?.chunkKey ?? `p${msg.parseId}-c${msg.chunkIndex}`;
    this.renderer.ingestTransferredWorkerChunk(msg, { chunkKey });

    if (msg.vertexCount === 0) {
      this.notifyChunkEvicted(chunkKey);
    } else {
      this.options.chunkFeatureIndex?.setChunkFeatures(chunkKey, msg.records);
      this.options.featureStore?.ingestRecords(msg.records);
    }
    this.scheduler?.request();
  }

  removeChunkByKey(chunkKey: string): void {
    if (this.renderer.removeChunkByKey(chunkKey)) {
      this.notifyChunkEvicted(chunkKey);
    }
  }

  evictOldestChunk(): string | undefined {
    const k = this.renderer.evictOldestChunk();
    if (k !== undefined) {
      this.notifyChunkEvicted(k);
    }
    return k;
  }

  releaseGpu(): void {
    const keys = this.renderer.getChunkKeys();
    this.renderer.clearChunkedGeometry();
    for (const k of keys) {
      this.notifyChunkEvicted(k);
    }
  }

  dispose(): void {
    this.scheduler?.cancel();
    this.releaseGpu();
  }

  /**
   * Drops `FeatureStore` rows not present in any **tracked** GPU chunk.
   * Requires `chunkFeatureIndex` in options.
   */
  pruneFeatureStoreToTrackedGpuChunks(store: FeatureStore): number {
    const idx = this.options.chunkFeatureIndex;
    if (idx === undefined) {
      throw new Error("ChunkedGeometryController: chunkFeatureIndex is required for pruneFeatureStoreToTrackedGpuChunks");
    }
    return store.retainIds(idx.unionOfAllChunks());
  }
}

/** Shared pool constructor for vertex buffers used with `WebGpuPointsRenderer.gpuBufferPool`. */
export function createVertexGpuBufferPool(device: GPUDevice, label = "vertex"): GpuBufferPool {
  return new GpuBufferPool(device, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label);
}
