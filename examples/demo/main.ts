/**
 * Demo: ~400k synthetic world points (WebGPU) + GPU pick → lon/lat + EPSG:3857.
 */
import { createWebGpuPointsRenderer } from "../../src/renderer/webgpu-points-renderer.js";
import type { WebGpuPointsRenderer } from "../../src/renderer/webgpu-points-renderer.js";
import { buildCoordinateTextLabels } from "./build-gpu-labels.js";
import { createTextLayerForPointsRenderer } from "../../src/text/text-layer.js";
import type { TextLayer } from "../../src/text/text-layer.js";
import { GlyphAtlas } from "../../src/text/glyph-atlas.js";
import { tryLoadMsdfAtlasFromUrls } from "../../src/text/msdf-glyph-atlas.js";
import type { MsdfGlyphAtlas } from "../../src/text/msdf-glyph-atlas.js";
import Map, { type FrameState } from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import OSM from "ol/source/OSM.js";
import DragBox from "ol/interaction/DragBox.js";
import { shiftKeyOnly } from "ol/events/condition.js";
import { fromLonLat, toLonLat } from "ol/proj.js";

const POINT_COUNT = 400_000;
/** Cap in-view points promoted to WebGPU glyph labels (each label is two ASCII lines worth of glyphs). */
const MAX_WEBGPU_LABELS = 6000;
/** Style table index for box-selected vertices (must match `setStyleTable` order). */
const STYLE_SELECTED = 2;

/** Column-major 4×4: map projection XY → WebGPU clip (w = 1). */
function frameStateToClipMatrix(fs: FrameState, out: Float32Array): void {
  const t = fs.coordinateToPixelTransform;
  const w = fs.size[0];
  const h = fs.size[1];
  const t0 = t[0];
  const t1 = t[1];
  const t2 = t[2];
  const t3 = t[3];
  const t4 = t[4];
  const t5 = t[5];
  const ax = (2 / w) * t0;
  const bx = (2 / w) * t2;
  const cx = (2 / w) * t4 - 1;
  const ay = (-2 / h) * t1;
  const by = (-2 / h) * t3;
  const cy = 1 - (2 / h) * t5;
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

/** WGS84 lon/lat (deg) → EPSG:3857, inlined for 400k points without per-call OL alloc. */
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

/**
 * Fills `positions` (3857), `featureIds`, `styleIds`; `lonLatScratch` holds last-written lon/lat per index for pick labels.
 */
async function generateWorldPoints(
  count: number,
  positions: Float32Array,
  featureIds: Uint32Array,
  styleIds: Uint16Array,
  lonLatScratch: Float32Array,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const chunk = 48_000;
  let i = 0;
  while (i < count) {
    const end = Math.min(i + chunk, count);
    for (; i < end; i++) {
      const lon = Math.random() * 360 - 180;
      const lat = (Math.random() - 0.5) * 2 * 85.05112878;
      lonLatScratch[i * 2] = lon;
      lonLatScratch[i * 2 + 1] = lat;
      lonLatTo3857(lon, lat, positions, i * 2);
      featureIds[i] = i;
      styleIds[i] = i & 1;
    }
    onProgress(i, count);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

/** Axis-aligned filter in EPSG:3857; optionally assigns `styleIds` (selected vs alternating base). */
function selectPointsInExtent(
  positions: Float32Array,
  count: number,
  extent3857: readonly [number, number, number, number],
  lonLatByVertex: Float32Array,
  maxSamples: number,
  styleIds?: Uint16Array,
  selectedStyleId?: number,
): { total: number; ms: number; samples: { id: number; lon: number; lat: number }[] } {
  const [e0, e1, e2, e3] = extent3857;
  const loX = Math.min(e0, e2);
  const hiX = Math.max(e0, e2);
  const loY = Math.min(e1, e3);
  const hiY = Math.max(e1, e3);
  const t0 = performance.now();
  let total = 0;
  const samples: { id: number; lon: number; lat: number }[] = [];
  const applyStyles = styleIds !== undefined && selectedStyleId !== undefined;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 2]!;
    const y = positions[i * 2 + 1]!;
    const inside = x >= loX && x <= hiX && y >= loY && y <= hiY;
    if (applyStyles) {
      styleIds![i] = inside ? selectedStyleId! : (i & 1);
    }
    if (inside) {
      total += 1;
      if (samples.length < maxSamples) {
        samples.push({
          id: i,
          lon: lonLatByVertex[i * 2]!,
          lat: lonLatByVertex[i * 2 + 1]!,
        });
      }
    }
  }
  return { total, ms: performance.now() - t0, samples };
}

function resetStyleIdsToDefault(styleIds: Uint16Array, count: number): void {
  for (let i = 0; i < count; i++) {
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

function syncDeclutterDebugLayer(
  layerEl: HTMLElement,
  rects: import("../../src/text/label-declutter.js").DeclutterDebugRects | null,
): void {
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

/** One GPU pick; 400k points makes multi-pixel loops too slow. */
async function pickPointId(
  renderer: WebGpuPointsRenderer,
  bx: number,
  by: number,
): Promise<number | null> {
  const ix = Math.floor(bx);
  const iy = Math.floor(by);
  return renderer.pickFeatureIdAtCanvasPixel(ix, iy);
}

function main(): void {
  const mapEl = document.getElementById("map");
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement | null;
  const statusLine = document.getElementById("status-line");
  const pickEl = document.getElementById("pick");
  const selectionEl = document.getElementById("selection");
  const showLabelsInput = document.getElementById("show-coord-labels") as HTMLInputElement | null;
  const labelStatsEl = document.getElementById("label-stats");
  const atlasBitmapRadio = document.getElementById("text-atlas-bitmap") as HTMLInputElement | null;
  const atlasMsdfRadio = document.getElementById("text-atlas-msdf") as HTMLInputElement | null;
  const declutterEnabledInput = document.getElementById("declutter-enabled") as HTMLInputElement | null;
  const declutterDebugShowInput = document.getElementById("declutter-debug-show") as HTMLInputElement | null;
  const declutterDebugLayer = document.getElementById("declutter-debug-layer") as HTMLElement | null;
  if (
    !mapEl ||
    !canvas ||
    !statusLine ||
    !pickEl ||
    !selectionEl ||
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

  const textAtlasBitmapRadio: HTMLInputElement = atlasBitmapRadio;
  const textAtlasMsdfRadio: HTMLInputElement = atlasMsdfRadio;
  const declutterEnabledEl: HTMLInputElement = declutterEnabledInput;
  const declutterDebugShowEl: HTMLInputElement = declutterDebugShowInput;
  const declutterDebugLayerEl: HTMLElement = declutterDebugLayer;

  const map = new Map({
    target: mapEl,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({
      center: fromLonLat([0, 25]),
      zoom: 2.3,
      minZoom: 1,
      maxZoom: 18,
    }),
  });

  {
    const overlay = map.getOverlayContainer();
    overlay.insertBefore(canvas, overlay.firstChild);
  }

  let renderer: Awaited<ReturnType<typeof createWebGpuPointsRenderer>> | null = null;
  let textLayer: TextLayer | null = null;
  type TextAtlasKind = "bitmap" | "msdf";
  let textAtlasKind: TextAtlasKind = "bitmap";
  let msdfAtlasCache: MsdfGlyphAtlas | null = null;
  let msdfLoadAttempted = false;
  let msdfRemoteAvailable = false;
  let declutterOn = false;
  let declutterDebugOn = false;
  const clipMat = new Float32Array(16);
  /** Lon/lat (deg) per feature id = vertex index. */
  let lonLatById: Float32Array | null = null;

  const setStatus = (html: string) => {
    statusLine.innerHTML = html;
  };
  const setPick = (html: string) => {
    pickEl.innerHTML = html;
  };
  const setSelection = (html: string) => {
    selectionEl.innerHTML = html;
  };
  let showCoordLabels = false;
  let lastLabelStatsText = "";
  const setLabelStats = (text: string) => {
    if (text === lastLabelStatsText) return;
    lastLabelStatsText = text;
    labelStatsEl.textContent = text;
  };

  void (async () => {
    const navGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!navGpu) {
      setStatus('<span class="err">WebGPU not available.</span> Try Chromium with WebGPU.');
      setPick("");
      setSelection("");
      setLabelStats("");
      return;
    }

    try {
      renderer = await createWebGpuPointsRenderer({ canvas });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`<span class="err">WebGPU init failed:</span> ${msg}`);
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
      msdfRemoteAvailable = msdfAtlasCache !== null;
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
        textAtlasBitmapRadio.checked = true;
        return;
      }
      const m = await ensureMsdfAtlasLoaded();
      if (!m) {
        textAtlasBitmapRadio.checked = true;
        textAtlasKind = "bitmap";
        textAtlasMsdfRadio.disabled = true;
        textAtlasMsdfRadio.title = "MSDF atlas failed to load (see console / npm run gen:demo-msdf)";
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
      textAtlasMsdfRadio.checked = true;
    }

    if (textLayer !== null) {
      const textLayerRef = textLayer;
      void ensureMsdfAtlasLoaded().then(() => {
        textAtlasMsdfRadio.disabled = !msdfRemoteAvailable;
        textAtlasMsdfRadio.title = msdfRemoteAvailable
          ? "Multi-channel SDF atlas (sharp under zoom)"
          : "Could not load /msdf/atlas.json + atlas.png — run npm run gen:demo-msdf";
      });
      textAtlasBitmapRadio.addEventListener("change", () => {
        if (textAtlasBitmapRadio.checked) {
          void applyTextAtlasKind("bitmap");
        }
      });
      textAtlasMsdfRadio.addEventListener("change", () => {
        if (textAtlasMsdfRadio.checked) {
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
      { color: [1.0, 0.35, 0.05, 0.92], sizePx: 10 },
      { color: [0.15, 0.55, 1.0, 0.92], sizePx: 10 },
      { color: [0.55, 0.56, 0.6, 0.95], sizePx: 10 },
    ]);
    renderer.setPickPointDiameterPx(12);

    const positions = new Float32Array(POINT_COUNT * 2);
    const featureIds = new Uint32Array(POINT_COUNT);
    const pad = POINT_COUNT + (POINT_COUNT % 2);
    const styleIds = new Uint16Array(pad);
    const lonLatScratch = new Float32Array(POINT_COUNT * 2);

    setStatus(`Generating <span class="stat">${POINT_COUNT.toLocaleString()}</span> points…`);
    const tGen0 = performance.now();
    await generateWorldPoints(POINT_COUNT, positions, featureIds, styleIds, lonLatScratch, (done, total) => {
      setStatus(
        `Generating… <span class="stat">${done.toLocaleString()}</span> / <span class="stat">${total.toLocaleString()}</span>`,
      );
    });
    const genMs = performance.now() - tGen0;
    lonLatById = lonLatScratch;

    setStatus(`GPU upload… (<span class="stat">${POINT_COUNT.toLocaleString()}</span> vertices)`);
    const tUp0 = performance.now();
    renderer.setGeometry({
      buffer: { positions, featureIds, styleIds },
      vertexCount: POINT_COUNT,
    });
    const upMs = performance.now() - tUp0;

    setStatus(
      `Ready — <span class="stat">${POINT_COUNT.toLocaleString()}</span> points · gen ${formatNum(genMs, 0)} ms · upload ${formatNum(upMs, 0)} ms. ` +
        `Click the map to pick (GPU).`,
    );
    setPick(
      '<span class="warn">Click the map</span> for lon/lat + Web Mercator. One pixel pick — aim at a dot or zoom in.',
    );
    setSelection(
      '<span class="mono">Shift + drag</span> to box-select — hits turn <strong>gray</strong> on the GPU layer. ' +
        `<span class="stat">${POINT_COUNT.toLocaleString()}</span> points (CPU scan). ` +
        'Too-small box cancels (no change). Next box replaces the gray set.',
    );

    const dragBox = new DragBox({
      condition: shiftKeyOnly,
      className: "ol-dragbox demo-stratum-dragbox",
    });
    map.addInteraction(dragBox);
    dragBox.on("boxcancel", () => {
      if (!renderer) return;
      resetStyleIdsToDefault(styleIds, POINT_COUNT);
      renderer.writeStyleIdsForSingleLayout(styleIds, POINT_COUNT);
      map.render();
      setSelection(
        '<span class="warn">Selection cancelled.</span> <span class="mono">Shift + drag</span> to try again.',
      );
    });
    dragBox.on("boxend", () => {
      const geom = dragBox.getGeometry();
      if (!geom || !renderer) {
        setSelection('<span class="warn">No box geometry.</span>');
        return;
      }
      const ext = geom.getExtent() as [number, number, number, number];
      const { total, ms, samples } = selectPointsInExtent(
        positions,
        POINT_COUNT,
        ext,
        lonLatScratch,
        14,
        styleIds,
        STYLE_SELECTED,
      );
      renderer.writeStyleIdsForSingleLayout(styleIds, POINT_COUNT);
      map.render();
      const sw = toLonLat([ext[0], ext[1]]);
      const ne = toLonLat([ext[2], ext[3]]);
      const lines = samples.map(
        (s) =>
          `id ${s.id.toLocaleString()}: ${formatNum(s.lon, 4)}°, ${formatNum(s.lat, 4)}°`,
      );
      setSelection(
        `<span class="stat">${total.toLocaleString()}</span> in box ` +
          `<span class="mono">(${formatNum(ms, 1)} ms)</span> — shown in <strong>gray</strong>.<br/>` +
          `<span class="stat">WGS84 bounds</span><br/>` +
          `<span class="mono">SW</span> ${formatNum(sw[0], 3)}°, ${formatNum(sw[1], 3)}° · ` +
          `<span class="mono">NE</span> ${formatNum(ne[0], 3)}°, ${formatNum(ne[1], 3)}°<br/>` +
          (total === 0
            ? ""
            : `<span class="stat">Sample ids</span> <span class="mono">(up to ${samples.length})</span><br/>` +
              `<span class="mono">${lines.join("<br/>")}</span>`),
      );
    });

    showLabelsInput.addEventListener("change", () => {
      showCoordLabels = showLabelsInput.checked;
      if (!showCoordLabels) {
        setLabelStats("");
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
        if (showCoordLabels && ext) {
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
            `${Math.min(items.length, MAX_WEBGPU_LABELS).toLocaleString()} WebGPU labels · ${inView.toLocaleString()} point(s) in view (cap ${MAX_WEBGPU_LABELS.toLocaleString()}) · atlas ${textAtlasKind === "msdf" ? "MSDF" : "bitmap"}${declutterLine}.`,
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
        if (showCoordLabels) {
          setLabelStats(
            "WebGPU text layer failed to initialize — coordinate labels are unavailable (check the console).",
          );
        } else {
          setLabelStats("");
        }
      }
    });

    map.on("singleclick", (evt) => {
      void (async () => {
        if (!renderer || lonLatById === null) return;
        const target = map.getTargetElement();
        const rect = target.getBoundingClientRect();
        const e = evt.originalEvent as MouseEvent;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const bx = (px / rect.width) * canvas.width;
        const by = (py / rect.height) * canvas.height;

        const t0 = performance.now();
        const id = await pickPointId(renderer, bx, by);
        const pickMs = performance.now() - t0;

        if (id === null || id < 0 || id >= POINT_COUNT) {
          setPick(
            `<span class="warn">No hit</span> (${formatNum(pickMs, 1)} ms). Zoom in or click closer to an orange/blue dot.`,
          );
          return;
        }

        const lon = lonLatById[id * 2]!;
        const lat = lonLatById[id * 2 + 1]!;
        const mx = positions[id * 2]!;
        const my = positions[id * 2 + 1]!;
        const ll = toLonLat([mx, my]);
        setPick(
          `<strong>Feature ${id.toLocaleString()}</strong> <span class="stat">(${formatNum(pickMs, 1)} ms)</span><br/>` +
            `<span class="stat">WGS84</span> lon ${formatNum(lon, 5)}°, lat ${formatNum(lat, 5)}°<br/>` +
            `<span class="stat">(OL check)</span> lon ${formatNum(ll[0], 5)}°, lat ${formatNum(ll[1], 5)}°<br/>` +
            `<span class="stat">EPSG:3857</span> x ${formatNum(mx, 2)} m, y ${formatNum(my, 2)} m`,
        );
      })();
    });

    map.render();
  })();
}

main();
