/**
 * RGBA in linear 0-1 (host may pass sRGB; document per integration).
 *
 * `widthPx` is measured in **backing-store (physical) pixels**, intentionally matching
 * `PointStyle.sizePx`'s actual (not documented) current behavior — Stage 6.1/6.2
 * empirically confirmed `PointStyle.sizePx` is applied against the backing-store
 * `viewport_px` uniform, not true CSS pixels, despite its doc comment. This type mirrors
 * that real behavior rather than introducing a second, inconsistent pixel convention.
 * Treat as internal/experimental pending a resolution of the shared point/line DPI
 * semantics — do not assume CSS-pixel behavior from the field name alone.
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
