import type { GeoJsonFeature } from "./geojson-types.js";
import {
  countVertices,
  geometryKindFor,
  writeFlattenedGeometry,
} from "./geojson-flatten.js";
import type { GeometryKind } from "../types/geometry.js";
import type { GeoJsonWorkerChunkMessage, GeoJsonWorkerFeatureRecord } from "./geojson-worker-messages.js";
import { alignTo4Bytes } from "../gpu/byte-align.js";

export function geometryKindForFeature(geometry: GeoJsonFeature["geometry"]): GeometryKind {
  if (geometry === null) return "point";
  return geometryKindFor(geometry);
}

/**
 * GPU-picking-safe upper bound for a `FeatureId`.
 *
 * `pick-points-wgsl.ts` encodes `(featureId + 1)` as an unsigned 32-bit value split into
 * RGBA8 bytes; `id-pack.ts` decodes it on the main thread using JS's `|`/`<<` operators,
 * which operate on **signed** 32-bit integers. Once the encoded value reaches `0x80000000`
 * (i.e. `featureId >= 0x7FFFFFFF`), the decoded result comes back negative instead of the
 * intended id. Keeping generated/accepted ids at or below `0x7FFFFFFE` keeps the encoded
 * value at or below `0x7FFFFFFF`, which always decodes correctly.
 */
const MAX_SAFE_GPU_FEATURE_ID = 0x7ffffffe;

function isSafeSourceFeatureId(id: unknown): id is number {
  return (
    typeof id === "number" &&
    Number.isInteger(id) &&
    id >= 0 &&
    id <= MAX_SAFE_GPU_FEATURE_ID
  );
}

/**
 * Resolves one `FeatureId` per feature in `slice`.
 *
 * Prefers a feature's own `id` when it is a GPU-safe non-negative integer that is unique
 * within this slice, used **verbatim** (no `baseFeatureId` offset) — so the same source
 * feature reappearing across separate `buildGeoJsonFeatureChunk` calls (e.g. two
 * overlapping FlatGeobuf bbox queries) resolves to the same `FeatureId` both times,
 * letting `FeatureStore.ingestRecords`'s upsert-by-id naturally deduplicate it and letting
 * GPU picking resolve either copy to the same feature.
 *
 * Falls back to the pre-existing positional scheme (`baseFeatureId + globalStartIndex + i`)
 * for features with a missing, non-numeric, out-of-range, or intra-slice-duplicate id —
 * this exactly reproduces prior behavior whenever no feature in the slice has a usable id.
 * Fallback ids are chosen to never collide with a reserved source id or another fallback id
 * within the same slice, so uniqueness within one chunk is always guaranteed, same as before
 * this function existed.
 */
function resolveFeatureIds(
  slice: readonly GeoJsonFeature[],
  globalStartIndex: number,
  baseFeatureId: number,
): number[] {
  const sourceIdCounts = new Map<number, number>();
  for (const f of slice) {
    if (isSafeSourceFeatureId(f.id)) {
      sourceIdCounts.set(f.id, (sourceIdCounts.get(f.id) ?? 0) + 1);
    }
  }

  const reserved = new Set<number>();
  for (const [id, count] of sourceIdCounts) {
    if (count === 1) reserved.add(id);
  }

  const used = new Set<number>(reserved);
  let nextPositional = baseFeatureId + globalStartIndex;
  const ids = new Array<number>(slice.length);

  for (let i = 0; i < slice.length; i++) {
    const sourceId = slice[i].id;
    if (isSafeSourceFeatureId(sourceId) && reserved.has(sourceId)) {
      ids[i] = sourceId;
      continue;
    }
    while (used.has(nextPositional)) {
      nextPositional++;
    }
    ids[i] = nextPositional;
    used.add(nextPositional);
    nextPositional++;
  }

  return ids;
}

export function buildGeoJsonFeatureChunk(
  slice: readonly GeoJsonFeature[],
  globalStartIndex: number,
  baseFeatureId: number,
  defaultStyleId: number,
  chunkIndex: number,
  parseId: number,
  tileKey?: string,
): GeoJsonWorkerChunkMessage {
  let vertexTotal = 0;
  for (const f of slice) {
    vertexTotal += countVertices(f.geometry);
  }

  const positions = new Float32Array(vertexTotal * 2);
  const featureIds = new Uint32Array(vertexTotal);
  const styleU16Count = Math.ceil(alignTo4Bytes(vertexTotal * 2) / 2);
  const styleIds = new Uint16Array(styleU16Count);

  let vertexOffset = 0;
  const records: GeoJsonWorkerFeatureRecord[] = [];
  const resolvedFeatureIds = resolveFeatureIds(slice, globalStartIndex, baseFeatureId);

  for (let i = 0; i < slice.length; i++) {
    const f = slice[i];
    const featureId = resolvedFeatureIds[i];
    const start = vertexOffset;
    const written = writeFlattenedGeometry(
      f.geometry,
      positions,
      featureIds,
      styleIds,
      featureId,
      defaultStyleId,
      vertexOffset,
    );
    vertexOffset += written;
    records.push({
      id: featureId,
      geometryKind: geometryKindForFeature(f.geometry),
      vertexStart: start,
      vertexCount: written,
      properties: Object.freeze({ ...(f.properties ?? {}) }) as Record<string, unknown>,
    });
  }

  if (vertexOffset !== vertexTotal) {
    throw new Error(`Internal vertex layout mismatch: ${vertexOffset} vs ${vertexTotal}`);
  }

  return {
    type: "chunk",
    parseId,
    chunkIndex,
    vertexCount: vertexTotal,
    positions: positions.buffer,
    featureIds: featureIds.buffer,
    styleIds: styleIds.buffer,
    records,
    ...(tileKey !== undefined ? { tileKey } : {}),
  };
}
