import type { WebGpuPointsRenderer } from "../renderer/webgpu-points-renderer.js";
import { GlyphAtlas } from "./glyph-atlas.js";
import {
  declutterLabels,
  type DeclutterDebugRects,
  type DeclutterStats,
} from "./label-declutter.js";
import { layoutTextLabels } from "./text-layout.js";
import type { IGlyphAtlas, TextLabel, TextViewState } from "./text-types.js";
import { TextRenderer } from "./text-renderer.js";

export interface TextLayerOptions {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly canvas: HTMLCanvasElement;
  readonly dpr?: number;
  readonly maxGlyphs?: number;
}

/**
 * Host-facing text: labels, map matrix, cull rect, CPU layout → `TextRenderer` instance buffer.
 * Owns the bitmap `GlyphAtlas` by default; replace via `replaceAtlas(MsdfGlyphAtlas)` for MSDF.
 */
export class TextLayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly maxGlyphs: number;
  private atlas: IGlyphAtlas;
  private readonly renderer: TextRenderer;
  private labels: TextLabel[] = [];
  private cullExtent: readonly [number, number, number, number] | null = null;
  private cullMarginWorld = 0;
  private dpr: number;
  private readonly mapToClip = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  private labelsDirty = true;
  private cullDirty = true;
  private defaultHalo: { widthPx: number; color: readonly [number, number, number, number] } | null = null;
  private globalOutlineWidthPx = 0;
  private globalOutlineColor: readonly [number, number, number, number] = [0, 0, 0, 0];
  private msdfPixelRangeOverride: number | null = null;
  private declutterEnabled = false;
  private declutterPaddingPx = 4;
  private declutterDebug = false;
  private viewportWidthOverride: number | null = null;
  private viewportHeightOverride: number | null = null;
  private mapZoom: number | null = null;
  private lastDeclutterStats: DeclutterStats | null = null;
  private lastDeclutterDebug: DeclutterDebugRects | null = null;

  private constructor(
    canvas: HTMLCanvasElement,
    atlas: IGlyphAtlas,
    renderer: TextRenderer,
    maxGlyphs: number,
    dpr: number,
  ) {
    this.canvas = canvas;
    this.atlas = atlas;
    this.renderer = renderer;
    this.maxGlyphs = maxGlyphs;
    this.dpr = dpr;
  }

  static create(options: TextLayerOptions): TextLayer {
    const dpr = options.dpr ?? (globalThis.devicePixelRatio ?? 1);
    const maxGlyphs = options.maxGlyphs ?? 500_000;
    const atlas = GlyphAtlas.create(options.device, dpr);
    const renderer = TextRenderer.create({
      device: options.device,
      format: options.format,
      atlas,
    });
    return new TextLayer(options.canvas, atlas, renderer, maxGlyphs, dpr);
  }

  static createForPointsRenderer(
    r: WebGpuPointsRenderer,
    options?: { readonly dpr?: number; readonly maxGlyphs?: number },
  ): TextLayer {
    return TextLayer.create({
      device: r.getDevice(),
      format: r.getCanvasFormat(),
      canvas: r.getCanvas(),
      dpr: options?.dpr,
      maxGlyphs: options?.maxGlyphs,
    });
  }

  /** Default halo when labels omit `haloWidthPx` / `haloColor`. */
  setDefaultHalo(style: { widthPx: number; color: readonly [number, number, number, number] } | null): void {
    const next = style === null ? null : { widthPx: style.widthPx, color: style.color };
    if (
      (this.defaultHalo === null && next === null) ||
      (this.defaultHalo !== null &&
        next !== null &&
        this.defaultHalo.widthPx === next.widthPx &&
        this.defaultHalo.color[0] === next.color[0] &&
        this.defaultHalo.color[1] === next.color[1] &&
        this.defaultHalo.color[2] === next.color[2] &&
        this.defaultHalo.color[3] === next.color[3])
    ) {
      return;
    }
    this.defaultHalo = next;
    this.labelsDirty = true;
  }

  /** Global outline (uniform); complements per-label halo in MSDF mode. */
  setGlobalOutline(style: {
    widthPx: number;
    color: readonly [number, number, number, number];
  } | null): void {
    if (style === null) {
      this.globalOutlineWidthPx = 0;
      this.globalOutlineColor = [0, 0, 0, 0];
      return;
    }
    this.globalOutlineWidthPx = style.widthPx;
    this.globalOutlineColor = style.color;
  }

  /** Optional override for MSDF edge softness (see atlas `sdfPixelRange`). */
  setMsdfPixelRange(pxRange: number | null): void {
    this.msdfPixelRangeOverride = pxRange;
  }

  /** When enabled, labels are filtered each rebuild by screen overlap (priority wins). */
  setDeclutterEnabled(enabled: boolean): void {
    if (enabled === this.declutterEnabled) {
      return;
    }
    this.declutterEnabled = enabled;
    this.labelsDirty = true;
  }

  /** Extra collision padding in CSS pixels (added to each label’s own `paddingPx`). */
  setDeclutterPadding(px: number): void {
    const v = Math.max(0, px);
    if (v === this.declutterPaddingPx) {
      return;
    }
    this.declutterPaddingPx = v;
    if (this.declutterEnabled) {
      this.labelsDirty = true;
    }
  }

  /** Optional viewport override for declutter projection; `null` uses backing-store canvas size. */
  setViewport(widthPx: number | null, heightPx: number | null): void {
    if (this.viewportWidthOverride === widthPx && this.viewportHeightOverride === heightPx) {
      return;
    }
    this.viewportWidthOverride = widthPx;
    this.viewportHeightOverride = heightPx;
    if (this.declutterEnabled) {
      this.labelsDirty = true;
    }
  }

  /** Map zoom for `minZoom` / `maxZoom` filtering (e.g. OL `view.getZoom()`). `null` disables zoom gating. */
  setMapZoom(zoom: number | null): void {
    if (zoom === this.mapZoom) {
      return;
    }
    this.mapZoom = zoom;
    if (this.declutterEnabled) {
      this.labelsDirty = true;
    }
  }

  /** Collect screen-space debug rects on the next declutter pass (small overhead). */
  setDeclutterDebug(enabled: boolean): void {
    if (enabled === this.declutterDebug) {
      return;
    }
    this.declutterDebug = enabled;
    if (this.declutterEnabled) {
      this.labelsDirty = true;
    }
  }

  /** Stats from the last `rebuildInstancesIfDirty` when declutter is enabled; otherwise `null`. */
  getLastDeclutterStats(): DeclutterStats | null {
    return this.lastDeclutterStats;
  }

  /** Debug rects from the last declutter pass when `setDeclutterDebug(true)`; otherwise `null`. */
  getDeclutterDebugRects(): DeclutterDebugRects | null {
    return this.lastDeclutterDebug;
  }

  setLabels(labels: readonly TextLabel[]): void {
    if (labelsEqual(this.labels, labels)) {
      return;
    }
    this.labels = labels.length === 0 ? [] : labels.slice();
    this.labelsDirty = true;
  }

  updateMapMatrix(columnMajor4x4: Float32Array): void {
    this.mapToClip.set(columnMajor4x4);
    if (this.declutterEnabled) {
      this.labelsDirty = true;
    }
  }

  setCullExtent(extent3857: readonly [number, number, number, number] | null, marginWorld = 0): void {
    if (extentApproxEqual(this.cullExtent, extent3857) && marginWorld === this.cullMarginWorld) {
      return;
    }
    this.cullExtent = extent3857 === null ? null : extent3857;
    this.cullMarginWorld = marginWorld;
    this.cullDirty = true;
    this.labelsDirty = true;
  }

  /** Marks layout stale (e.g. after moving a spatial index without changing label strings). */
  cullOffscreen(): void {
    this.labelsDirty = true;
  }

  rebuildInstancesIfDirty(): void {
    if (!this.labelsDirty && !this.cullDirty) {
      return;
    }
    const vw = this.viewportWidthOverride ?? this.canvas.width;
    const vh = this.viewportHeightOverride ?? this.canvas.height;
    let labelsForLayout: readonly TextLabel[] = this.labels;
    if (this.declutterEnabled) {
      const r = declutterLabels(this.labels, this.atlas, {
        mapToClipColumnMajor: this.mapToClip,
        viewportWidthPx: vw,
        viewportHeightPx: vh,
        mapZoom: this.mapZoom,
        globalPaddingPx: this.declutterPaddingPx,
        cullExtent3857: this.cullExtent ?? undefined,
        cullMarginWorld: this.cullMarginWorld,
        debugRects: this.declutterDebug,
      });
      labelsForLayout = r.accepted;
      this.lastDeclutterStats = r.stats;
      this.lastDeclutterDebug = r.debug ?? null;
    } else {
      this.lastDeclutterStats = null;
      this.lastDeclutterDebug = null;
    }
    const { instanceData, instanceCount } = layoutTextLabels(labelsForLayout, this.atlas, {
      cullExtent3857: this.cullExtent ?? undefined,
      cullMarginWorld: this.cullMarginWorld,
      maxGlyphs: this.maxGlyphs,
      defaultHalo: this.defaultHalo ?? undefined,
    });
    this.renderer.setGlyphInstances(instanceData, instanceCount);
    this.labelsDirty = false;
    this.cullDirty = false;
  }

  render(pass: GPURenderPassEncoder): void {
    this.rebuildInstancesIfDirty();
    const vs: TextViewState = {
      mapToClipColumnMajor: this.mapToClip,
      viewportWidthPx: this.viewportWidthOverride ?? this.canvas.width,
      viewportHeightPx: this.viewportHeightOverride ?? this.canvas.height,
      msdfPixelRange: this.msdfPixelRangeOverride ?? undefined,
      globalOutlineWidthPx: this.globalOutlineWidthPx,
      globalOutlineColor: this.globalOutlineColor,
    };
    this.renderer.render(pass, vs);
  }

  /**
   * DPR-driven atlas rebuild for **bitmap** atlases only. MSDF prebuilts (`scalesWithDpr === false`) skip GPU rebuild.
   */
  resize(): void {
    if (this.atlas.scalesWithDpr !== false) {
      const nextDpr = globalThis.devicePixelRatio ?? 1;
      if (Math.abs(nextDpr - this.dpr) >= 0.08) {
        this.dpr = nextDpr;
        this.atlas.destroy();
        this.atlas = GlyphAtlas.create(this.renderer.getDevice(), this.dpr);
        this.renderer.rebindAtlas(this.atlas);
        this.labelsDirty = true;
      }
    }
    if (this.declutterEnabled) {
      this.labelsDirty = true;
    }
  }

  /** Swap in an `IGlyphAtlas` implementation (e.g. `MsdfGlyphAtlas`). Caller must destroy the previous atlas if replaced. */
  replaceAtlas(atlas: IGlyphAtlas): void {
    this.atlas = atlas;
    this.renderer.rebindAtlas(atlas);
    this.labelsDirty = true;
  }

  /** Current atlas (bitmap or MSDF); use before `replaceAtlas` if you must `destroy()` the outgoing instance. */
  getAtlas(): IGlyphAtlas {
    return this.atlas;
  }

  destroy(): void {
    this.atlas.destroy();
    this.renderer.destroy();
  }
}

export function createTextLayer(options: TextLayerOptions): TextLayer {
  return TextLayer.create(options);
}

export function createTextLayerForPointsRenderer(
  renderer: WebGpuPointsRenderer,
  options?: { readonly dpr?: number; readonly maxGlyphs?: number },
): TextLayer {
  return TextLayer.createForPointsRenderer(renderer, options);
}

function extentApproxEqual(
  a: readonly [number, number, number, number] | null,
  b: readonly [number, number, number, number] | null,
  eps = 1e-3,
): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return (
    Math.abs(a[0] - b[0]) < eps &&
    Math.abs(a[1] - b[1]) < eps &&
    Math.abs(a[2] - b[2]) < eps &&
    Math.abs(a[3] - b[3]) < eps
  );
}

function haloEqual(
  a?: readonly [number, number, number, number],
  b?: readonly [number, number, number, number],
): boolean {
  const ax = a ?? [0, 0, 0, 0];
  const bx = b ?? [0, 0, 0, 0];
  return ax[0] === bx[0] && ax[1] === bx[1] && ax[2] === bx[2] && ax[3] === bx[3];
}

function labelsEqual(a: readonly TextLabel[], b: readonly TextLabel[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.text !== y.text ||
      x.sizePx !== y.sizePx ||
      x.color[0] !== y.color[0] ||
      x.color[1] !== y.color[1] ||
      x.color[2] !== y.color[2] ||
      x.color[3] !== y.color[3] ||
      (x.visible ?? true) !== (y.visible ?? true) ||
      (x.priority ?? 0) !== (y.priority ?? 0) ||
      (x.haloWidthPx ?? 0) !== (y.haloWidthPx ?? 0) ||
      !haloEqual(x.haloColor, y.haloColor) ||
      (x.minZoom ?? null) !== (y.minZoom ?? null) ||
      (x.maxZoom ?? null) !== (y.maxZoom ?? null) ||
      (x.anchor ?? "center") !== (y.anchor ?? "center") ||
      (x.paddingPx ?? 0) !== (y.paddingPx ?? 0)
    ) {
      return false;
    }
  }
  return true;
}
