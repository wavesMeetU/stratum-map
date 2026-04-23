import type { GeometryBufferView } from "../core/geometry-buffer.js";
import type { FeatureRecord } from "../core/feature-record.js";

/**
 * Opaque input to a parser (GeoJSON string, WKB bytes, FlatGeobuf stream chunk, …).
 * Implementations narrow this type.
 */
export type ParserInput = ArrayBuffer | Uint8Array | string;

/**
 * Result of parsing: new geometry plus feature records for the store.
 * Parsing is expected to run in a Worker; implementations may return transfer lists.
 */
export interface ParseResult {
  readonly view: GeometryBufferView;
  readonly records: readonly FeatureRecord[];
}

/**
 * Pluggable parser: formats in → TypedArrays + records out.
 * No OpenLayers types; no main-thread requirement in the contract.
 */
export interface GeometryParser {
  readonly id: string;
  parse(input: ParserInput, signal?: AbortSignal): Promise<ParseResult>;
}
