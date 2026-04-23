/**
 * Logical geometry kinds the pipeline may carry.
 * Parsers map formats → these; renderers interpret buffers, not OL classes.
 */
export type GeometryKind =
  | "point"
  | "line"
  | "polygon"
  | "multiPoint"
  | "multiLine"
  | "multiPolygon"
  | "geometryCollection";
