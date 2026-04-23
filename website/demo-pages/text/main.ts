/**
 * GPU text labels demo: WebGPU points + TextLayer (bitmap / MSDF), optional declutter.
 */
import {
  createWebGpuPointsRenderer,
  createTextLayerForPointsRenderer,
  GlyphAtlas,
  tryLoadMsdfAtlasFromUrls,
  type DeclutterDebugRects,
  type MsdfGlyphAtlas,
  type TextLayer,
  type WebGpuPointsRenderer,
} from "stratum-map";
import { buildCoordinateTextLabels } from "./build-labels.js";
import Map, { type FrameState } from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import { fromLonLat } from "ol/proj.js";

const POINT_COUNT = 100_000;
const MAX_WEBGPU_LABELS = 8000;

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

function formatNum(n: number, digits: number): string {
  return n.toFixed(digits);
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

function collectPointsInExtentForLabels(
  positions: Float32Array,
  count: number,
  extent3857: readonly [number, number, number, number],
  lonLat: Float32Array,
): { inView: number; items: { id: number; mx: number; my: number; lon: number; lat: number }[] } {
  const [e0, e1, e2, e3] = extent3857;
  const loX = Math.min(e0, e2);
  const hiX = Math.max(e0, e2);
  const loY = Math.min(e1, e3);
  const hiY = Math.max(e1, e3);
  let inView = 0;
  const items: { id: number; mx: number; my: number; lon: number; lat: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = positions[i * 2]!;
    const y = positions[i * 2 + 1]!;
    if (x < loX || x > hiX || y < loY || y > hiY) {
      continue;
    }
    inView += 1;
    items.push({
      id: i,
      mx: x,
      my: y,
      lon: lonLat[i * 2]!,
      lat: lonLat[i * 2 + 1]!,
    });
  }
  return { inView, items };
}

function clearDeclutterDebugLayer(layerEl: HTMLElement): void {
  layerEl.replaceChildren();
}

function syncDeclutterDebugLayer(layerEl: HTMLElement, rects: DeclutterDebugRects | null): void {
  clearDeclutterDebugLayer(layerEl);
  if (!rects) {
    return;
  }
  for (const r of rects.accepted) {
    const d = document.createElement("div");
    d.style.position = "absolute";
    d.style.left = `${r.x}px`;
    d.style.top = `${r.y}px`;
    d.style.width = `${Math.max(1, r.width)}px`;
    d.style.height = `${Math.max(1, r.height)}px`;
    d.style.border = "1px solid rgba(72, 220, 120, 0.95)";
    d.style.background = "rgba(72, 220, 120, 0.06)";
    layerEl.appendChild(d);
  }
  for (const r of rects.rejected) {
    const d = document.createElement("div");
    d.style.position = "absolute";
    d.style.left = `${r.x}px`;
    d.style.top = `${r.y}px`;
    d.style.width = `${Math.max(1, r.width)}px`;
    d.style.height = `${Math.max(1, r.height)}px`;
    d.style.border = "1px solid rgba(255, 96, 96, 0.9)";
    d.style.background = "rgba(255, 96, 96, 0.05)";
    layerEl.appendChild(d);
  }
}

function main(): void {
  const mapEl = document.getElementById("map");
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement | null;
  const showLabelsInput = document.getElementById("show-labels") as HTMLInputElement | null;
  const labelStatsEl = document.getElementById("label-stats");
  const atlasBitmapRadio = document.getElementById("text-atlas-bitmap") as HTMLInputElement | null;
  const atlasMsdfRadio = document.getElementById("text-atlas-msdf") as HTMLInputElement | null;
  const declutterEnabledInput = document.getElementById("declutter-enabled") as HTMLInputElement | null;
  const declutterDebugShowInput = document.getElementById("declutter-debug-show") as HTMLInputElement | null;
  const declutterDebugLayer = document.getElementById("declutter-debug-layer") as HTMLElement | null;
  if (
    !mapEl ||
    !canvas ||
    !showLabelsInput ||
    !labelStatsEl ||
    !atlasBitmapRadio ||
    !atlasMsdfRadio ||
    !declutterEnabledInput ||
    !declutterDebugShowInput ||
    !declutterDebugLayer
  ) {
    console.error("Missing DOM nodes");
    return;
  }

  const declutterEnabledEl: HTMLInputElement = declutterEnabledInput;
  const declutterDebugShowEl: HTMLInputElement = declutterDebugShowInput;
  const declutterDebugLayerEl: HTMLElement = declutterDebugLayer;

  const map = new Map({
    target: mapEl,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({
      center: fromLonLat([12, 48]),
      zoom: 5,
      minZoom: 2,
      maxZoom: 18,
    }),
  });
  map.getOverlayContainer().insertBefore(canvas, map.getOverlayContainer().firstChild);

  const clipMat = new Float32Array(16);
  let renderer: WebGpuPointsRenderer | null = null;
  let textLayer: TextLayer | null = null;
  type TextAtlasKind = "bitmap" | "msdf";
  let textAtlasKind: TextAtlasKind = "bitmap";
  let msdfAtlasCache: MsdfGlyphAtlas | null = null;
  let msdfLoadAttempted = false;
  let declutterOn = false;
  let declutterDebugOn = false;
  let showLabels = showLabelsInput.checked;

  let lastLabelStatsText = "";
  const setLabelStats = (text: string) => {
    if (text === lastLabelStatsText) return;
    lastLabelStatsText = text;
    labelStatsEl.textContent = text;
  };

  void (async () => {
    const navGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!navGpu) {
      setLabelStats("WebGPU not available. Try Chromium with WebGPU enabled.");
      return;
    }

    try {
      renderer = await createWebGpuPointsRenderer({ canvas });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLabelStats(`WebGPU init failed: ${msg}`);
      return;
    }

    try {
      textLayer = createTextLayerForPointsRenderer(renderer, { maxGlyphs: 120_000 });
    } catch (e) {
      console.warn("WebGPU text layer init failed", e);
      textLayer = null;
    }

    function msdfAtlasUrls(): { json: string; png: string } {
      const im = import.meta as ImportMeta & { readonly env?: { readonly BASE_URL?: string } };
      const root = (im.env?.BASE_URL ?? "/").replace(/\/?$/, "/");
      return { json: `${root}msdf/atlas.json`, png: `${root}msdf/atlas.png` };
    }

    async function ensureMsdfAtlasLoaded(): Promise<MsdfGlyphAtlas | null> {
      if (!renderer) {
        return null;
      }
      if (msdfAtlasCache) {
        return msdfAtlasCache;
      }
      if (msdfLoadAttempted) {
        return null;
      }
      msdfLoadAttempted = true;
      const { json, png } = msdfAtlasUrls();
      msdfAtlasCache = await tryLoadMsdfAtlasFromUrls(renderer.getDevice(), json, png);
      return msdfAtlasCache;
    }

    async function applyTextAtlasKind(kind: TextAtlasKind): Promise<void> {
      if (!textLayer || !renderer) {
        return;
      }
      if (kind === "bitmap") {
        const prev = textLayer.getAtlas();
        const next = GlyphAtlas.create(renderer.getDevice(), globalThis.devicePixelRatio ?? 1);
        textLayer.replaceAtlas(next);
        if (prev !== msdfAtlasCache) {
          prev.destroy();
        }
        textLayer.setDefaultHalo(null);
        textLayer.setGlobalOutline(null);
        textAtlasKind = "bitmap";
        atlasBitmapRadio.checked = true;
        return;
      }
      const m = await ensureMsdfAtlasLoaded();
      if (!m) {
        atlasBitmapRadio.checked = true;
        textAtlasKind = "bitmap";
        atlasMsdfRadio.disabled = true;
        atlasMsdfRadio.title = "MSDF atlas failed to load (see console)";
        console.warn("MSDF atlas load failed; staying on bitmap.");
        return;
      }
      const prev = textLayer.getAtlas();
      if (prev !== m) {
        textLayer.replaceAtlas(m);
        if (prev !== msdfAtlasCache) {
          prev.destroy();
        }
      }
      textLayer.setDefaultHalo({ widthPx: 2, color: [0.02, 0.04, 0.08, 0.92] });
      textLayer.setGlobalOutline({ widthPx: 1.25, color: [0, 0, 0, 0.88] });
      textAtlasKind = "msdf";
      atlasMsdfRadio.checked = true;
    }

    if (textLayer !== null) {
      const textLayerRef = textLayer;
      void ensureMsdfAtlasLoaded().then(() => {
        const ok = msdfAtlasCache !== null;
        atlasMsdfRadio.disabled = !ok;
        atlasMsdfRadio.title = ok ? "Multi-channel SDF atlas" : "Could not load msdf/atlas.json + atlas.png";
      });
      atlasBitmapRadio.addEventListener("change", () => {
        if (atlasBitmapRadio.checked) {
          void applyTextAtlasKind("bitmap");
        }
      });
      atlasMsdfRadio.addEventListener("change", () => {
        if (atlasMsdfRadio.checked) {
          void applyTextAtlasKind("msdf");
        }
      });

      textLayerRef.setDeclutterPadding(6);
      declutterEnabledEl.addEventListener("change", () => {
        declutterOn = declutterEnabledEl.checked;
        textLayerRef.setDeclutterEnabled(declutterOn);
        if (!declutterOn) {
          declutterDebugOn = false;
          declutterDebugShowEl.checked = false;
          textLayerRef.setDeclutterDebug(false);
          clearDeclutterDebugLayer(declutterDebugLayerEl);
        }
      });
      declutterDebugShowEl.addEventListener("change", () => {
        declutterDebugOn = declutterDebugShowEl.checked;
        textLayerRef.setDeclutterDebug(declutterOn && declutterDebugOn);
        if (!declutterDebugOn) {
          clearDeclutterDebugLayer(declutterDebugLayerEl);
        }
      });
    }

    renderer.useSingleGeometryLayout();
    renderer.setStyleTable([
      { color: [1.0, 0.35, 0.05, 0.92], sizePx: 8 },
      { color: [0.15, 0.55, 1.0, 0.92], sizePx: 8 },
    ]);

    const positions = new Float32Array(POINT_COUNT * 2);
    const featureIds = new Uint32Array(POINT_COUNT);
    const pad = POINT_COUNT + (POINT_COUNT % 2);
    const styleIds = new Uint16Array(pad);
    const lonLatScratch = new Float32Array(POINT_COUNT * 2);
    fillPoints(POINT_COUNT, positions, lonLatScratch, featureIds, styleIds);
    renderer.setGeometry({
      buffer: { positions, featureIds, styleIds },
      vertexCount: POINT_COUNT,
    });

    showLabelsInput.addEventListener("change", () => {
      showLabels = showLabelsInput.checked;
      if (!showLabels) {
        setLabelStats("");
        clearDeclutterDebugLayer(declutterDebugLayerEl);
      }
      map.render();
    });

    const resizeGpu = () => {
      renderer?.resizeToDisplaySize();
      textLayer?.resize();
    };
    resizeGpu();
    map.updateSize();
    map.on("change:size", resizeGpu);
    window.addEventListener("resize", resizeGpu);
    requestAnimationFrame(() => {
      map.updateSize();
      resizeGpu();
      map.render();
    });

    map.on("postrender", (evt) => {
      const fs = evt.frameState;
      if (!fs || !renderer) return;
      frameStateToClipMatrix(fs, clipMat);
      renderer.setMapToClipMatrix(clipMat);

      if (textLayer !== null) {
        textLayer.updateMapMatrix(clipMat);
        textLayer.setViewport(canvas.width, canvas.height);
        textLayer.setMapZoom(map.getView().getZoom() ?? null);
        const ext = fs.extent;
        if (ext) {
          textLayer.setCullExtent([ext[0]!, ext[1]!, ext[2]!, ext[3]!], 0);
        } else {
          textLayer.setCullExtent(null);
        }
        if (showLabels && ext) {
          const { inView, items } = collectPointsInExtentForLabels(
            positions,
            POINT_COUNT,
            [ext[0]!, ext[1]!, ext[2]!, ext[3]!],
            lonLatScratch,
          );
          const baseLabels = buildCoordinateTextLabels(items, MAX_WEBGPU_LABELS, formatNum);
          const labels =
            textAtlasKind === "msdf"
              ? baseLabels.map((l) => ({
                  ...l,
                  sizePx: 12,
                  haloWidthPx: 2,
                  haloColor: [0.03, 0.06, 0.1, 0.9] as const,
                }))
              : baseLabels;
          textLayer.setLabels(labels);
          textLayer.rebuildInstancesIfDirty();
          const ds = declutterOn ? textLayer.getLastDeclutterStats() : null;
          const declutterLine =
            declutterOn && ds !== null
              ? ` · declutter ${ds.acceptedCount.toLocaleString()}/${ds.inputCount.toLocaleString()} shown · off/zoom ${(
                  ds.rejectedOffscreen + ds.rejectedZoom
                ).toLocaleString()} · collisions ${ds.rejectedCollision.toLocaleString()}`
              : "";
          setLabelStats(
            `${Math.min(items.length, MAX_WEBGPU_LABELS).toLocaleString()} labels · ${inView.toLocaleString()} pts in view (cap ${MAX_WEBGPU_LABELS.toLocaleString()}) · ${textAtlasKind === "msdf" ? "MSDF" : "bitmap"}${declutterLine}.`,
          );
          if (declutterOn && declutterDebugOn) {
            syncDeclutterDebugLayer(declutterDebugLayerEl, textLayer.getDeclutterDebugRects());
          } else {
            clearDeclutterDebugLayer(declutterDebugLayerEl);
          }
        } else {
          textLayer.setLabels([]);
          setLabelStats("");
          clearDeclutterDebugLayer(declutterDebugLayerEl);
        }

        const device = renderer.getDevice();
        const encoder = device.createCommandEncoder();
        const textureView = renderer.getContext().getCurrentTexture().createView();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: textureView,
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        renderer.encodeRenderPass(pass, { timeMs: fs.time });
        textLayer.render(pass);
        pass.end();
        device.queue.submit([encoder.finish()]);
      } else {
        renderer.render({ timeMs: fs.time });
        if (showLabels) {
          setLabelStats("Text layer failed to initialize — labels unavailable.");
        } else {
          setLabelStats("");
        }
      }
    });

    map.render();
  })();
}

main();
