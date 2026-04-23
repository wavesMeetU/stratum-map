/**
 * GPU text subsystem: bitmap or MSDF via `IGlyphAtlas`; `TextRenderer` stays atlas-agnostic.
 */

/** UV rectangle in normalized atlas space [0,1]. */
export interface GlyphUv {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/**
 * Per-glyph metrics in **atlas pixel space** (bitmap cell or MSDF glyph quad).
 */
export interface GlyphMetrics {
  readonly advance: number;
  readonly bearingX: number;
  readonly bearingY: number;
  readonly width: number;
  readonly height: number;
  readonly uvRect: GlyphUv;
}

export type AtlasFamily = "bitmap" | "msdf";

/**
 * Atlas backend for `TextRenderer`. MSDF: implement `sdfPixelRange`, linear `atlasSampleModes`, `family: 'msdf'`.
 */
export interface IGlyphAtlas {
  readonly family: AtlasFamily;
  /** Reference em square in pixels used to scale `sizePx` → layout. */
  readonly cellEmPx: number;
  /** Bitmap atlases rebuild on DPR; fixed MSDF assets skip automatic DPR rescale. */
  readonly scalesWithDpr?: boolean;
  /** Distance field range used for AA (MSDF); bitmap may omit. */
  readonly sdfPixelRange?: number;
  getTextureView(): GPUTextureView;
  getGlyphMetrics(code: number): GlyphMetrics;
  atlasSampleModes(): { magFilter: GPUFilterMode; minFilter: GPUFilterMode };
  destroy(): void;
}

export type TextLabelAnchor = "center" | "top" | "bottom" | "left" | "right";

export interface TextLabel {
  readonly id: number;
  /** Map-space anchor (same CRS as geometry, e.g. EPSG:3857). */
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: readonly [number, number, number, number];
  /** Nominal cap / cell size in CSS pixels. */
  readonly sizePx: number;
  readonly priority?: number;
  readonly visible?: boolean;
  /** Optional halo/outline under MSDF (per glyph); 0 width skips. */
  readonly haloColor?: readonly [number, number, number, number];
  readonly haloWidthPx?: number;
  /** Declutter: hide when map zoom is below this (host zoom units, e.g. OL view). */
  readonly minZoom?: number;
  /** Declutter: hide when map zoom is above this. */
  readonly maxZoom?: number;
  /** Declutter: screen-space box origin relative to projected map anchor. */
  readonly anchor?: TextLabelAnchor;
  /** Declutter: extra collision padding in CSS pixels (adds to layer padding). */
  readonly paddingPx?: number;
}

/** Per-glyph instance: 20 floats / 80 bytes (vertex buffer). */
export const TEXT_INSTANCE_FLOAT_STRIDE = 20;

/** Uniform block size (bytes) for text pass. */
export const TEXT_FRAME_UNIFORM_BYTE_LENGTH = 96;

export interface TextViewState {
  readonly mapToClipColumnMajor: Float32Array;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  /** Overrides atlas `sdfPixelRange` when set (MSDF edge softness). */
  readonly msdfPixelRange?: number;
  /** Global outline drawn behind glyphs (MSDF path); width 0 disables. */
  readonly globalOutlineWidthPx?: number;
  readonly globalOutlineColor?: readonly [number, number, number, number];
}
