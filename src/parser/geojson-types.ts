/** Minimal GeoJSON shapes used by the worker parser (no OL dependency). */

export type Position = [number, number] | [number, number, number];

export interface GeoJsonPoint {
  readonly type: "Point";
  readonly coordinates: Position;
}

export interface GeoJsonMultiPoint {
  readonly type: "MultiPoint";
  readonly coordinates: Position[];
}

export interface GeoJsonLineString {
  readonly type: "LineString";
  readonly coordinates: Position[];
}

export interface GeoJsonMultiLineString {
  readonly type: "MultiLineString";
  readonly coordinates: Position[][];
}

export interface GeoJsonPolygon {
  readonly type: "Polygon";
  readonly coordinates: Position[][];
}

export interface GeoJsonMultiPolygon {
  readonly type: "MultiPolygon";
  readonly coordinates: Position[][][];
}

export interface GeoJsonGeometryCollection {
  readonly type: "GeometryCollection";
  readonly geometries: GeoJsonGeometry[];
}

export type GeoJsonGeometry =
  | GeoJsonPoint
  | GeoJsonMultiPoint
  | GeoJsonLineString
  | GeoJsonMultiLineString
  | GeoJsonPolygon
  | GeoJsonMultiPolygon
  | GeoJsonGeometryCollection;

export interface GeoJsonFeature {
  readonly type: "Feature";
  readonly geometry: GeoJsonGeometry | null;
  readonly properties: Record<string, unknown> | null;
  readonly id?: string | number;
}

export interface GeoJsonFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: GeoJsonFeature[];
}
