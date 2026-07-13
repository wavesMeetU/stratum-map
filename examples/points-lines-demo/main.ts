/**
 * Points + Lines coexistence example (Stage 6.2 implementation, Stage 6.3 public API).
 *
 * Proves the smallest complete LineString rendering vertical slice:
 * - multiple LineString features render with correct segment extrusion
 * - line width stays visually constant under zoom and rotation
 * - line and point picking both work, independently
 * - WebGpuPointsRenderer and WebGpuLineRenderer coexist in one composited frame with
 *   neither renderer owning or coordinating the other — this file is the coordinator,
 *   both renderers are equal, independent participants sharing one ViewState and one
 *   GPURenderPassEncoder per frame.
 *
 * Dataset is small and fixed (no network fetch, no worker) — this is an architectural
 * example, not a benchmark.
 *
 * Stage 6.3 exported the line rendering API (`WebGpuLineRenderer`, `LineStyle`,
 * `buildLineSegments`, `LineSegmentBatch`) from the package's public barrel
 * (`src/index.ts`) — this example imports everything from `"stratum-map"` rather than
 * direct `src/...` paths, doubling as this repo's public-API usage coverage for the line
 * renderer (verified by this example's own smoke/interaction tests): renderer creation,
 * `GeometryBuffer` + `FeatureRecord[]` → `buildLineSegments` LineString preparation,
 * multiple line/point styles, picking, and point/line coexistence, all reachable without
 * touching internal modules.
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

  const pointData = buildPointBuffer();
  pointsRenderer.setGeometry({ buffer: pointData, vertexCount: POINTS.length });

  const { buffer: lineBuffer, records: lineRecords } = buildLineBuffer();
  const lineSegments = buildLineSegments(lineBuffer, lineRecords);
  lineRenderer.ingestLineSegments(lineSegments, { chunkKey: "demo-lines" });

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
    // Both renderers record into the SAME pass — neither clears nor owns the other's output.
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
