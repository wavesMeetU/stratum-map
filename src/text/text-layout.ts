import type { IGlyphAtlas, TextLabel } from "./text-types.js";
import { TEXT_INSTANCE_FLOAT_STRIDE } from "./text-types.js";

export interface LayoutTextOptions {
  readonly cullExtent3857?: readonly [number, number, number, number];
  readonly cullMarginWorld?: number;
  readonly maxGlyphs?: number;
  /** Default per-glyph halo when a label omits `haloWidthPx` / `haloColor`. */
  readonly defaultHalo?: {
    readonly widthPx: number;
    readonly color: readonly [number, number, number, number];
  };
}

function sanitizeCharCode(code: number): number {
  if (code < 32 || code > 126) {
    return 63;
  }
  return code;
}

function intersectsExtent(
  x: number,
  y: number,
  ext: readonly [number, number, number, number],
  margin: number,
): boolean {
  const loX = Math.min(ext[0], ext[2]) - margin;
  const hiX = Math.max(ext[0], ext[2]) + margin;
  const loY = Math.min(ext[1], ext[3]) - margin;
  const hiY = Math.max(ext[1], ext[3]) + margin;
  return x >= loX && x <= hiX && y >= loY && y <= hiY;
}

function labelSortKey(lb: TextLabel): number {
  return -(lb.priority ?? 0);
}

/**
 * CPU layout: labels → interleaved glyph instances (80-byte stride).
 */
export function layoutTextLabels(
  labels: readonly TextLabel[],
  atlas: IGlyphAtlas,
  options?: LayoutTextOptions,
): { instanceData: Float32Array; instanceCount: number } {
  const maxGlyphs = options?.maxGlyphs ?? 400_000;
  const margin = options?.cullMarginWorld ?? 0;
  const ext = options?.cullExtent3857;
  const defHalo = options?.defaultHalo;

  const sorted = labels.slice().sort((a, b) => {
    const d = labelSortKey(a) - labelSortKey(b);
    if (d !== 0) {
      return d;
    }
    return a.id - b.id;
  });

  let glyphTotal = 0;
  for (const lb of sorted) {
    if (lb.visible === false) {
      continue;
    }
    if (ext !== undefined && !intersectsExtent(lb.x, lb.y, ext, margin)) {
      continue;
    }
    glyphTotal += lb.text.length;
  }
  const alloc = Math.min(Math.max(glyphTotal, 1), maxGlyphs);
  const out = new Float32Array(alloc * TEXT_INSTANCE_FLOAT_STRIDE);
  let o = 0;
  let written = 0;
  const em = atlas.cellEmPx;

  for (const lb of sorted) {
    if (written >= maxGlyphs) {
      break;
    }
    if (lb.visible === false) {
      continue;
    }
    if (ext !== undefined && !intersectsExtent(lb.x, lb.y, ext, margin)) {
      continue;
    }
    const sizePx = Math.max(4, Math.min(96, lb.sizePx));
    const scale = sizePx / em;
    let pen = 0;
    const text = lb.text;
    const hw = lb.haloWidthPx ?? defHalo?.widthPx ?? 0;
    const hc = lb.haloColor ?? defHalo?.color ?? ([0, 0, 0, 0] as const);
    for (let i = 0; i < text.length; i++) {
      if (written >= maxGlyphs) {
        break;
      }
      const code = sanitizeCharCode(text.charCodeAt(i));
      const m = atlas.getGlyphMetrics(code);
      const gx = pen + m.bearingX * scale;
      const gy = m.bearingY * scale;
      pen += m.advance * scale;
      const uv = m.uvRect;
      const base = o;
      out[base + 0] = lb.x;
      out[base + 1] = lb.y;
      out[base + 2] = gx;
      out[base + 3] = gy;
      out[base + 4] = lb.color[0]!;
      out[base + 5] = lb.color[1]!;
      out[base + 6] = lb.color[2]!;
      out[base + 7] = lb.color[3]!;
      out[base + 8] = uv.u0;
      out[base + 9] = uv.v0;
      out[base + 10] = uv.u1;
      out[base + 11] = uv.v1;
      out[base + 12] = hc[0]!;
      out[base + 13] = hc[1]!;
      out[base + 14] = hc[2]!;
      out[base + 15] = hc[3]!;
      out[base + 16] = sizePx;
      out[base + 17] = hw;
      out[base + 18] = 0;
      out[base + 19] = 0;
      o += TEXT_INSTANCE_FLOAT_STRIDE;
      written += 1;
    }
  }

  return { instanceData: out, instanceCount: written };
}
