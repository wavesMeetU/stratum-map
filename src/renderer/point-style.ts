/** RGBA in linear 0–1 (host may pass sRGB; document per integration). */
export interface PointStyle {
  readonly color: readonly [number, number, number, number];
  /** Diameter in **CSS pixels** (approximate; scales with canvas transform). */
  readonly sizePx: number;
}

export const DEFAULT_POINT_STYLE: PointStyle = {
  color: [0.1, 0.5, 1.0, 1.0],
  sizePx: 6,
};

/** Cap matches WGSL `styleTable` size in `webgpu-points-renderer.ts`. */
export const MAX_POINT_STYLES = 256;
