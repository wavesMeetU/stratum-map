import type { GeometryKind } from "../types/geometry.js";
import type { GeoJsonGeometry, Position } from "./geojson-types.js";

function xy(p: Position): { x: number; y: number } {
  return { x: p[0], y: p[1] };
}

export function geometryKindFor(geom: GeoJsonGeometry): GeometryKind {
  switch (geom.type) {
    case "Point":
      return "point";
    case "MultiPoint":
      return "multiPoint";
    case "LineString":
      return "line";
    case "MultiLineString":
      return "multiLine";
    case "Polygon":
      return "polygon";
    case "MultiPolygon":
      return "multiPolygon";
    case "GeometryCollection":
      return "geometryCollection";
    default: {
      throw new Error(`Unsupported geometry type: ${String((geom as { type?: string }).type)}`);
    }
  }
}

export function countVertices(geom: GeoJsonGeometry | null): number {
  if (geom === null) return 0;
  switch (geom.type) {
    case "Point":
      return 1;
    case "MultiPoint":
      return geom.coordinates.length;
    case "LineString":
      return geom.coordinates.length;
    case "MultiLineString": {
      let n = 0;
      for (const line of geom.coordinates) n += line.length;
      return n;
    }
    case "Polygon": {
      let n = 0;
      for (const ring of geom.coordinates) n += ring.length;
      return n;
    }
    case "MultiPolygon": {
      let n = 0;
      for (const poly of geom.coordinates) {
        for (const ring of poly) n += ring.length;
      }
      return n;
    }
    case "GeometryCollection": {
      let n = 0;
      for (const g of geom.geometries) n += countVertices(g);
      return n;
    }
    default: {
      throw new Error(`Unsupported geometry type: ${String((geom as { type?: string }).type)}`);
    }
  }
}

/**
 * Writes flattened XY vertices for one geometry. Returns the number of vertices written.
 * Polygon / MultiPolygon: rings are concatenated in GeoJSON order (no duplicate closing point removed).
 */
export function writeFlattenedGeometry(
  geom: GeoJsonGeometry | null,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  featureId: number,
  styleId: number,
  vertexOffset: number,
): number {
  if (geom === null) return 0;

  let o = vertexOffset;

  const writePos = (p: Position) => {
    const { x, y } = xy(p);
    positions[o * 2] = x;
    positions[o * 2 + 1] = y;
    featureIds[o] = featureId;
    styleIds[o] = styleId;
    o += 1;
  };

  const writeRing = (ring: Position[]) => {
    for (const p of ring) writePos(p);
  };

  switch (geom.type) {
    case "Point":
      writePos(geom.coordinates);
      break;
    case "MultiPoint":
      for (const p of geom.coordinates) writePos(p);
      break;
    case "LineString":
      writeRing(geom.coordinates);
      break;
    case "MultiLineString":
      for (const line of geom.coordinates) writeRing(line);
      break;
    case "Polygon":
      for (const ring of geom.coordinates) writeRing(ring);
      break;
    case "MultiPolygon":
      for (const poly of geom.coordinates) {
        for (const ring of poly) writeRing(ring);
      }
      break;
    case "GeometryCollection": {
      let at = o;
      for (const g of geom.geometries) {
        const n = writeFlattenedGeometry(
          g,
          positions,
          featureIds,
          styleIds,
          featureId,
          styleId,
          at,
        );
        at += n;
      }
      o = at;
      break;
    }
    default: {
      throw new Error(`Unsupported geometry type: ${String((geom as { type?: string }).type)}`);
    }
  }

  return o - vertexOffset;
}
