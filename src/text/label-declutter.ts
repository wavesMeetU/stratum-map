import type { IGlyphAtlas, TextLabel, TextLabelAnchor } from "./text-types.js";

/** Screen-space axis-aligned box (canvas pixels, origin top-left). */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DeclutterStats {
  readonly inputCount: number;
  readonly afterWorldCull: number;
  readonly afterZoom: number;
  readonly afterProject: number;
  readonly acceptedCount: number;
  readonly rejectedOffscreen: number;
  readonly rejectedZoom: number;
  readonly rejectedCollision: number;
}

export interface DeclutterDebugRects {
  readonly accepted: readonly ScreenRect[];
  readonly rejected: readonly ScreenRect[];
}

export interface DeclutterOptions {
  readonly mapToClipColumnMajor: Float32Array;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  /** Host map zoom (e.g. OL `View.getZoom()`). `null`/`undefined` skips min/max zoom filters. */
  readonly mapZoom?: number | null;
  /** Extra padding added to every collision box (layer + per-label). */
  readonly globalPaddingPx?: number;
  readonly cullExtent3857?: readonly [number, number, number, number];
  readonly cullMarginWorld?: number;
  /** When true, fill `DeclutterResult.debug` (extra allocations). */
  readonly debugRects?: boolean;
}

export interface DeclutterResult {
  readonly accepted: readonly TextLabel[];
  readonly stats: DeclutterStats;
  readonly debug?: DeclutterDebugRects;
}

interface Candidate {
  readonly label: TextLabel;
  readonly rect: { x0: number; y0: number; x1: number; y1: number };
  readonly priority: number;
  readonly id: number;
}

const DEFAULT_ANCHOR: TextLabelAnchor = "center";

function mulMapToClip(
  m: Float32Array,
  x: number,
  y: number,
): { cx: number; cy: number; cw: number } {
  const cx = m[0]! * x + m[4]! * y + m[12]!;
  const cy = m[1]! * x + m[5]! * y + m[13]!;
  const cw = m[3]! * x + m[7]! * y + m[15]!;
  return { cx, cy, cw };
}

/**
 * Project a map anchor to **canvas pixel** coordinates using the same `view_proj` convention as `text.wgsl`
 * (clip.xy = ndc * w). Returns `null` if behind the camera or invalid.
 */
export function projectMapAnchorToScreenPx(
  mapToClipColumnMajor: Float32Array,
  mapX: number,
  mapY: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
): { x: number; y: number } | null {
  const { cx, cy, cw } = mulMapToClip(mapToClipColumnMajor, mapX, mapY);
  if (!(cw > 1e-6) || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cw)) {
    return null;
  }
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const w = Math.max(1, viewportWidthPx);
  const h = Math.max(1, viewportHeightPx);
  const sx = (ndcX * 0.5 + 0.5) * w;
  const sy = (0.5 - ndcY * 0.5) * h;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    return null;
  }
  return { x: sx, y: sy };
}

function intersectsWorldExtent(
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

function sanitizeCode(code: number): number {
  if (code < 32 || code > 126) {
    return 63;
  }
  return code;
}

/** Horizontal text span and line height in **CSS pixels** (matches `text-layout` scaling). */
export function estimateLabelTextMetrics(
  label: TextLabel,
  atlas: IGlyphAtlas,
): { widthPx: number; heightPx: number } {
  const sizePx = Math.max(4, Math.min(96, label.sizePx));
  const em = atlas.cellEmPx;
  const scale = sizePx / em;
  const text = label.text;
  if (text.length === 0) {
    return { widthPx: sizePx * 0.35, heightPx: sizePx * 1.15 };
  }
  let pen = 0;
  let maxTop = 0;
  let maxBottom = 0;
  for (let i = 0; i < text.length; i++) {
    const m = atlas.getGlyphMetrics(sanitizeCode(text.charCodeAt(i)));
    const gy = m.bearingY * scale;
    pen += m.advance * scale;
    const gh = m.height * scale;
    maxTop = Math.max(maxTop, -gy);
    maxBottom = Math.max(maxBottom, gh + gy);
  }
  const widthPx = Math.max(pen, sizePx * 0.35);
  const heightPx = Math.max(sizePx * 1.15, maxTop + maxBottom, sizePx);
  return { widthPx, heightPx };
}

function anchorOffset(
  anchor: TextLabelAnchor,
  w: number,
  h: number,
): { ox: number; oy: number } {
  switch (anchor) {
    case "top":
      return { ox: -0.5 * w, oy: 0 };
    case "bottom":
      return { ox: -0.5 * w, oy: -h };
    case "left":
      return { ox: 0, oy: -0.5 * h };
    case "right":
      return { ox: -w, oy: -0.5 * h };
    case "center":
    default:
      return { ox: -0.5 * w, oy: -0.5 * h };
  }
}

function toScreenRect(r: { x0: number; y0: number; x1: number; y1: number }): ScreenRect {
  return {
    x: r.x0,
    y: r.y0,
    width: r.x1 - r.x0,
    height: r.y1 - r.y0,
  };
}

function rectsOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
}

const GRID_CELL_PX = 96;

/**
 * Screen-space declutter: zoom filter → world cull → project → priority sort → uniform-grid collision reject.
 * Complexity ~O(n log n + n · k) with k the average occupancy per grid cell (bounded when labels are spread).
 */
export function declutterLabels(
  labels: readonly TextLabel[],
  atlas: IGlyphAtlas,
  options: DeclutterOptions,
): DeclutterResult {
  const vw = Math.max(1, options.viewportWidthPx);
  const vh = Math.max(1, options.viewportHeightPx);
  const mat = options.mapToClipColumnMajor;
  const mapZoom = options.mapZoom;
  const globalPad = Math.max(0, options.globalPaddingPx ?? 0);
  const ext = options.cullExtent3857;
  const margin = options.cullMarginWorld ?? 0;
  const wantDebug = options.debugRects === true;

  let inputCount = 0;
  let afterWorldCull = 0;
  let afterZoom = 0;
  let afterProject = 0;
  let rejectedOffscreen = 0;
  let rejectedZoom = 0;
  let rejectedCollision = 0;

  const candidates: Candidate[] = [];
  const acceptedDebug: ScreenRect[] = wantDebug ? [] : [];
  const rejectedDebug: ScreenRect[] = wantDebug ? [] : [];

  for (const lb of labels) {
    inputCount += 1;
    if (lb.visible === false) {
      continue;
    }
    if (ext !== undefined && !intersectsWorldExtent(lb.x, lb.y, ext, margin)) {
      continue;
    }
    afterWorldCull += 1;

    if (mapZoom !== undefined && mapZoom !== null) {
      const z = mapZoom;
      if (lb.minZoom !== undefined && z < lb.minZoom) {
        rejectedZoom += 1;
        continue;
      }
      if (lb.maxZoom !== undefined && z > lb.maxZoom) {
        rejectedZoom += 1;
        continue;
      }
    }
    afterZoom += 1;

    const scr = projectMapAnchorToScreenPx(mat, lb.x, lb.y, vw, vh);
    if (scr === null) {
      rejectedOffscreen += 1;
      continue;
    }

    const { widthPx, heightPx } = estimateLabelTextMetrics(lb, atlas);
    const anchor = lb.anchor ?? DEFAULT_ANCHOR;
    const { ox, oy } = anchorOffset(anchor, widthPx, heightPx);
    const pad = globalPad + Math.max(0, lb.paddingPx ?? 0);
    const x0 = scr.x + ox - pad;
    const y0 = scr.y + oy - pad;
    const x1 = scr.x + ox + widthPx + pad;
    const y1 = scr.y + oy + heightPx + pad;

    if (x1 < 0 || y1 < 0 || x0 > vw || y0 > vh) {
      rejectedOffscreen += 1;
      if (wantDebug) {
        rejectedDebug.push(toScreenRect({ x0, y0, x1, y1 }));
      }
      continue;
    }
    afterProject += 1;

    const rect = { x0, y0, x1, y1 };
    candidates.push({
      label: lb,
      rect,
      priority: lb.priority ?? 0,
      id: lb.id,
    });
  }

  candidates.sort((a, b) => {
    const dp = b.priority - a.priority;
    if (dp !== 0) {
      return dp;
    }
    return a.id - b.id;
  });

  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const accepted: TextLabel[] = [];

  const cell = GRID_CELL_PX;
  const bucketMap = new Map<string, number[]>();

  function bucketKey(ix: number, iy: number): string {
    return `${ix},${iy}`;
  }

  function insertBuckets(rect: { x0: number; y0: number; x1: number; y1: number }, slotIndex: number): void {
    const ix0 = Math.floor(rect.x0 / cell);
    const iy0 = Math.floor(rect.y0 / cell);
    const ix1 = Math.floor((rect.x1 - 1e-6) / cell);
    const iy1 = Math.floor((rect.y1 - 1e-6) / cell);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const k = bucketKey(ix, iy);
        let arr = bucketMap.get(k);
        if (!arr) {
          arr = [];
          bucketMap.set(k, arr);
        }
        arr.push(slotIndex);
      }
    }
  }

  function collides(rect: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const ix0 = Math.floor(rect.x0 / cell);
    const iy0 = Math.floor(rect.y0 / cell);
    const ix1 = Math.floor((rect.x1 - 1e-6) / cell);
    const iy1 = Math.floor((rect.y1 - 1e-6) / cell);
    const seen = new Set<number>();
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const arr = bucketMap.get(bucketKey(ix, iy));
        if (!arr) {
          continue;
        }
        for (const si of arr) {
          if (seen.has(si)) {
            continue;
          }
          seen.add(si);
          if (rectsOverlap(rect, placed[si]!)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  for (const c of candidates) {
    if (collides(c.rect)) {
      rejectedCollision += 1;
      if (wantDebug) {
        rejectedDebug.push(toScreenRect(c.rect));
      }
      continue;
    }
    const slotIndex = placed.length;
    placed.push(c.rect);
    insertBuckets(c.rect, slotIndex);
    accepted.push(c.label);
    if (wantDebug) {
      acceptedDebug.push(toScreenRect(c.rect));
    }
  }

  const stats: DeclutterStats = {
    inputCount,
    afterWorldCull,
    afterZoom,
    afterProject,
    acceptedCount: accepted.length,
    rejectedOffscreen,
    rejectedZoom,
    rejectedCollision,
  };

  const debug: DeclutterDebugRects | undefined = wantDebug
    ? { accepted: acceptedDebug, rejected: rejectedDebug }
    : undefined;

  return { accepted, stats, debug };
}
