import { DataType, type Data, type Float } from "apache-arrow";
import * as GeoArrow from "@geoarrow/geoarrow-js";

export function requireInterleavedPointColumn(pointData: GeoArrow.data.PointData): {
  dim: number;
  floatData: Data<Float>;
} {
  if (!DataType.isFixedSizeList(pointData.type)) {
    throw new Error(
      "GeoArrow adapter: only interleaved FixedSizeList coordinates are supported (not separated struct coords)",
    );
  }
  return {
    dim: pointData.type.listSize,
    floatData: GeoArrow.child.getPointChild(pointData),
  };
}

export function readCoordXY(
  values: ArrayLike<number>,
  pointIndex: number,
  dim: number,
): { x: number; y: number } {
  const b = pointIndex * dim;
  return { x: values[b]!, y: values[b + 1]! };
}

export function tryBorrowInterleavedXYFloat32(
  pointData: GeoArrow.data.PointData,
  floatData: Data<Float>,
  dim: number,
): Float32Array | null {
  if (dim !== 2) return null;
  if (floatData.values instanceof Float32Array) {
    const start = floatData.offset;
    const floatCount = pointData.length * dim;
    return floatData.values.subarray(start, start + floatCount);
  }
  return null;
}
