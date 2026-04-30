/**
 * Deterministic WebGPU point scene for Playwright visual regression.
 * Exposes `window.__visualHarness` after GPU init + first paint.
 */
import {
  createWebGpuPointsRenderer,
  type WebGpuPointsRenderer,
} from "../../src/renderer/webgpu-points-renderer.js";

const COL_MAJOR_IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPoints(n: number, seed: number): {
  positions: Float32Array;
  featureIds: Uint32Array;
  styleIds: Uint16Array;
} {
  const rng = mulberry32(seed);
  const positions = new Float32Array(n * 2);
  const featureIds = new Uint32Array(n);
  const pad = n + (n % 2);
  const styleIds = new Uint16Array(pad);
  for (let i = 0; i < n; i++) {
    positions[i * 2] = rng() * 1.72 - 0.86;
    positions[i * 2 + 1] = rng() * 1.72 - 0.86;
    featureIds[i] = i;
    styleIds[i] = i % 2;
  }
  return { positions, featureIds, styleIds };
}

function columnMajorScale(scale: number, out: Float32Array): void {
  out.set(COL_MAJOR_IDENTITY);
  out[0] = scale;
  out[5] = scale;
}

export interface VisualHarnessApi {
  readonly ready: boolean;
  readonly skipped: boolean;
  readonly reason: string | null;
  readonly pointCount: number;
  /** Uniform scale in map→clip (larger = more zoomed in on data near origin). */
  setZoomScale(scale: number): void;
  /** Re-upload geometry; deterministic per (n, seed). */
  setPointCount(n: number, seed?: number): void;
  /** Submit another frame (after zoom / dataset changes). */
  render(): void;
}

let renderer: WebGpuPointsRenderer | null = null;
const clipMat = new Float32Array(16);
let vertexCount = 0;
let currentSeed = 0x5f3759df;

const state = {
  ready: false,
  skipped: false,
  reason: null as string | null,
  pointCount: 0,
};

function applyGeometry(n: number, seed: number): void {
  if (!renderer) return;
  const { positions, featureIds, styleIds } = buildPoints(n, seed);
  vertexCount = n;
  currentSeed = seed;
  renderer.setGeometry({
    buffer: { positions, featureIds, styleIds },
    vertexCount: n,
  });
  state.pointCount = n;
}

const api: VisualHarnessApi = {
  get ready(): boolean {
    return state.ready;
  },
  get skipped(): boolean {
    return state.skipped;
  },
  get reason(): string | null {
    return state.reason;
  },
  get pointCount(): number {
    return state.pointCount;
  },
  setZoomScale(scale: number): void {
    if (!renderer) return;
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    columnMajorScale(s, clipMat);
    renderer.setMapToClipMatrix(clipMat);
    renderer.render({ timeMs: performance.now() });
  },
  setPointCount(n: number, seed?: number): void {
    if (!renderer) return;
    const count = Math.max(0, Math.floor(n));
    const sd = seed ?? currentSeed;
    if (count === 0) {
      vertexCount = 0;
      state.pointCount = 0;
      renderer.setGeometry({
        buffer: {
          positions: new Float32Array(0),
          featureIds: new Uint32Array(0),
          styleIds: new Uint16Array(0),
        },
        vertexCount: 0,
      });
      renderer.render({ timeMs: performance.now() });
      return;
    }
    applyGeometry(count, sd);
    renderer.render({ timeMs: performance.now() });
  },
  render(): void {
    renderer?.render({ timeMs: performance.now() });
  },
};

declare global {
  interface Window {
    __visualHarness?: VisualHarnessApi;
  }
}

async function settleFrames(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function main(): Promise<void> {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement | null;
  if (!canvas) {
    state.skipped = true;
    state.reason = "missing #gpu-canvas";
    window.__visualHarness = api;
    return;
  }

  if (!navigator.gpu) {
    state.skipped = true;
    state.reason = "WebGPU unavailable";
    window.__visualHarness = api;
    return;
  }

  try {
    renderer = await createWebGpuPointsRenderer({ canvas, alphaMode: "premultiplied" });
    renderer.useSingleGeometryLayout();
    renderer.setStyleTable([
      { color: [0.92, 0.28, 0.22, 1.0], sizePx: 16 },
      { color: [0.22, 0.58, 0.96, 1.0], sizePx: 16 },
    ]);
    columnMajorScale(1, clipMat);
    renderer.setMapToClipMatrix(clipMat);
    applyGeometry(1600, 0x9e3779b9);
    renderer.render({ timeMs: 0 });
    await settleFrames();
    renderer.render({ timeMs: performance.now() });
    await settleFrames();
    state.ready = true;
  } catch (e) {
    state.skipped = true;
    state.reason = e instanceof Error ? e.message : String(e);
  }
  window.__visualHarness = api;
}

void main();
