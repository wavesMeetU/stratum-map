/**
 * RGBA in linear 0-1 (host may pass sRGB; document per integration).
 *
 * `widthPx` is measured in **backing-store (physical) pixels** — the shader multiplies it
 * directly against the canvas's `viewport_px` uniform (`canvas.width`/`canvas.height`), the
 * same convention `PointStyle.sizePx` uses (Stage 6.3 settled this as the supported
 * contract for both styles; see `PointStyle.sizePx`'s doc). Not CSS pixels — divide by
 * `devicePixelRatio` yourself if you want CSS-pixel-equivalent sizing.
 */
export interface LineStyle {
  readonly color: readonly [number, number, number, number];
  /** Line width in backing-store pixels (see interface doc — not CSS pixels). */
  readonly widthPx: number;
}

export const DEFAULT_LINE_STYLE: LineStyle = {
  color: [1.0, 0.55, 0.15, 1.0],
  widthPx: 3,
};

/** Cap matches WGSL `style_table` size in `webgpu-line-renderer.ts`. */
export const MAX_LINE_STYLES = 256;
