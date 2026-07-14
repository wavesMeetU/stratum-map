/**
 * Points + Lines + Polygons coexistence example (Stage 6.2 lines, Stage 6.6 polygons).
 *
 * Proves the smallest complete LineString rendering vertical slice, plus (Stage 6.6) the
 * smallest complete filled-`Polygon` rendering vertical slice:
 * - multiple LineString features render with correct segment extrusion
 * - line width stays visually constant under zoom and rotation
 * - multiple filled Polygon features render via indexed triangle-list draws, including a
 *   concave polygon and a polygon with a hole, using two distinct fill styles
 * - line, point, and polygon picking all work independently — polygon picking correctly
 *   distinguishes a polygon's interior from its hole, and from empty space
 * - WebGpuPointsRenderer, WebGpuLineRenderer, and WebGpuPolygonRenderer coexist in one
 *   composited frame with none of the three owning or coordinating the others — this file
 *   is the coordinator; all three are equal, independent participants sharing one
 *   ViewState and one GPURenderPassEncoder per frame (polygons drawn first, so point/line
 *   markers remain visible on top of polygon fills, matching typical map z-ordering).
 *
 * Dataset is small and fixed (no network fetch, no worker) — this is an architectural
 * example, not a benchmark.
 *
 * Stage 6.3 exported the line rendering API (`WebGpuLineRenderer`, `LineStyle`,
 * `buildLineSegments`, `LineSegmentBatch`) from the package's public barrel
 * (`src/index.ts`); polygon rendering (`WebGpuPolygonRenderer`, `PolygonStyle`,
 * `triangulatePolygonFeatures`) is Stage 6.6's first vertical slice and is intentionally
 * NOT exported yet — same "prove it before exporting it" precedent Stage 6.2 set for lines.
 * This example imports line/point symbols from `"stratum-map"` (public) and polygon
 * symbols directly from `src/...` (internal/experimental), matching that precedent exactly.
 */
import {
  WebGpuPointsRenderer,
  WebGpuLineRenderer,
  buildLineSegments,
  ViewState,
  panByPixels,
  zoomToward,
  type FeatureRecord,
  type GeometryBuffer,
} from "stratum-map";
import { WebGpuPolygonRenderer } from "../../src/renderer/webgpu-polygon-renderer.js";
import { createPolygonRingAccumulator, writeFlattenedGeometry } from "../../src/parser/geojson-flatten.js";
import { triangulatePolygonFeatures, type PolygonFeatureInput } from "../../src/gpu/polygon-triangulation.js";

// ── deterministic dataset (world units, EPSG:3857-like meters) ─────────────

const POINTS: { id: number; x: number; y: number; label: string }[] = [
  { id: 0, x: -400_000, y: 400_000, label: "NW anchor" },
  { id: 1, x: 400_000, y: 400_000, label: "NE anchor" },
  { id: 2, x: 400_000, y: -400_000, label: "SE anchor" },
  { id: 3, x: -400_000, y: -400_000, label: "SW anchor" },
  { id: 4, x: 0, y: 0, label: "center" },
];

const LINES: { id: number; coords: [number, number][]; label: string }[] = [
  {
    id: 100,
    coords: [
      [-600_000, 200_000],
      [-200_000, 200_000],
      [0, 600_000],
      [200_000, 200_000],
      [600_000, 200_000],
    ],
    label: "zigzag (north)",
  },
  {
    id: 101,
    coords: [
      [-600_000, -200_000],
      [0, -600_000],
      [600_000, -200_000],
    ],
    label: "V-shape (south)",
  },
];

const POINT_LABELS = new Map(POINTS.map((p) => [p.id, p.label]));
const LINE_LABELS = new Map(LINES.map((l) => [l.id, l.label]));

// Feature id at the GPU-safe ceiling (Stage 5.1.1) — proves high FeatureId picking still
// decodes correctly through the polygon pick pass, not just small ids.
const HIGH_FEATURE_ID = 0xfffffffe;

interface PolygonFeatureSpec {
  readonly id: number;
  readonly styleId: number;
  readonly label: string;
  /** Rings in GeoJSON order: ring 0 = exterior, the rest = holes. */
  readonly rings: readonly (readonly [number, number][])[];
}

const POLYGONS: readonly PolygonFeatureSpec[] = [
  {
    id: 500,
    styleId: 0,
    label: "square",
    rings: [
      [
        [50_000, 300_000],
        [250_000, 300_000],
        [250_000, 450_000],
        [50_000, 450_000],
        [50_000, 300_000],
      ],
    ],
  },
  {
    id: 501,
    styleId: 0,
    label: "L-shape (concave)",
    rings: [
      [
        [-580_000, -580_000],
        [-380_000, -580_000],
        [-380_000, -480_000],
        [-480_000, -480_000],
        [-480_000, -380_000],
        [-580_000, -380_000],
        [-580_000, -580_000],
      ],
    ],
  },
  {
    id: 502,
    styleId: 1,
    label: "frame (hole)",
    rings: [
      [
        [300_000, -580_000],
        [580_000, -580_000],
        [580_000, -450_000],
        [300_000, -450_000],
        [300_000, -580_000],
      ],
      [
        [380_000, -550_000],
        [500_000, -550_000],
        [500_000, -480_000],
        [380_000, -480_000],
        [380_000, -550_000],
      ],
    ],
  },
  {
    id: HIGH_FEATURE_ID,
    styleId: 1,
    label: "high-FeatureId square",
    rings: [
      [
        [-100_000, 50_000],
        [0, 50_000],
        [0, 150_000],
        [-100_000, 150_000],
        [-100_000, 50_000],
      ],
    ],
  },
];

const POLYGON_LABELS = new Map(POLYGONS.map((p) => [p.id, p.label]));

// ── geometry construction (no parser/worker needed — data is already flat) ──

function buildPointBuffer(): { positions: Float32Array; featureIds: Uint32Array; styleIds: Uint16Array } {
  const positions = new Float32Array(POINTS.length * 2);
  const featureIds = new Uint32Array(POINTS.length);
  const styleIds = new Uint16Array(POINTS.length + (POINTS.length % 2));
  POINTS.forEach((p, i) => {
    positions[i * 2] = p.x;
    positions[i * 2 + 1] = p.y;
    featureIds[i] = p.id;
    styleIds[i] = p.id === 4 ? 1 : 0;
  });
  return { positions, featureIds, styleIds };
}

function buildLineBuffer(): { buffer: GeometryBuffer; records: FeatureRecord[] } {
  let totalVerts = 0;
  for (const l of LINES) totalVerts += l.coords.length;

  const positions = new Float32Array(totalVerts * 2);
  const featureIds = new Uint32Array(totalVerts);
  const styleIds = new Uint16Array(totalVerts);
  const records: FeatureRecord[] = [];

  let v = 0;
  for (const l of LINES) {
    const vertexStart = v;
    for (const [x, y] of l.coords) {
      positions[v * 2] = x;
      positions[v * 2 + 1] = y;
      featureIds[v] = l.id;
      styleIds[v] = l.id === 101 ? 1 : 0;
      v += 1;
    }
    records.push({
      id: l.id,
      geometryKind: "line",
      vertexStart,
      vertexCount: l.coords.length,
      properties: { label: l.label },
    });
  }

  return { buffer: { positions, featureIds, styleIds }, records };
}

/**
 * Runs the real Stage 6.5 pipeline end to end — `writeFlattenedGeometry` (ring/part
 * topology preservation) then `triangulatePolygonFeatures` (worker-side-shaped earcut
 * triangulation) — rather than hand-feeding pre-triangulated data, so this example proves
 * the concave/hole cases through the actual production code path, not a shortcut.
 */
function buildPolygonPreparedGeometry() {
  let totalVerts = 0;
  for (const f of POLYGONS) {
    for (const ring of f.rings) totalVerts += ring.length;
  }

  const positions = new Float32Array(totalVerts * 2);
  const featureIds = new Uint32Array(totalVerts);
  const styleIds = new Uint16Array(totalVerts);
  const topology = createPolygonRingAccumulator();
  const polygonFeatures: PolygonFeatureInput[] = [];

  let vertexOffset = 0;
  for (const f of POLYGONS) {
    const partStart = topology.partRingCounts.length;
    const ringStart = topology.ringVertexCounts.length;
    const written = writeFlattenedGeometry(
      { type: "Polygon", coordinates: f.rings as [number, number][][] },
      positions,
      featureIds,
      styleIds,
      f.id,
      f.styleId,
      vertexOffset,
      topology,
    );
    const partCount = topology.partRingCounts.length - partStart;
    const ringCount = topology.ringVertexCounts.length - ringStart;
    if (partCount > 0) {
      polygonFeatures.push({ vertexStart: vertexOffset, ringStart, ringCount, partStart, partCount });
    }
    vertexOffset += written;
  }

  return triangulatePolygonFeatures(
    positions,
    featureIds,
    styleIds,
    topology.partRingCounts,
    topology.ringVertexCounts,
    polygonFeatures,
  );
}

// ── main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!navigator.gpu) {
    alert("WebGPU is not supported in this browser");
    return;
  }

  const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
  const container = document.getElementById("canvas-container") as HTMLElement;
  const zoomEl = document.getElementById("zoom-display")!;
  const rotationEl = document.getElementById("rotation-display")!;
  const pickEl = document.getElementById("pick-display")!;

  const { width, height } = container.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;

  const pointsRenderer = await WebGpuPointsRenderer.create({
    canvas,
    alphaMode: "premultiplied",
    styles: [
      { color: [0.25, 0.75, 1.0, 1.0], sizePx: 14 },
      { color: [1.0, 0.85, 0.2, 1.0], sizePx: 20 },
    ],
  });
  pointsRenderer.useSingleGeometryLayout();
  pointsRenderer.setPickPointDiameterPx(20);

  // Independent renderer: shares the device/format/canvas, owns none of them.
  const lineRenderer = await WebGpuLineRenderer.create({
    device: pointsRenderer.getDevice(),
    format: pointsRenderer.getCanvasFormat(),
    canvas,
    styles: [
      { color: [1.0, 0.55, 0.15, 1.0], widthPx: 6 },
      { color: [0.6, 1.0, 0.5, 1.0], widthPx: 6 },
    ],
  });
  lineRenderer.setPickWidthPx(14);

  // Independent renderer: shares the device/format/canvas, owns none of them. No pick
  // width concept exists for a filled area (Stage 6.6) — the triangulated interior itself
  // is the hit region.
  const polygonRenderer = await WebGpuPolygonRenderer.create({
    device: pointsRenderer.getDevice(),
    format: pointsRenderer.getCanvasFormat(),
    canvas,
    styles: [
      { color: [0.35, 0.78, 0.4, 0.75] }, // style 0: green (square, L-shape)
      { color: [0.75, 0.4, 0.85, 0.75] }, // style 1: violet (frame-with-hole, high-id square)
    ],
  });

  const pointData = buildPointBuffer();
  pointsRenderer.setGeometry({ buffer: pointData, vertexCount: POINTS.length });

  const { buffer: lineBuffer, records: lineRecords } = buildLineBuffer();
  const lineSegments = buildLineSegments(lineBuffer, lineRecords);
  lineRenderer.ingestLineSegments(lineSegments, { chunkKey: "demo-lines" });

  const preparedPolygons = buildPolygonPreparedGeometry();
  polygonRenderer.ingestPolygonGeometry(preparedPolygons, { chunkKey: "demo-polygons" });

  // Zoom 6 gives ~2200km of coverage in a ~900px viewport — comfortable margin around the
  // dataset's +-600km extent.
  let viewState = new ViewState([0, 0], 6, 0, [width, height]);

  function updateHud(): void {
    zoomEl.textContent = viewState.zoom.toFixed(2);
    rotationEl.textContent = ((viewState.rotation * 180) / Math.PI).toFixed(1);
  }
  updateHud();

  function renderFrame(): void {
    // WebGpuPointsRenderer's ViewState-driven path (renderWithViewState) opens its own
    // pass, which would clobber the line renderer's output in a shared pass. Its
    // pre-existing `setMapToClipMatrix` public method (originally for OpenLayers
    // integration) is reused here for exactly what it already does — inject an
    // externally-computed clip matrix — with zero changes to WebGpuPointsRenderer itself.
    pointsRenderer.setMapToClipMatrix(viewState.getClipMatrix());

    const encoder = pointsRenderer.getDevice().createCommandEncoder();
    const textureView = pointsRenderer.getContext().getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: textureView, clearValue: { r: 0.04, g: 0.06, b: 0.1, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    // All three renderers record into the SAME pass — none clears nor owns the others'
    // output. Polygons first, so point/line markers stay visible on top of polygon fills
    // (typical map z-ordering) — draw order, not a depth buffer, resolves overlap, exactly
    // like every other draw-order decision in this codebase.
    polygonRenderer.encodeRenderPass(pass, viewState, { timeMs: performance.now() });
    lineRenderer.encodeRenderPass(pass, viewState, { timeMs: performance.now() });
    pointsRenderer.encodeRenderPass(pass, { timeMs: performance.now() });
    pass.end();
    pointsRenderer.getDevice().queue.submit([encoder.finish()]);
  }

  // ── interaction ────────────────────────────────────────────────────────

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    viewState = panByPixels(viewState, -dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
    updateHud();
    renderFrame();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    viewState = zoomToward(viewState, factor);
    updateHud();
    renderFrame();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "q" || e.key === "Q") {
      viewState = viewState.rotateBy(-0.08);
      updateHud();
      renderFrame();
    } else if (e.key === "e" || e.key === "E") {
      viewState = viewState.rotateBy(0.08);
      updateHud();
      renderFrame();
    }
  });

  function cssToBacking(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ];
  }

  canvas.addEventListener("click", async (e) => {
    const [bx, by] = cssToBacking(e);
    // No shared picking coordinator: try each independent renderer's own pick pass.
    // Polygons are tried last — the largest, "background-most" targets, matching the
    // z-order points/lines are drawn on top with.
    const lineHit = await lineRenderer.pickFeatureIdAtCanvasPixel(bx, by, viewState);
    if (lineHit !== null && LINE_LABELS.has(lineHit)) {
      pickEl.textContent = `line #${lineHit} (${LINE_LABELS.get(lineHit)})`;
      return;
    }
    const pointHit = await pointsRenderer.pickFeatureIdAtCanvasPixel(bx, by);
    if (pointHit !== null && POINT_LABELS.has(pointHit)) {
      pickEl.textContent = `point #${pointHit} (${POINT_LABELS.get(pointHit)})`;
      return;
    }
    const polygonHit = await polygonRenderer.pickFeatureIdAtCanvasPixel(bx, by, viewState);
    if (polygonHit !== null && POLYGON_LABELS.has(polygonHit)) {
      pickEl.textContent = `polygon #${polygonHit} (${POLYGON_LABELS.get(polygonHit)})`;
      return;
    }
    pickEl.textContent = "—";
  });

  new ResizeObserver(() => {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    pointsRenderer.resizeBackingStore(rect.width, rect.height);
    viewState = viewState.resize(rect.width, rect.height);
    renderFrame();
  }).observe(container);

  renderFrame();
}

main().catch((err) => {
  console.error("Initialization failed:", err);
});
