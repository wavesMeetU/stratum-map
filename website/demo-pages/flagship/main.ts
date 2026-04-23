/**
 * Flagship demo: OpenLayers + WebGPU points (100k+), FPS readout, style controls.
 * Built into `static/demo/` for GitHub Pages with relative asset URLs (`base: "./"`).
 */
import { createWebGpuPointsRenderer, type PointStyle } from "stratum-map";
import type { WebGpuPointsRenderer } from "stratum-map";
import Map, { type FrameState } from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { fromLonLat } from "ol/proj.js";

function frameStateToClipMatrix(fs: FrameState, out: Float32Array): void {
  const t = fs.coordinateToPixelTransform;
  const w = fs.size[0];
  const h = fs.size[1];
  const ax = (2 / w) * t[0]!;
  const bx = (2 / w) * t[2]!;
  const cx = (2 / w) * t[4]! - 1;
  const ay = (-2 / h) * t[1]!;
  const by = (-2 / h) * t[3]!;
  const cy = 1 - (2 / h) * t[5]!;
  out[0] = ax;
  out[1] = ay;
  out[2] = 0;
  out[3] = 0;
  out[4] = bx;
  out[5] = by;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = cx;
  out[13] = cy;
  out[14] = 0;
  out[15] = 1;
}

const D2R = Math.PI / 180;
const MERC_MAX = 20037508.34;

function lonLatTo3857(lon: number, lat: number, out: Float32Array, o: number): void {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lon * MERC_MAX) / 180;
  const y = (Math.log(Math.tan(Math.PI / 4 + (clampedLat * D2R) / 2)) / D2R) * (MERC_MAX / 180);
  out[o] = x;
  out[o + 1] = y;
}

function hexToRgba(hex: string): readonly [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.2, 0.5, 1, 1];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

async function fillPoints(
  count: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const chunk = 48_000;
  let i = 0;
  while (i < count) {
    const end = Math.min(i + chunk, count);
    for (; i < end; i++) {
      const lon = Math.random() * 360 - 180;
      const lat = (Math.random() - 0.5) * 2 * 85.05112878;
      lonLatTo3857(lon, lat, positions, i * 2);
      featureIds[i] = i;
      styleIds[i] = i & 1;
    }
    onProgress(i, count);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

function main(): void {
  const mapEl = document.getElementById("map");
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement | null;
  const statFps = document.getElementById("stat-fps");
  const statPoints = document.getElementById("stat-points");
  const statFrame = document.getElementById("stat-frame");
  const statWebgpu = document.getElementById("stat-webgpu");
  const ptCount = document.getElementById("pt-count") as HTMLInputElement | null;
  const ptCountVal = document.getElementById("pt-count-val");
  const colA = document.getElementById("col-a") as HTMLInputElement | null;
  const colB = document.getElementById("col-b") as HTMLInputElement | null;
  const sizeA = document.getElementById("size-a") as HTMLInputElement | null;
  const sizeB = document.getElementById("size-b") as HTMLInputElement | null;
  const sizeAVal = document.getElementById("size-a-val");
  const sizeBVal = document.getElementById("size-b-val");
  const btnRegen = document.getElementById("btn-regen");
  if (
    !mapEl ||
    !canvas ||
    !statFps ||
    !statPoints ||
    !statFrame ||
    !statWebgpu ||
    !ptCount ||
    !ptCountVal ||
    !colA ||
    !colB ||
    !sizeA ||
    !sizeB ||
    !sizeAVal ||
    !sizeBVal ||
    !btnRegen
  ) {
    return;
  }

  const map = new Map({
    target: mapEl,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({
      center: fromLonLat([0, 20]),
      zoom: 2.2,
      minZoom: 1,
      maxZoom: 18,
    }),
  });

  const overlay = map.getOverlayContainer();
  overlay.insertBefore(canvas, overlay.firstChild);

  const clipMat = new Float32Array(16);
  const fpsSamples: number[] = [];
  let lastFrameT = performance.now();

  let renderer: WebGpuPointsRenderer | null = null;
  let positions = new Float32Array(0);
  let featureIds = new Uint32Array(0);
  let styleIds = new Uint16Array(0);
  let vertexCount = 0;

  const getStyles = (): readonly [PointStyle, PointStyle] => [
    { color: hexToRgba(colA.value), sizePx: Number(sizeA.value) },
    { color: hexToRgba(colB.value), sizePx: Number(sizeB.value) },
  ];

  const syncLabels = () => {
    ptCountVal.textContent = ptCount.value;
    sizeAVal.textContent = sizeA.value;
    sizeBVal.textContent = sizeB.value;
  };
  syncLabels();
  ptCount.addEventListener("input", syncLabels);
  sizeA.addEventListener("input", syncLabels);
  sizeB.addEventListener("input", syncLabels);

  const applyStylesOnly = () => {
    if (!renderer || vertexCount === 0) return;
    renderer.setStyleTable(getStyles());
    map.render();
  };
  colA.addEventListener("input", applyStylesOnly);
  colB.addEventListener("input", applyStylesOnly);
  sizeA.addEventListener("input", applyStylesOnly);
  sizeB.addEventListener("input", applyStylesOnly);

  const regen = async () => {
    const n = Number(ptCount.value);
    if (!renderer || n < 50_000) return;
    statPoints.textContent = `Points: generating ${n.toLocaleString()}…`;
    positions = new Float32Array(n * 2);
    featureIds = new Uint32Array(n);
    const pad = n + (n % 2);
    styleIds = new Uint16Array(pad);
    await fillPoints(n, positions, featureIds, styleIds, () => {});
    renderer.setStyleTable(getStyles());
    renderer.setGeometry({
      buffer: { positions, featureIds, styleIds },
      vertexCount: n,
    });
    vertexCount = n;
    statPoints.textContent = `Points: ${n.toLocaleString()}`;
    map.render();
  };

  void (async () => {
    const navGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!navGpu) {
      statWebgpu.innerHTML = '<span class="err">unavailable</span>';
      statFps.textContent = "FPS: —";
      statFrame.textContent = "Frame: —";
      statPoints.textContent = "Points: —";
      return;
    }
    statWebgpu.textContent = "ready";

    try {
      renderer = await createWebGpuPointsRenderer({ canvas });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      statWebgpu.innerHTML = `<span class="err">${msg}</span>`;
      return;
    }

    renderer.useSingleGeometryLayout();
    await regen();

    const resizeGpu = () => {
      renderer?.resizeToDisplaySize();
    };
    resizeGpu();
    map.updateSize();
    map.on("change:size", () => {
      resizeGpu();
      map.render();
    });
    window.addEventListener("resize", () => {
      map.updateSize();
      resizeGpu();
      map.render();
    });
    requestAnimationFrame(() => {
      map.updateSize();
      resizeGpu();
      map.render();
    });

    btnRegen.addEventListener("click", () => {
      void regen();
    });

    map.on("postrender", (evt) => {
      const fs = evt.frameState;
      if (!fs || !renderer) return;

      const now = performance.now();
      const dt = now - lastFrameT;
      lastFrameT = now;
      if (dt > 0 && dt < 500) {
        fpsSamples.push(1000 / dt);
        if (fpsSamples.length > 72) fpsSamples.shift();
      }
      const avgFps = fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
      statFps.textContent = `FPS: ${avgFps.toFixed(0)}`;
      statFrame.textContent = `Frame: ${dt.toFixed(1)} ms`;

      frameStateToClipMatrix(fs, clipMat);
      renderer.setMapToClipMatrix(clipMat);
      renderer.render({ timeMs: fs.time });
    });

    map.render();
  })();
}

main();
