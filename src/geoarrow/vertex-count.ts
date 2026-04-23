import * as GeoArrow from "@geoarrow/geoarrow-js";
import type { GeometryKind } from "../types/geometry.js";

function countLineStringLikeRow(
  data: GeoArrow.data.LineStringData | GeoArrow.data.MultiPointData,
  row: number,
): number {
  const off = data.valueOffsets!;
  return off[row + 1]! - off[row]!;
}

function countPolygonRow(polyData: GeoArrow.data.PolygonData, row: number): number {
  const ringBegin = polyData.valueOffsets![row]!;
  const ringEnd = polyData.valueOffsets![row + 1]!;
  const rings = GeoArrow.child.getPolygonChild(polyData);
  const ro = rings.valueOffsets!;
  let n = 0;
  for (let r = ringBegin; r < ringEnd; r++) {
    n += ro[r + 1]! - ro[r]!;
  }
  return n;
}

function countMultiLineStringRow(mls: GeoArrow.data.MultiLineStringData, row: number): number {
  const lineBegin = mls.valueOffsets![row]!;
  const lineEnd = mls.valueOffsets![row + 1]!;
  const lines = GeoArrow.child.getMultiLineStringChild(mls);
  const lo = lines.valueOffsets!;
  let n = 0;
  for (let L = lineBegin; L < lineEnd; L++) {
    n += lo[L + 1]! - lo[L]!;
  }
  return n;
}

function countMultiPolygonRow(mp: GeoArrow.data.MultiPolygonData, row: number): number {
  const polyBegin = mp.valueOffsets![row]!;
  const polyEnd = mp.valueOffsets![row + 1]!;
  const polys = GeoArrow.child.getMultiPolygonChild(mp);
  let n = 0;
  for (let P = polyBegin; P < polyEnd; P++) {
    n += countPolygonRow(polys, P);
  }
  return n;
}

/** Vertex count for one geometry row (0 if null). */
export function countVerticesGeoArrowRow(data: GeoArrow.data.GeoArrowData, row: number): number {
  if (!data.getValid(row)) return 0;
  if (GeoArrow.data.isPointData(data)) return 1;
  if (GeoArrow.data.isLineStringData(data) || GeoArrow.data.isMultiPointData(data)) {
    return countLineStringLikeRow(data, row);
  }
  if (GeoArrow.data.isPolygonData(data)) return countPolygonRow(data, row);
  if (GeoArrow.data.isMultiLineStringData(data)) return countMultiLineStringRow(data, row);
  if (GeoArrow.data.isMultiPolygonData(data)) return countMultiPolygonRow(data, row);
  return 0;
}

export function countVerticesGeoArrowChunk(data: GeoArrow.data.GeoArrowData): number {
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    n += countVerticesGeoArrowRow(data, i);
  }
  return n;
}

export function geometryKindForGeoArrowData(data: GeoArrow.data.GeoArrowData): GeometryKind {
  if (GeoArrow.data.isPointData(data)) return "point";
  if (GeoArrow.data.isMultiPointData(data)) return "multiPoint";
  if (GeoArrow.data.isLineStringData(data)) return "line";
  if (GeoArrow.data.isMultiLineStringData(data)) return "multiLine";
  if (GeoArrow.data.isPolygonData(data)) return "polygon";
  if (GeoArrow.data.isMultiPolygonData(data)) return "multiPolygon";
  throw new Error("GeoArrow adapter: unsupported geometry column type");
}
