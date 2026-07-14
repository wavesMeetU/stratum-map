/**
 * RGBA in linear 0-1 (host may pass sRGB; document per integration). Solid fill only —
 * deliberately no outline/width field (see `polygons-wgsl.ts`'s `GpuPolygonStyle` doc for
 * why omitting a trailing field entirely is what keeps this immune to the Stage 6.2.1 class
 * of CPU/WGSL stride mismatch).
 */
export interface PolygonStyle {
  readonly color: readonly [number, number, number, number];
}

export const DEFAULT_POLYGON_STYLE: PolygonStyle = {
  color: [0.4, 0.7, 0.9, 0.85],
};

/** Cap matches WGSL `style_table` size in `webgpu-polygon-renderer.ts`. */
export const MAX_POLYGON_STYLES = 256;
