import * as GeoArrow from "@geoarrow/geoarrow-js";
import { readCoordXY, requireInterleavedPointColumn } from "./coord-access.js";

function writePointIndexRange(
  pointData: GeoArrow.data.PointData,
  dim: number,
  pointStart: number,
  pointEnd: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  const { floatData } = requireInterleavedPointColumn(pointData);
  const values = floatData.values;
  let o = vertexOffset;
  for (let p = pointStart; p < pointEnd; p++) {
    const { x, y } = readCoordXY(values, p, dim);
    positions[o * 2] = x;
    positions[o * 2 + 1] = y;
    featureIds[o] = featureId;
    styleIds[o] = styleId;
    o += 1;
  }
  return o - vertexOffset;
}

function writeLineStringLikeRow(
  data: GeoArrow.data.LineStringData | GeoArrow.data.MultiPointData,
  row: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  const pointData = GeoArrow.data.isLineStringData(data)
    ? GeoArrow.child.getLineStringChild(data)
    : GeoArrow.child.getMultiPointChild(data);
  const { dim } = requireInterleavedPointColumn(pointData);
  const ps = data.valueOffsets![row]!;
  const pe = data.valueOffsets![row + 1]!;
  return writePointIndexRange(
    pointData,
    dim,
    ps,
    pe,
    positions,
    featureIds,
    styleIds,
    featureId,
    styleId,
    vertexOffset,
  );
}

function writePolygonRow(
  polyData: GeoArrow.data.PolygonData,
  row: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  const ringBegin = polyData.valueOffsets![row]!;
  const ringEnd = polyData.valueOffsets![row + 1]!;
  const rings = GeoArrow.child.getPolygonChild(polyData);
  const pointData = GeoArrow.child.getLineStringChild(rings);
  const { dim } = requireInterleavedPointColumn(pointData);
  const ro = rings.valueOffsets!;
  let o = vertexOffset;
  for (let r = ringBegin; r < ringEnd; r++) {
    const ps = ro[r]!;
    const pe = ro[r + 1]!;
    o += writePointIndexRange(
      pointData,
      dim,
      ps,
      pe,
      positions,
      featureIds,
      styleIds,
      featureId,
      styleId,
      o,
    );
  }
  return o - vertexOffset;
}

function writeMultiLineStringRow(
  mls: GeoArrow.data.MultiLineStringData,
  row: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  const lineBegin = mls.valueOffsets![row]!;
  const lineEnd = mls.valueOffsets![row + 1]!;
  const lines = GeoArrow.child.getMultiLineStringChild(mls);
  const pointData = GeoArrow.child.getLineStringChild(lines);
  const { dim } = requireInterleavedPointColumn(pointData);
  const lo = lines.valueOffsets!;
  let o = vertexOffset;
  for (let L = lineBegin; L < lineEnd; L++) {
    const ps = lo[L]!;
    const pe = lo[L + 1]!;
    o += writePointIndexRange(
      pointData,
      dim,
      ps,
      pe,
      positions,
      featureIds,
      styleIds,
      featureId,
      styleId,
      o,
    );
  }
  return o - vertexOffset;
}

function writeMultiPolygonRow(
  mp: GeoArrow.data.MultiPolygonData,
  row: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  const polyBegin = mp.valueOffsets![row]!;
  const polyEnd = mp.valueOffsets![row + 1]!;
  const polys = GeoArrow.child.getMultiPolygonChild(mp);
  let o = vertexOffset;
  for (let P = polyBegin; P < polyEnd; P++) {
    o += writePolygonRow(polys, P, positions, featureIds, styleIds, featureId, styleId, o);
  }
  return o - vertexOffset;
}

export function writeFlattenedGeoArrowRow(
  data: GeoArrow.data.GeoArrowData,
  row: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  if (!data.getValid(row)) return 0;

  if (GeoArrow.data.isPointData(data)) {
    const { dim } = requireInterleavedPointColumn(data);
    return writePointIndexRange(
      data,
      dim,
      row,
      row + 1,
      positions,
      featureIds,
      styleIds,
      featureId,
      styleId,
      vertexOffset,
    );
  }
  if (GeoArrow.data.isLineStringData(data)) {
    return writeLineStringLikeRow(data, row, positions, featureIds, styleIds, featureId, styleId, vertexOffset);
  }
  if (GeoArrow.data.isMultiPointData(data)) {
    return writeLineStringLikeRow(data, row, positions, featureIds, styleIds, featureId, styleId, vertexOffset);
  }
  if (GeoArrow.data.isPolygonData(data)) {
    return writePolygonRow(data, row, positions, featureIds, styleIds, featureId, styleId, vertexOffset);
  }
  if (GeoArrow.data.isMultiLineStringData(data)) {
    return writeMultiLineStringRow(data, row, positions, featureIds, styleIds, featureId, styleId, vertexOffset);
  }
  if (GeoArrow.data.isMultiPolygonData(data)) {
    return writeMultiPolygonRow(data, row, positions, featureIds, styleIds, featureId, styleId, vertexOffset);
  }
  return 0;
}

/** Point column: write one row from interleaved values (used when packing non-borrowed buffers). */
export function writePointRowFromValues(
  values: ArrayLike<number>,
  dim: number,
  row: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): void {
  const { x, y } = readCoordXY(values, row, dim);
  positions[vertexOffset * 2] = x;
  positions[vertexOffset * 2 + 1] = y;
  featureIds[vertexOffset] = featureId;
  styleIds[vertexOffset] = styleId;
}
