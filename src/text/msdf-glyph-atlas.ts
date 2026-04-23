import { parseMsdfAtlasJson, type MsdfAtlasJsonV1 } from "./msdf-atlas-loader.js";
import type { AtlasFamily, GlyphMetrics, GlyphUv, IGlyphAtlas } from "./text-types.js";

const FALLBACK_CODE = 63;

/**
 * GPU MSDF atlas from pre-rasterized PNG + layout JSON (`parseMsdfAtlasJson`).
 * Swap into `TextLayer.replaceAtlas(...)` without changing `TextRenderer`.
 */
export class MsdfGlyphAtlas implements IGlyphAtlas {
  readonly family: AtlasFamily = "msdf";
  readonly cellEmPx: number;
  readonly scalesWithDpr = false as const;
  readonly sdfPixelRange: number;
  private readonly texture: globalThis.GPUTexture;
  private readonly textureView: GPUTextureView;
  private readonly metricsByCode: GlyphMetrics[];

  private constructor(
    texture: globalThis.GPUTexture,
    textureView: GPUTextureView,
    metricsByCode: GlyphMetrics[],
    cellEmPx: number,
    sdfPixelRange: number,
  ) {
    this.texture = texture;
    this.textureView = textureView;
    this.metricsByCode = metricsByCode;
    this.cellEmPx = cellEmPx;
    this.sdfPixelRange = sdfPixelRange;
  }

  /**
   * Uploads RGBA MSDF (or mono-MSDF with R=G=B) from an `ImageBitmap` / `HTMLImageElement` / `OffscreenCanvas`.
   */
  static fromJsonAndImageSource(
    device: GPUDevice,
    json: MsdfAtlasJsonV1,
    imageSource: TexImageSource,
  ): MsdfGlyphAtlas {
    const w = json.atlas.width;
    const h = json.atlas.height;
    const sdfRange = json.atlas.distanceRange ?? 4;
    const texture = device.createTexture({
      size: [w, h, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const textureView = texture.createView();
    device.queue.copyExternalImageToTexture({ source: imageSource }, { texture }, [w, h]);

    const metricsByCode = MsdfGlyphAtlas.buildMetrics(json, w, h);
    const em = json.metrics.emSize;
    return new MsdfGlyphAtlas(texture, textureView, metricsByCode, em, sdfRange);
  }

  private static buildMetrics(json: MsdfAtlasJsonV1, atlasW: number, atlasH: number): GlyphMetrics[] {
    const out: GlyphMetrics[] = new Array(128);
    const fallback = MsdfGlyphAtlas.glyphToMetrics(
      {
        unicode: FALLBACK_CODE,
        advance: json.metrics.emSize * 0.5,
        atlasBounds: { left: 0, top: 0, right: json.metrics.emSize, bottom: json.metrics.emSize },
      },
      atlasW,
      atlasH,
    );
    for (let c = 0; c < 128; c++) {
      out[c] = fallback;
    }
    for (const g of json.glyphs) {
      if (g.unicode >= 0 && g.unicode < 128) {
        out[g.unicode] = MsdfGlyphAtlas.glyphToMetrics(g, atlasW, atlasH);
      }
    }
    return out;
  }

  private static glyphToMetrics(
    g: { unicode: number; advance: number; atlasBounds: { left: number; top: number; right: number; bottom: number } },
    atlasW: number,
    atlasH: number,
  ): GlyphMetrics {
    const b = g.atlasBounds;
    const gw = Math.max(1, b.right - b.left);
    const gh = Math.max(1, b.bottom - b.top);
    const uvRect: GlyphUv = {
      u0: b.left / atlasW,
      v0: b.top / atlasH,
      u1: b.right / atlasW,
      v1: b.bottom / atlasH,
    };
    return {
      advance: g.advance,
      bearingX: 0,
      bearingY: 0,
      width: gw,
      height: gh,
      uvRect,
    };
  }

  getTextureView(): GPUTextureView {
    return this.textureView;
  }

  getGlyphMetrics(code: number): GlyphMetrics {
    const c = code < 0 || code > 127 ? FALLBACK_CODE : code;
    return this.metricsByCode[c]!;
  }

  atlasSampleModes(): { magFilter: GPUFilterMode; minFilter: GPUFilterMode } {
    return { magFilter: "linear", minFilter: "linear" };
  }

  destroy(): void {
    this.texture.destroy();
  }
}

/**
 * Fetch JSON + PNG (same-origin or CORS-enabled). Returns `null` on any failure (demo falls back to bitmap).
 */
export async function tryLoadMsdfAtlasFromUrls(
  device: GPUDevice,
  jsonUrl: string,
  imageUrl: string,
): Promise<MsdfGlyphAtlas | null> {
  try {
    const [jr, ir] = await Promise.all([fetch(jsonUrl), fetch(imageUrl)]);
    if (!jr.ok || !ir.ok) {
      return null;
    }
    const json = parseMsdfAtlasJson(await jr.text());
    const blob = await ir.blob();
    const bmp = await createImageBitmap(blob);
    const atlas = MsdfGlyphAtlas.fromJsonAndImageSource(device, json, bmp);
    bmp.close?.();
    return atlas;
  } catch {
    return null;
  }
}
