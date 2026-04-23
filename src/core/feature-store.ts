import type { FeatureId } from "../types/ids.js";
import type { FeatureRecord } from "./feature-record.js";

export type MapExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];

export interface StoredFeatureRecord extends FeatureRecord {
  /** Axis-aligned bounds in map space when known (points / multipoint from ingest). */
  readonly bbox?: MapExtent;
}

function intersects(a: MapExtent, b: MapExtent): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * O(1) id → record. Optional bbox for coarse extent queries.
 */
export class FeatureStore {
  private readonly byId = new Map<FeatureId, StoredFeatureRecord>();

  clear(): void {
    this.byId.clear();
  }

  remove(id: FeatureId): boolean {
    return this.byId.delete(id);
  }

  /**
   * Deletes any record whose id is not in `keep`. Returns how many rows were removed.
   * Use after GPU chunk eviction when you track which feature ids lived in each chunk.
   */
  retainIds(keep: ReadonlySet<FeatureId>): number {
    let removed = 0;
    for (const id of this.byId.keys()) {
      if (!keep.has(id)) {
        this.byId.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Replace records by id (last write wins per id). */
  ingestRecords(records: readonly FeatureRecord[]): void {
    for (const r of records) {
      this.byId.set(r.id, { ...r });
    }
  }

  /**
   * Updates records and computes `bbox` per record from `positions` (map XY pairs).
   * No TypedArray allocation beyond reads on existing buffers.
   */
  ingestRecordsWithPositions(
    positions: Float32Array,
    records: readonly FeatureRecord[],
  ): void {
    for (const r of records) {
      const start = r.vertexStart * 2;
      const count = r.vertexCount;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const end = start + count * 2;
      if (count > 0 && end <= positions.length) {
        for (let i = start; i < end; i += 2) {
          const x = positions[i];
          const y = positions[i + 1];
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      const bbox: MapExtent | undefined =
        count > 0 && Number.isFinite(minX)
          ? [minX, minY, maxX, maxY]
          : undefined;
      const stored: StoredFeatureRecord = bbox ? { ...r, bbox } : { ...r };
      this.byId.set(r.id, stored);
    }
  }

  getById(id: FeatureId): StoredFeatureRecord | undefined {
    return this.byId.get(id);
  }

  getRecord(id: FeatureId): StoredFeatureRecord | undefined {
    return this.getById(id);
  }

  /** All stored records (unordered). */
  getAll(): StoredFeatureRecord[] {
    return [...this.byId.values()];
  }

  /**
   * Features whose known `bbox` intersects `extent`. Records without `bbox` are skipped.
   */
  getRecordsInExtent(extent: MapExtent): StoredFeatureRecord[] {
    const out: StoredFeatureRecord[] = [];
    for (const r of this.byId.values()) {
      if (r.bbox && intersects(r.bbox, extent)) {
        out.push(r);
      }
    }
    return out;
  }
}
