import type { FeatureStore, StoredFeatureRecord } from "../core/feature-store.js";
import type { WebGpuPointsRenderer } from "../renderer/webgpu-points-renderer.js";

export interface GetFeatureAtPixelOptions {
  /**
   * Canvas **backing-store** pixel coordinates (0..canvas.width/height),
   * same space as WebGPU render targets.
   */
  readonly x: number;
  readonly y: number;
}

/**
 * `pixel → featureId → FeatureStore → FeatureRecord`
 */
export class PointHitTester {
  constructor(
    private readonly renderer: WebGpuPointsRenderer,
    private readonly store: FeatureStore,
  ) {}

  /**
   * GPU pick (offscreen RGBA8 id), then store lookup. Returns `null` if miss or unknown id.
   */
  async getFeatureAtPixel(options: GetFeatureAtPixelOptions): Promise<StoredFeatureRecord | null> {
    const id = await this.renderer.pickFeatureIdAtCanvasPixel(options.x, options.y);
    if (id === null) return null;
    return this.store.getById(id) ?? null;
  }

  /**
   * Extent query uses bbox metadata from `FeatureStore.ingestRecordsWithPositions`.
   */
  getFeaturesInExtent(
    extent: readonly [number, number, number, number],
  ): StoredFeatureRecord[] {
    return this.store.getRecordsInExtent(extent);
  }
}
