/**
 * GPU picking demo: click map → pickFeatureIdAtCanvasPixel → FeatureStore → highlight style.
 */
import {
  createWebGpuPointsRenderer,
  FeatureStore,
  PointHitTester,
  type WebGpuPointsRenderer,
} from "stratum-map";
import type { FeatureRecord } from "stratum-map";
import Map, { type FrameState } from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { fromLonLat, toLonLat } from "ol/proj.js";

const POINT_COUNT = 120_000;
const STYLE_SELECTED = 2;

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

function fillPoints(
  count: number,
  positions: Float32Array,
  lonLat: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
): void {
  for (let i = 0; i < count; i++) {
    const lon = Math.random() * 360 - 180;
    const lat = (Math.random() - 0.5) * 2 * 85.05112878;
    lonLat[i * 2] = lon;
    lonLat[i * 2 + 1] = lat;
    lonLatTo3857(lon, lat, positions, i * 2);
    featureIds[i] = i;
    styleIds[i] = i & 1;
  }
}

function buildRecords(count: number, lonLat: Float32Array): FeatureRecord[] {
  const out: FeatureRecord[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      geometryKind: "point",
      vertexStart: i,
      vertexCount: 1,
      properties: {
        name: `Point ${i}`,
        lonDeg: lonLat[i * 2]!,
        latDeg: lonLat[i * 2 + 1]!,
      },
    });
  }
  return out;
}

function applySelection(styleIds: Uint16Array, count: number, selectedId: number | null): void {
  for (let i = 0; i < count; i++) {
    styleIds[i] = selectedId === i ? STYLE_SELECTED : (i & 1);
  }
}

function main(): void {
  const mapEl = document.getElementById("map");
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement | null;
  const panel = document.getElementById("panel");
  if (!mapEl || !canvas || !panel) return;

  const map = new Map({
    target: mapEl,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({
      center: fromLonLat([10, 45]),
      zoom: 5,
      minZoom: 2,
      maxZoom: 18,
    }),
  });
  map.getOverlayContainer().insertBefore(canvas, map.getOverlayContainer().firstChild);

  const clipMat = new Float32Array(16);
  const positions = new Float32Array(POINT_COUNT * 2);
  const lonLat = new Float32Array(POINT_COUNT * 2);
  const featureIds = new Uint32Array(POINT_COUNT);
  const pad = POINT_COUNT + (POINT_COUNT % 2);
  const styleIds = new Uint16Array(pad);

  const setPanel = (html: string) => {
    panel.innerHTML = html;
  };

  void (async () => {
    if (!(navigator as Navigator & { gpu?: unknown }).gpu) {
      setPanel('<span class="err">WebGPU not available.</span> Use a Chromium build with WebGPU enabled.');
      return;
    }

    let renderer: WebGpuPointsRenderer;
    try {
      renderer = await createWebGpuPointsRenderer({ canvas });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPanel(`<span class="err">WebGPU init failed:</span> ${msg}`);
      return;
    }

    renderer.useSingleGeometryLayout();
    renderer.setPickPointDiameterPx(14);
    renderer.setStyleTable([
      { color: [0.15, 0.55, 1.0, 0.92], sizePx: 8 },
      { color: [1.0, 0.42, 0.12, 0.92], sizePx: 7 },
      { color: [0.55, 0.95, 0.45, 1.0], sizePx: 11 },
    ]);

    fillPoints(POINT_COUNT, positions, lonLat, featureIds, styleIds);
    renderer.setGeometry({
      buffer: { positions, featureIds, styleIds },
      vertexCount: POINT_COUNT,
    });

    const store = new FeatureStore();
    store.ingestRecords(buildRecords(POINT_COUNT, lonLat));
    const hitTester = new PointHitTester(renderer, store);

    setPanel(
      `<span class="muted">${POINT_COUNT.toLocaleString()} points ready.</span> Click the map to pick. ` +
        `<span class="muted">GPU pick uses backing-store pixels.</span>`,
    );

    let selectedId: number | null = null;

    const resizeGpu = () => {
      renderer.resizeToDisplaySize();
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

    map.on("postrender", (evt) => {
      const fs = evt.frameState;
      if (!fs) return;
      frameStateToClipMatrix(fs, clipMat);
      renderer.setMapToClipMatrix(clipMat);
      renderer.render({ timeMs: fs.time });
    });

    map.on("singleclick", (evt) => {
      void (async () => {
        const target = map.getTargetElement();
        const rect = target.getBoundingClientRect();
        const e = evt.originalEvent as MouseEvent;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const bx = (px / rect.width) * canvas.width;
        const by = (py / rect.height) * canvas.height;

        const t0 = performance.now();
        const rec = await hitTester.getFeatureAtPixel({ x: Math.floor(bx), y: Math.floor(by) });
        const ms = performance.now() - t0;

        if (rec === null) {
          selectedId = null;
          applySelection(styleIds, POINT_COUNT, null);
          renderer.writeStyleIdsForSingleLayout(styleIds, POINT_COUNT);
          map.render();
          setPanel(
            `<span class="muted">Miss</span> <span class="mono">(${ms.toFixed(1)} ms)</span><br/>` +
              `<span class="muted">Zoom in or click closer to a point.</span>`,
          );
          return;
        }

        selectedId = rec.id;
        applySelection(styleIds, POINT_COUNT, selectedId);
        renderer.writeStyleIdsForSingleLayout(styleIds, POINT_COUNT);
        map.render();

        const mx = positions[selectedId * 2]!;
        const my = positions[selectedId * 2 + 1]!;
        const ll = toLonLat([mx, my]);
        const props = JSON.stringify(rec.properties, null, 2);
        setPanel(
          `<strong>Hit</strong> <span class="mono">id=${selectedId}</span> ` +
            `<span class="muted">(${ms.toFixed(1)} ms)</span><br/>` +
            `<span class="muted">WGS84 (stored)</span> lon ${(rec.properties.lonDeg as number).toFixed(5)}°, lat ${(rec.properties.latDeg as number).toFixed(5)}°<br/>` +
            `<span class="muted">OL toLonLat(3857)</span> lon ${ll[0]!.toFixed(5)}°, lat ${ll[1]!.toFixed(5)}°<br/>` +
            `<span class="muted">EPSG:3857</span> x ${mx.toFixed(1)} m, y ${my.toFixed(1)} m<br/>` +
            `<span class="muted">properties</span><pre class="mono">${props}</pre>`,
        );
      })();
    });

    map.render();
  })();
}

main();
