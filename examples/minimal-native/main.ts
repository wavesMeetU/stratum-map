import { bootstrapAuto, ViewState, MapController } from "../../src/index.js";

// ── constants ──────────────────────────────────────────────────

const POINT_COUNT = 1000;
const GRID_SIZE = 10000; // EPSG:3857 meters
const INITIAL_ZOOM = 10;
const INITIAL_CENTER: [number, number] = [0, 0];

// Global controller reference for UI updates
let globalController: MapController | null = null;

// ── point generation ────────────────────────────────────────────

function generatePoints(count: number) {
  const positions = new Float32Array(count * 2);
  const featureIds = new Uint32Array(count);
  const styleIds = new Uint16Array(count);

  for (let i = 0; i < count; i++) {
    // Random position within grid
    positions[i * 2] = (Math.random() - 0.5) * GRID_SIZE;
    positions[i * 2 + 1] = (Math.random() - 0.5) * GRID_SIZE;

    // Sequential feature IDs
    featureIds[i] = i + 1;

    // Single style (index 0)
    styleIds[i] = 0;
  }

  return {
    buffer: {
      positions,
      featureIds,
      styleIds
    },
    vertexCount: count
  };
}

// ── main ───────────────────────────────────────────────────────

async function main() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Canvas not found");
  }

  // Get canvas size for initial ViewState
  const dpr = window.devicePixelRatio ?? 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;

  try {
    // Bootstrap initialization
    const result = await bootstrapAuto({
      canvas,
      mode: "standalone",
      initialViewState: new ViewState(
        INITIAL_CENTER,
        INITIAL_ZOOM,
        0,
        [canvas.clientWidth, canvas.clientHeight]
      )
    });

    const { renderer, controller } = result;
    if (!controller) {
      throw new Error("MapController not created");
    }

    // Store controller reference globally
    globalController = controller;

    // Generate and set geometry
    const geometry = generatePoints(POINT_COUNT);
    renderer.setGeometry(geometry);

    // Set style (single blue style)
    renderer.setStyleTable([{
      color: [0, 0.5, 1, 1] as const, // Blue
      sizePx: 4,
    }]);

    // Setup UI
    document.getElementById("point-count")!.textContent = POINT_COUNT.toLocaleString();
    updateZoomDisplay();

    // Setup interactions
    setupInteractions(canvas, controller);

    // Setup FPS tracking
    setupFpsTracking();

    console.log("Minimal Native initialized successfully");
  } catch (e) {
    const errorDiv = document.getElementById("error")!;
    errorDiv.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
    errorDiv.style.display = "block";
    console.error("Failed to initialize:", e);
  }
}

// ── interactions ────────────────────────────────────────────────

function setupInteractions(canvas: HTMLCanvasElement, controller: any) {
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  // Pan (mouse drag)
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
    controller.panByPixels(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener("pointerup", () => {
    isDragging = false;
  });

  canvas.addEventListener("pointercancel", () => {
    isDragging = false;
  });

  // Zoom (wheel)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;

    // Calculate world position under cursor
    const view = controller.getViewState();
    const resolution = view.getResolution();
    const rect = canvas.getBoundingClientRect();
    const canvasX = canvas.width / rect.width;
    const canvasY = canvas.height / rect.height;

    // Cursor position in canvas pixels
    const cursorX = (e.clientX - rect.left) * canvasX;
    const cursorY = (e.clientY - rect.top) * canvasY;

    // Convert to world coordinates (EPSG:3857)
    const worldX = view.center[0] + (cursorX - canvas.width / 2) * resolution;
    const worldY = view.center[1] - (cursorY - canvas.height / 2) * resolution;

    controller.zoomToward(factor, worldX, worldY);
    updateZoomDisplay();
  }, { passive: false });

  // Resize (observer)
  const resizeObserver = new ResizeObserver(() => {
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    controller.handleResize(canvas.width, canvas.height);
  });
  resizeObserver.observe(canvas);
}

// ── fps tracking ───────────────────────────────────────────────

function setupFpsTracking() {
  const frameTimestamps: number[] = [];
  const FPS_WINDOW_MS = 1000; // 1-second rolling window
  let lastUpdate = 0;

  function trackFrame(timestamp: number) {
    frameTimestamps.push(timestamp);

    // Remove timestamps older than 1 second
    while (frameTimestamps.length > 0 && frameTimestamps[0]! <= timestamp - FPS_WINDOW_MS) {
      frameTimestamps.shift();
    }

    // Update display every 200ms
    if (timestamp - lastUpdate >= 200) {
      let fps = 0;
      if (frameTimestamps.length >= 2) {
        const oldest = frameTimestamps[0]!;
        const newest = frameTimestamps[frameTimestamps.length - 1]!;
        const elapsed = newest - oldest;
        fps = elapsed > 0 ? ((frameTimestamps.length - 1) * 1000) / elapsed : 0;
      }

      const fpsEl = document.getElementById("fps");
      if (fpsEl) {
        fpsEl.textContent = Math.round(fps).toString();
      }

      lastUpdate = timestamp;
    }

    // Continue tracking
    requestAnimationFrame(trackFrame);
  }

  // Start tracking
  requestAnimationFrame(trackFrame);
}

// ── zoom display ────────────────────────────────────────────────

function updateZoomDisplay() {
  const zoomEl = document.getElementById("zoom");
  if (zoomEl && globalController) {
    const view = globalController.getViewState();
    zoomEl.textContent = view.zoom.toFixed(2);
  }
}

// ── start ───────────────────────────────────────────────────────

main();
