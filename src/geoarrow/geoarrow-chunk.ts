import type { Data, Vector } from "apache-arrow";
import * as GeoArrow from "@geoarrow/geoarrow-js";
import type { FeatureRecord } from "../core/feature-record.js";
import type { GeometryBufferView } from "../core/geometry-buffer.js";
import { alignTo4Bytes } from "../gpu/byte-align.js";
import { requireInterleavedPointColumn, tryBorrowInterleavedXYFloat32 } from "./coord-access.js";
import { writeFlattenedGeoArrowRow } from "./flatten-rows.js";
import {
  countVerticesGeoArrowChunk,
  geometryKindForGeoArrowData,
} from "./vertex-count.js";

export function isGeoArrowGeometryData(data: Data): data is GeoArrow.data.GeoArrowData {
  return (
    GeoArrow.data.isPointData(data) ||
    GeoArrow.data.isLineStringData(data) ||
    GeoArrow.data.isPolygonData(data) ||
    GeoArrow.data.isMultiPointData(data) ||
    GeoArrow.data.isMultiLineStringData(data) ||
    GeoArrow.data.isMultiPolygonData(data)
  );
}

export interface FlattenGeoArrowChunkOptions {
  /** Added to each row index in this chunk to form stable `FeatureRecord.id`. */
  readonly baseFeatureId: number;
  readonly defaultStyleId: number;
  /** Global row index of row 0 within this Arrow `Data` chunk (for ids across batches). */
  readonly globalFeatureIndexStart: number;
  readonly getProperties?: (rowInChunk: number) => Readonly<Record<string, unknown>>;
}

export interface FlattenGeoArrowChunkResult {
  readonly view: GeometryBufferView;
  readonly records: readonly FeatureRecord[];
  /**
   * When true, `view.buffer.positions` is a subarray of Arrow's coordinate buffer
   * (Float32 interleaved XY, dim=2, no null geometry rows in chunk).
   */
  readonly positionsReusedArrowBuffer: boolean;
}

/**
 * Flattens one Apache Arrow `Data` chunk holding a GeoArrow geometry column into
 * `GeometryBufferView` + `FeatureRecord`s. Reuses Arrow's Float32 interleaved XY
 * buffer for point columns when the chunk has no null geometries.
 */
export function flattenGeoArrowGeometryData(
  data: GeoArrow.data.GeoArrowData,
  options: FlattenGeoArrowChunkOptions,
): FlattenGeoArrowChunkResult {
  const kind = geometryKindForGeoArrowData(data);
  const vertexTotal = countVerticesGeoArrowChunk(data);
  const getProps = options.getProperties ?? (() => ({}));

  const canBorrowPointPositions =
    GeoArrow.data.isPointData(data) &&
    data.nullCount === 0 &&
    data.length === vertexTotal &&
    data.length > 0;

  let positions: Float32Array;
  let positionsReusedArrowBuffer = false;

  if (canBorrowPointPositions) {
    const { dim, floatData } = requireInterleavedPointColumn(data);
    const borrowed = tryBorrowInterleavedXYFloat32(data, floatData, dim);
    if (borrowed !== null && borrowed.length === vertexTotal * 2) {
      positions = borrowed;
      positionsReusedArrowBuffer = true;
    } else {
      positions = new Float32Array(vertexTotal * 2);
    }
  } else {
    positions = new Float32Array(Math.max(0, vertexTotal * 2));
  }

  const featureIds = new Uint32Array(Math.max(0, vertexTotal));
  const styleU16Count = Math.ceil(alignTo4Bytes(Math.max(0, vertexTotal) * 2) / 2);
  const styleIds = new Uint16Array(styleU16Count);

  const records: FeatureRecord[] = [];
  let vertexOffset = 0;

  for (let row = 0; row < data.length; row++) {
    const featureId = options.baseFeatureId + options.globalFeatureIndexStart + row;
    const start = vertexOffset;

    if (positionsReusedArrowBuffer) {
      if (!data.getValid(row)) {
        throw new Error("GeoArrow adapter: internal error, unexpected null in borrowed point chunk");
      }
      featureIds[row] = featureId;
      styleIds[row] = options.defaultStyleId;
      records.push({
        id: featureId,
        geometryKind: kind,
        vertexStart: row,
        vertexCount: 1,
        properties: Object.freeze({ ...getProps(row) }) as Record<string, unknown>,
      });
      vertexOffset = row + 1;
      continue;
    }

    const written = writeFlattenedGeoArrowRow(
      data,
      row,
      positions,
      featureIds,
      styleIds,
      featureId,
      options.defaultStyleId,
      vertexOffset,
    );
    vertexOffset += written;
    records.push({
      id: featureId,
      geometryKind: kind,
      vertexStart: start,
      vertexCount: written,
      properties: Object.freeze({ ...getProps(row) }) as Record<string, unknown>,
    });
  }

  if (vertexOffset !== vertexTotal) {
    throw new Error(`GeoArrow adapter: vertex mismatch ${vertexOffset} vs ${vertexTotal}`);
  }

  return {
    view: {
      buffer: { positions, featureIds, styleIds },
      vertexCount: vertexTotal,
    },
    records,
    positionsReusedArrowBuffer,
  };
}

export interface FlattenGeoArrowVectorOptions extends Omit<FlattenGeoArrowChunkOptions, "globalFeatureIndexStart"> {
  readonly globalFeatureIndexStart?: number;
}

/**
 * Maps each `vector.data` chunk through `flattenGeoArrowGeometryData`, adjusting
 * `globalFeatureIndexStart` so feature ids stay stable across chunks.
 */
export function flattenGeoArrowGeometryVector(
  vector: Vector,
  options: FlattenGeoArrowVectorOptions,
): FlattenGeoArrowChunkResult[] {
  let globalRow = options.globalFeatureIndexStart ?? 0;
  const out: FlattenGeoArrowChunkResult[] = [];
  for (const raw of vector.data) {
    if (!isGeoArrowGeometryData(raw)) {
      throw new Error("GeoArrow adapter: vector chunk is not a known GeoArrow geometry type");
    }
    out.push(
      flattenGeoArrowGeometryData(raw, {
        baseFeatureId: options.baseFeatureId,
        defaultStyleId: options.defaultStyleId,
        globalFeatureIndexStart: globalRow,
        getProperties: options.getProperties,
      }),
    );
    globalRow += raw.length;
  }
  return out;
}
