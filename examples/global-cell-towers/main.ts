import { WebGpuPointsRenderer, ViewState, panByPixels, zoomToward } from "../../src/index.js";

// ── constants ──────────────────────────────────────────────────

const CF_WORKER_URL = "https://tiny-rice-8ab6.tarangrathod1.workers.dev/?file=towers.bin";
const BINARY_MAGIC = 0x53524f42;
const META_RECORD_SIZE = 12;
const RADIO_NAMES = ["NR", "LTE", "UMTS", "GSM"] as const;

// Radio type styling: NR=blue, LTE=green, UMTS=orange, GSM=brown
// Full opacity (alpha=1.0) for consistent visibility across all types
const BASE_STYLES = [
  { color: [0.20, 0.60, 1.00, 1.00] as const, sizePx: 6.0, glow: 1.0 }, // NR (5G)
  { color: [0.00, 0.80, 0.40, 1.00] as const, sizePx: 5.0, glow: 0.9 }, // LTE (4G)
  { color: [1.00, 0.60, 0.00, 1.00] as const, sizePx: 4.5, glow: 0.8 }, // UMTS (3G)
  { color: [0.75, 0.35, 0.15, 1.00] as const, sizePx: 4.0, glow: 0.7 }, // GSM (2G)
];

// Cinematic dark atmospheric background for telecom visualization
const CLEAR_COLOR = { r: 0.006, g: 0.008, b: 0.018, a: 1.0 };

// EPSG:3857 center ≈ lon 10°, lat 52° (Europe - where all radio types are present)
const INITIAL_CENTER: [number, number] = [1113194.90, 6800123.75];
const INITIAL_ZOOM = 3.0;

// ── types ──────────────────────────────────────────────────────

interface TowerMeta {
  radio: string;
  mcc: string;
  net: string;
  range: string;
}

interface TowerData {
  pointCount: number;
  positions: Float32Array;
  featureIds: Uint32Array;
  styleIds: Uint16Array;
  metaView: DataView;
  metaOffset: number;
  getTowerMeta(id: number): TowerMeta | null;
}

// ── binary loader ──────────────────────────────────────────────

async function loadTowerData(onProgress: (pct: number, label: string) => void): Promise<TowerData> {
  onProgress(0, "Fetching tower data...");

  const resp = await fetch(CF_WORKER_URL);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);

  const total = resp.headers.get("content-length");
  const totalBytes = total ? parseInt(total, 10) : 0;

  const reader = resp.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (totalBytes > 0) {
      const pct = Math.min(Math.round((loaded / totalBytes) * 80), 80);
      onProgress(pct, `Loading ${(loaded / 1e6).toFixed(1)} MB...`);
    }
  }

  onProgress(82, "Parsing binary...");

  const buffer = new ArrayBuffer(loaded);
  const out = new Uint8Array(buffer);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== BINARY_MAGIC) throw new Error("Bad binary magic");
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`Unsupported version: ${version}`);

  const N = view.getUint32(8, true);
  const positionsOffset = view.getUint32(12, true);
  const featureIdsOffset = view.getUint32(16, true);
  const metaOffset = view.getUint32(20, true);

  onProgress(90, `Decoding ${N.toLocaleString()} towers...`);

  const positions = new Float32Array(buffer, positionsOffset, N * 2);
  const featureIds = new Uint32Array(buffer, featureIdsOffset, N);
  const styleIdsOffset = featureIdsOffset + N * 4;
  const styleIds = new Uint16Array(buffer, styleIdsOffset, N);

  function getTowerMeta(id: number): TowerMeta | null {
    if (id < 0 || id >= N) return null;
    const base = metaOffset + id * META_RECORD_SIZE;
    return {
      radio: RADIO_NAMES[view.getUint8(base)] ?? "GSM",
      mcc: String(view.getUint16(base + 2, true)),
      net: String(view.getUint16(base + 4, true)),
      range: view.getFloat32(base + 8, true).toFixed(0),
    };
  }

  onProgress(100, "Ready");
  return { pointCount: N, positions, featureIds, styleIds, metaView: view, metaOffset, getTowerMeta };
}

// ── zoom-dependent sizing ──────────────────────────────────────

function buildStyleTable(styleVisible: boolean[], zoom: number): typeof BASE_STYLES {
  // Scale point size with zoom — smaller at low zoom (density), larger at high zoom (detail)
  const zoomScale = Math.pow(1.08, Math.max(zoom - INITIAL_ZOOM, 0));

  return BASE_STYLES.map((s, i) => {
    const visible = styleVisible[i];
    return {
      color: [...s.color.slice(0, 3), visible ? s.color[3] : 0.0] as [number, number, number, number],
      sizePx: visible ? s.sizePx * zoomScale : 0.5,
      glow: visible ? s.glow : 0,
    };
  });
}

function lodStrideForZoom(zoom: number): number {
  if (zoom >= 6) return 1;      // all towers
  if (zoom >= 5) return 2;      // 50%
  if (zoom >= 4) return 4;      // 25%
  if (zoom >= 3) return 8;      // 12.5%
  if (zoom >= 2) return 16;     // 6.25%
  if (zoom >= 1) return 32;     // 3.125%
  return 64;                    // 1.56% at world view
}

// ── main ───────────────────────────────────────────────────────

function main(): void {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;
  const loadingEl = document.getElementById("loading")!;
  const loadingStatusEl = document.getElementById("loading-status")!;
  const loadingProgressEl = document.getElementById("loading-progress-bar")!;
  const towerCountEl = document.getElementById("tower-count")!;
  const fpsEl = document.getElementById("fps")!;
  const zoomEl = document.getElementById("zoom")!;
  const popupEl = document.getElementById("popup")!;

  let renderer: WebGpuPointsRenderer;
  let towerData: TowerData;
  let viewState: ViewState;
  let dirty = true;

  const styleVisible = [true, true, true, true];

  // ── interaction state ──

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  // FPS
  let frameCount = 0;
  let lastFpsTime = performance.now();

  // Hover state
  let hoverTimer: number | null = null;
  let lastHoverId: number | null = null;
  let lastMouseClientX = 0;
  let lastMouseClientY = 0;

  // ── helpers ──

  function setProgress(pct: number, label: string): void {
    loadingProgressEl.style.width = `${pct}%`;
    loadingStatusEl.textContent = label;
  }

  function updateStyles(): void {
    if (!renderer) return;
    const styleTable = buildStyleTable(styleVisible, viewState.zoom);
    renderer.setStyleTable(styleTable);
    renderer.setLodStride(1); // LOD DISABLED - stride forced to 1
    dirty = true;
  }

  function cssToBacking(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ];
  }

  // ── async init ──

  void (async () => {
    if (!navigator.gpu) {
      setProgress(0, "WebGPU not available in this browser");
      return;
    }

    try {
      renderer = await WebGpuPointsRenderer.create({
        canvas,
        additiveBlending: true,  // Enable additive blending for glowing effect
        alphaMode: "premultiplied",
        clearColor: CLEAR_COLOR,
      });
    } catch (e) {
      setProgress(0, `WebGPU init failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    renderer.useSingleGeometryLayout();
    renderer.setPickPointDiameterPx(20);

    // resize canvas
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    renderer.resizeBackingStore(canvas.width, canvas.height);

    viewState = new ViewState(INITIAL_CENTER, INITIAL_ZOOM, 0, [canvas.clientWidth, canvas.clientHeight]);
    updateStyles();

    // load data
    try {
      towerData = await loadTowerData(setProgress);
      towerCountEl.textContent = towerData.pointCount.toLocaleString();

      // count by radio type
      const counts = [0, 0, 0, 0];
      const ids = towerData.styleIds;
      for (let i = 0; i < ids.length; i++) counts[ids[i]]!++;
      const elIds = ["count-nr", "count-lte", "count-umts", "count-gsm"];
      for (let i = 0; i < 4; i++) document.getElementById(elIds[i])!.textContent = counts[i]!.toLocaleString();

      renderer.setGeometry({
        buffer: {
          positions: towerData.positions,
          featureIds: towerData.featureIds,
          styleIds: towerData.styleIds,
        },
        vertexCount: towerData.pointCount,
      });
    } catch (e) {
      setProgress(0, `Load failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e);
      return;
    }

    // fade out loading
    loadingEl.classList.add("fade-out");
    setTimeout(() => loadingEl.remove(), 400);

    dirty = true;

    // ── render loop ──

    function renderLoop(timestamp: number): void {
      if (dirty) {
        renderer.renderWithViewState(viewState, { timeMs: timestamp });
        dirty = false;

        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
          fpsEl.textContent = Math.round((frameCount * 1000) / (now - lastFpsTime)).toString();
          frameCount = 0;
          lastFpsTime = now;
        }
      }
      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);

    // ── resize ──

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      renderer.resizeBackingStore(canvas.width, canvas.height);
      viewState = viewState.resize(canvas.clientWidth, canvas.clientHeight);
      dirty = true;
    });
    ro.observe(canvas);

    // ── mouse: pan ──

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        viewState = panByPixels(viewState, -dx, dy);
        dirty = true;
        zoomEl.textContent = viewState.zoom.toFixed(2);
      }
      lastX = e.clientX;
      lastY = e.clientY;
    });

    canvas.addEventListener("pointerup", () => { isDragging = false; });
    canvas.addEventListener("pointercancel", () => { isDragging = false; });

    // ── mouse: wheel zoom toward cursor ──

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const resolution = viewState.getResolution();
      const w = viewState.viewportSize[0];
      const h = viewState.viewportSize[1];
      const worldX = viewState.center[0] + (px - w / 2) * resolution;
      const worldY = viewState.center[1] - (py - h / 2) * resolution;
      viewState = zoomToward(viewState, factor, worldX, worldY);
      zoomEl.textContent = viewState.zoom.toFixed(2);
      updateStyles();
    }, { passive: false });

    // ── mouse: click pick ──

    canvas.addEventListener("click", async (e) => {
      if (!towerData) return;
      const [bx, by] = cssToBacking(e);
      const id = await renderer.pickFeatureIdAtCanvasPixel(Math.floor(bx), Math.floor(by));
      if (id === null) {
        popupEl.classList.remove("visible");
        return;
      }
      const meta = towerData.getTowerMeta(id);
      if (!meta) {
        popupEl.classList.remove("visible");
        return;
      }
      const badge = document.getElementById("popup-radio-badge")!;
      badge.textContent = meta.radio;
      badge.setAttribute("data-radio", meta.radio);
      document.getElementById("popup-mcc")!.textContent = meta.mcc;
      document.getElementById("popup-net")!.textContent = meta.net;
      document.getElementById("popup-range")!.textContent = `${meta.range} m`;
      popupEl.classList.add("visible");
    });

    // ── hover detection with map popover ──

    function updatePopoverPosition(clientX: number, clientY: number): void {
      const popupWidth = 200;
      const popupHeight = 120;
      const offset = 12;

      let x = clientX + offset;
      let y = clientY + offset;

      // Adjust if near right edge
      if (x + popupWidth > window.innerWidth - 16) {
        x = clientX - popupWidth - offset;
      }

      // Adjust if near bottom edge
      if (y + popupHeight > window.innerHeight - 16) {
        y = clientY - popupHeight - offset;
      }

      popupEl.style.left = `${x}px`;
      popupEl.style.top = `${y}px`;

      // Position the pointer indicator based on popup position relative to cursor
      const pointerRight = x > clientX;
      const pointerBottom = y > clientY;
      popupEl.dataset.pointerRight = String(pointerRight);
      popupEl.dataset.pointerBottom = String(pointerBottom);
    }

    canvas.addEventListener("pointermove", (e) => {
      if (!towerData || isDragging) return;

      // Store mouse position for popover positioning
      lastMouseClientX = e.clientX;
      lastMouseClientY = e.clientY;

      const [bx, by] = cssToBacking(e);
      const px = Math.floor(bx);
      const py = Math.floor(by);

      if (hoverTimer !== null) clearTimeout(hoverTimer);

      hoverTimer = window.setTimeout(async () => {
        const id = await renderer.pickFeatureIdAtCanvasPixel(px, py);
        if (id === lastHoverId) return;
        lastHoverId = id;

        if (id === null || id === undefined) {
          popupEl.classList.remove("visible");
          return;
        }

        const meta = towerData.getTowerMeta(id);
        if (!meta) {
          popupEl.classList.remove("visible");
          return;
        }

        const badge = document.getElementById("popup-radio-badge")!;
        badge.textContent = meta.radio;
        badge.setAttribute("data-radio", meta.radio);
        document.getElementById("popup-mcc")!.textContent = meta.mcc;
        document.getElementById("popup-net")!.textContent = meta.net;
        document.getElementById("popup-range")!.textContent = `${meta.range} m`;

        updatePopoverPosition(lastMouseClientX, lastMouseClientY);
        popupEl.classList.add("visible");
      }, 100);
    });

    canvas.addEventListener("pointerleave", () => {
      if (hoverTimer !== null) clearTimeout(hoverTimer);
      lastHoverId = null;
      popupEl.classList.remove("visible");
    });

    // ── legend toggles ──

    document.querySelectorAll(".legend-item").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.getAttribute("data-style") || "0", 10);
        const radioName = RADIO_NAMES[idx];
        styleVisible[idx] = !styleVisible[idx];
        item.classList.toggle("dimmed", !styleVisible[idx]);
        updateStyles();

        // Show popup with radio type summary
        const countEl = document.getElementById(`count-${radioName.toLowerCase()}`) as HTMLSpanElement;
        const badge = document.getElementById("popup-radio-badge")!;
        badge.textContent = radioName;
        badge.setAttribute("data-radio", radioName);
        document.getElementById("popup-mcc")!.textContent = "—" ;
        document.getElementById("popup-net")!.textContent = countEl.textContent + " towers";
        document.getElementById("popup-range")!.textContent = styleVisible[idx] ? "visible" : "hidden";
        popupEl.classList.add("visible");
      });
    });

    // ── keyboard zoom ──

    document.addEventListener("keydown", (e) => {
      if (e.key === "+" || e.key === "=") {
        viewState = viewState.zoomBy(0.3);
        zoomEl.textContent = viewState.zoom.toFixed(2);
        updateStyles();
        dirty = true;
      } else if (e.key === "-") {
        viewState = viewState.zoomBy(-0.3);
        zoomEl.textContent = viewState.zoom.toFixed(2);
        updateStyles();
        dirty = true;
      }
    });
  })();
}

main();
