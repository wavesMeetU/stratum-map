/** RGBA in linear 0–1 (host may pass sRGB; document per integration). */
export interface PointStyle {
  readonly color: readonly [number, number, number, number];
  /**
   * Diameter in **backing-store (physical) pixels** — the shader multiplies `sizePx`
   * directly against the canvas's `viewport_px` uniform (`canvas.width`/`canvas.height`),
   * not the CSS-pixel client size. On a HiDPI display, a given `sizePx` therefore renders
   * larger on-screen (in CSS terms) than the name might suggest unless you divide by
   * `devicePixelRatio` yourself. Matches `LineStyle.widthPx`'s convention exactly.
   */
  readonly sizePx: number;
}

export const DEFAULT_POINT_STYLE: PointStyle = {
  color: [0.1, 0.5, 1.0, 1.0],
  sizePx: 6,
};

/** Cap matches WGSL `styleTable` size in `webgpu-points-renderer.ts`. */
export const MAX_POINT_STYLES = 256;
