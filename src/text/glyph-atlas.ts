import type { AtlasFamily, GlyphMetrics, GlyphUv, IGlyphAtlas } from "./text-types.js";

const ASCII_FIRST = 32;
const ASCII_LAST = 126;
const GRID_COLS = 16;
const GRID_ROWS = 6;

/**
 * Raster ASCII atlas (32–126) on a fixed grid. Implements `IGlyphAtlas` for `TextRenderer`.
 *
 * MSDF path (later): implement the same interface with `family: 'msdf'`, precomputed SDF texture,
 * `atlasSampleModes()` → linear, and fragment shader median-of-three; metrics from font shaping.
 */
export class GlyphAtlas implements IGlyphAtlas {
  readonly family: AtlasFamily = "bitmap";
  readonly scalesWithDpr = true as const;
  readonly cols = GRID_COLS;
  readonly rows = GRID_ROWS;
  readonly cellEmPx: number;
  private readonly texture: globalThis.GPUTexture;
  private readonly textureView: GPUTextureView;
  private readonly metricsByCode: GlyphMetrics[];

  private constructor(
    texture: globalThis.GPUTexture,
    textureView: GPUTextureView,
    metricsByCode: GlyphMetrics[],
    cellPx: number,
  ) {
    this.texture = texture;
    this.textureView = textureView;
    this.metricsByCode = metricsByCode;
    this.cellEmPx = cellPx;
  }

  static create(device: GPUDevice, dpr = 1): GlyphAtlas {
    const dprClamped = Math.max(0.5, Math.min(4, dpr));
    const fontPx = Math.max(10, Math.round(16 * dprClamped));
    const cellPx = Math.ceil(fontPx * 1.25);
    const atlasW = cellPx * GRID_COLS;
    const atlasH = cellPx * GRID_ROWS;

    const osc = new OffscreenCanvas(atlasW, atlasH);
    const ctx = osc.getContext("2d");
    if (!ctx) {
      throw new Error("GlyphAtlas: 2D OffscreenCanvas unsupported");
    }
    ctx.clearRect(0, 0, atlasW, atlasH);

    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `${fontPx}px ui-monospace, monospace`;
    ctx.fillStyle = "#ffffff";

    let advancePx = Math.ceil(cellPx * 0.62);
    for (let c = ASCII_FIRST; c <= ASCII_LAST; c++) {
      const w = ctx.measureText(String.fromCharCode(c)).width;
      advancePx = Math.max(advancePx, Math.ceil(w) + 2);
    }
    advancePx = Math.min(advancePx, cellPx - 1);

    const idx = (code: number) => code - ASCII_FIRST;
    for (let code = ASCII_FIRST; code <= ASCII_LAST; code++) {
      const i = idx(code);
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const cx = col * cellPx + cellPx * 0.5;
      const cy = row * cellPx + cellPx * 0.5;
      ctx.fillText(String.fromCharCode(code), cx, cy);
    }

    const texture = device.createTexture({
      size: [atlasW, atlasH, 1],
      format: "rgba8unorm",
      // Chromium may use an internal render pass for copyExternalImageToTexture (color space / Y-flip).
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const textureView = texture.createView();

    device.queue.copyExternalImageToTexture(
      { source: osc },
      { texture },
      [atlasW, atlasH],
    );

    const metricsByCode = GlyphAtlas.buildMetricsTable(cellPx, advancePx);
    return new GlyphAtlas(texture, textureView, metricsByCode, cellPx);
  }

  private static buildMetricsTable(cellPx: number, advancePx: number): GlyphMetrics[] {
    const out: GlyphMetrics[] = new Array(128);
    const fallbackUv: GlyphUv = {
      u0: 0,
      v0: 0,
      u1: 1 / GRID_COLS,
      v1: 1 / GRID_ROWS,
    };
    const fallback: GlyphMetrics = {
      advance: advancePx,
      bearingX: 0,
      bearingY: 0,
      width: cellPx,
      height: cellPx,
      uvRect: fallbackUv,
    };
    for (let c = 0; c < 128; c++) {
      out[c] = fallback;
    }
    for (let code = ASCII_FIRST; code <= ASCII_LAST; code++) {
      const i = code - ASCII_FIRST;
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const uvRect: GlyphUv = {
        u0: col / GRID_COLS,
        u1: (col + 1) / GRID_COLS,
        v0: row / GRID_ROWS,
        v1: (row + 1) / GRID_ROWS,
      };
      out[code] = {
        advance: advancePx,
        bearingX: 0,
        bearingY: 0,
        width: cellPx,
        height: cellPx,
        uvRect,
      };
    }
    return out;
  }

  getTextureView(): GPUTextureView {
    return this.textureView;
  }

  getGlyphMetrics(code: number): GlyphMetrics {
    const c = code < 0 || code > 127 ? 63 : code;
    return this.metricsByCode[c]!;
  }

  atlasSampleModes(): { magFilter: GPUFilterMode; minFilter: GPUFilterMode } {
    return { magFilter: "nearest", minFilter: "nearest" };
  }

  destroy(): void {
    this.texture.destroy();
  }
}
