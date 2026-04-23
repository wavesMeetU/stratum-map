/**
 * Synthetic large point set + continuous pan/zoom-style matrix updates.
 * Results on `window.__panZoomBenchResult` for Playwright.
 */
import {
  createWebGpuPointsRenderer,
  type WebGpuPointsRenderer,
} from "../../src/renderer/webgpu-points-renderer.js";

export interface PanZoomBenchResult {
  readonly ok: boolean;
  readonly skipped: boolean;
  readonly reason?: string;
  readonly pointCount: number;
  readonly frames: number;
  readonly durationMs: number;
  /** Mean frame CPU time (rAF delta). */
  readonly meanFrameMs: number;
  readonly p95FrameMs: number;
  readonly maxFrameMs: number;
}

declare global {
  interface Window {
    __panZoomBenchResult?: PanZoomBenchResult;
    __panZoomBenchPromise?: Promise<PanZoomBenchResult>;
  }
}

const POINT_COUNT = 100_000;
const BENCH_FRAMES = 240;
const P95_BUDGET_MS = 48;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[idx];
}

function buildPoints(n: number): {
  positions: Float32Array;
  featureIds: Uint32Array;
  styleIds: Uint16Array;
} {
  const positions = new Float32Array(n * 2);
  const featureIds = new Uint32Array(n);
  const pad = n + (n % 2);
  const styleIds = new Uint16Array(pad);
  for (let i = 0; i < n; i++) {
    positions[i * 2] = Math.random() * 2 - 1;
    positions[i * 2 + 1] = Math.random() * 2 - 1;
    featureIds[i] = i;
    styleIds[i] = 0;
  }
  return { positions, featureIds, styleIds };
}

/** Column-major 4×4: scale + translation in clip space (pan / zoom). */
function panZoomMatrix(t: number, out: Float32Array): void {
  const tx = Math.sin(t * 0.031) * 0.35;
  const ty = Math.cos(t * 0.027) * 0.28;
  const s = 0.85 + 0.15 * Math.sin(t * 0.019);
  out.fill(0);
  out[0] = s;
  out[5] = s;
  out[10] = 1;
  out[12] = tx;
  out[13] = ty;
  out[15] = 1;
}

async function runBench(canvas: HTMLCanvasElement): Promise<PanZoomBenchResult> {
  if (!navigator.gpu) {
    return {
      ok: true,
      skipped: true,
      reason: "WebGPU unavailable (skip automated perf gate)",
      pointCount: POINT_COUNT,
      frames: 0,
      durationMs: 0,
      meanFrameMs: 0,
      p95FrameMs: 0,
      maxFrameMs: 0,
    };
  }

  let renderer: WebGpuPointsRenderer;
  const initTimeoutMs = 45_000;
  try {
    renderer = await Promise.race([
      createWebGpuPointsRenderer({ canvas }),
      new Promise<WebGpuPointsRenderer>((_, reject) =>
        setTimeout(() => reject(new Error("WebGPU init timeout")), initTimeoutMs),
      ),
    ]);
  } catch (e) {
    return {
      ok: false,
      skipped: true,
      reason: `WebGPU init failed: ${String(e)}`,
      pointCount: POINT_COUNT,
      frames: 0,
      durationMs: 0,
      meanFrameMs: 0,
      p95FrameMs: 0,
      maxFrameMs: 0,
    };
  }

  renderer.useSingleGeometryLayout();
  const { positions, featureIds, styleIds } = buildPoints(POINT_COUNT);
  renderer.setGeometry({
    buffer: { positions, featureIds, styleIds },
    vertexCount: POINT_COUNT,
  });

  const mat = new Float32Array(16);
  const deltas: number[] = [];
  let frame = 0;
  let t0 = performance.now();
  let last = 0;

  const frameLoopMs = 90_000;
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const matForFrame = (f: number) => panZoomMatrix(f * 0.9, mat);

      const tick = (now: number) => {
        try {
          if (frame >= BENCH_FRAMES) {
            resolve();
            return;
          }
          if (frame > 0) {
            deltas.push(now - last);
          }
          last = now;
          matForFrame(frame);
          renderer.setMapToClipMatrix(mat);
          renderer.render({ timeMs: now });
          frame += 1;
          requestAnimationFrame(tick);
        } catch (e) {
          reject(e);
        }
      };
      requestAnimationFrame(tick);
    }),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Frame loop timeout")), frameLoopMs),
    ),
  ]);

  const durationMs = performance.now() - t0;
  renderer.release();

  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = deltas.reduce((a, b) => a + b, 0);
  const meanFrameMs = sum / deltas.length;
  const p95FrameMs = percentile(sorted, 0.95);
  const maxFrameMs = sorted[sorted.length - 1] ?? 0;

  const ok = p95FrameMs <= P95_BUDGET_MS;

  return {
    ok,
    skipped: false,
    pointCount: POINT_COUNT,
    frames: BENCH_FRAMES,
    durationMs,
    meanFrameMs,
    p95FrameMs,
    maxFrameMs,
  };
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const out = document.getElementById("out") as HTMLPreElement;

function failResult(reason: string): PanZoomBenchResult {
  return {
    ok: false,
    skipped: true,
    reason,
    pointCount: POINT_COUNT,
    frames: 0,
    durationMs: 0,
    meanFrameMs: 0,
    p95FrameMs: 0,
    maxFrameMs: 0,
  };
}

window.__panZoomBenchPromise = runBench(canvas)
  .then((r) => {
    window.__panZoomBenchResult = r;
    out.textContent = JSON.stringify(r, null, 2);
    return r;
  })
  .catch((e) => {
    const r = failResult(`bench error: ${e instanceof Error ? e.message : String(e)}`);
    window.__panZoomBenchResult = r;
    out.textContent = JSON.stringify(r, null, 2);
    console.error(e);
    return r;
  });
