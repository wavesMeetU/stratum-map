/**
 * Loads demo / tooling MSDF atlas JSON (subset compatible with msdf-atlas-gen-style exports).
 */

export interface MsdfAtlasBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MsdfAtlasGlyphJson {
  readonly unicode: number;
  /** Horizontal advance in **atlas pixels** (same units as atlasBounds). */
  readonly advance: number;
  readonly atlasBounds: MsdfAtlasBounds;
}

export interface MsdfAtlasJsonV1 {
  readonly version: 1;
  readonly atlas: {
    readonly type: string;
    readonly width: number;
    readonly height: number;
    readonly distanceRange?: number;
  };
  readonly metrics: {
    readonly emSize: number;
    readonly lineHeight?: number;
  };
  readonly glyphs: readonly MsdfAtlasGlyphJson[];
}

export function parseMsdfAtlasJson(text: string): MsdfAtlasJsonV1 {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("MSDF atlas JSON: expected object");
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error("MSDF atlas JSON: unsupported version (expected 1)");
  }
  const atlas = o.atlas as Record<string, unknown> | undefined;
  const metrics = o.metrics as Record<string, unknown> | undefined;
  const glyphs = o.glyphs as unknown[] | undefined;
  if (!atlas || !metrics || !Array.isArray(glyphs)) {
    throw new Error("MSDF atlas JSON: missing atlas, metrics, or glyphs");
  }
  if (typeof atlas.width !== "number" || typeof atlas.height !== "number") {
    throw new Error("MSDF atlas JSON: atlas.width/height required");
  }
  if (typeof metrics.emSize !== "number") {
    throw new Error("MSDF atlas JSON: metrics.emSize required");
  }
  return raw as MsdfAtlasJsonV1;
}
