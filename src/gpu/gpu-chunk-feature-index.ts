import type { FeatureRecord } from "../core/feature-record.js";
import type { FeatureId } from "../types/ids.js";

/**
 * Tracks which feature ids arrived in each GPU chunk key. On eviction, call
 * `forgetChunk` then `FeatureStore.retainIds(index.unionOfAllChunks())` (or merge with
 * ids you still need from non-GPU sources) to avoid stale picking metadata.
 */
export class GpuChunkFeatureIndex {
  private readonly byChunk = new Map<string, ReadonlySet<FeatureId>>();

  setChunkFeatures(chunkKey: string, records: readonly FeatureRecord[]): void {
    const s = new Set<FeatureId>();
    for (const r of records) {
      s.add(r.id);
    }
    this.byChunk.set(chunkKey, s);
  }

  forgetChunk(chunkKey: string): void {
    this.byChunk.delete(chunkKey);
  }

  /** Union of ids for all chunks currently listed in the index. */
  unionOfAllChunks(): Set<FeatureId> {
    const out = new Set<FeatureId>();
    for (const s of this.byChunk.values()) {
      for (const id of s) {
        out.add(id);
      }
    }
    return out;
  }
}
