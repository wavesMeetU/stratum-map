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

  for (let i = 0; i < slice.length; i++) {
    const f = slice[i];
    const featureId = baseFeatureId + globalStartIndex + i;
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
