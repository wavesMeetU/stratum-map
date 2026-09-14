import { WebGpuPointsRenderer } from "../../src/renderer/webgpu-points-renderer.js";
import { MapController } from "../../src/map-controller.js";
import { ViewState } from "../../src/core/view-state.js";

// ── Constants ─────────────────────────────────────────────────────────────

const POINT_COUNT = 50000;
const RADIUS = 1000000;
const INITIAL_CENTER: [number, number] = [0, 0];
const INITIAL_ZOOM = 10;

// ── Global state ──────────────────────────────────────────────────────────

let controller: MapController;
let renderer: WebGpuPointsRenderer;

// FPS counter state
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = "--";

// ── Point generation ──────────────────────────────────────────────────────

interface GeneratedData {
  positions: Float32Array;
  featureIds: Uint32Array;
  styleIds: Uint16Array;
}

function generateRandomPoints(count: number, centerX: number, centerY: number, radius: number): GeneratedData {
  const positions = new Float32Array(count * 2);
  const featureIds = new Uint32Array(count);
  const styleIds = new Uint16Array(count);

  for (let i = 0; i < count; i++) {
    // Random position within radius
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;

    positions[i * 2] = x;
    positions[i * 2 + 1] = y;

    featureIds[i] = i;
    styleIds[i] = Math.floor(Math.random() * 3);
  }

  return { positions, featureIds, styleIds };
}

// ── FPS tracking ─────────────────────────────────────────────────────────

function updateFPS(): void {
  const now = performance.now();
  frameCount++;

  if (now - lastFrameTime >= 1000) {
    fps = Math.round(frameCount * 1000 / (now - lastFrameTime)).toString();
    lastFrameTime = now;
    frameCount = 0;
    const fpsDisplay = document.getElementById("fps-display");
    if (fpsDisplay) {
      fpsDisplay.textContent = fps;
    }
  }
}

// ── UI updates ───────────────────────────────────────────────────────────

function updateUI(): void {
  const viewState = controller.getViewState();
  const zoomDisplay = document.getElementById("zoom-display");
  const centerDisplay = document.getElementById("center-display");

  if (zoomDisplay) {
    zoomDisplay.textContent = viewState.zoom.toFixed(2);
  }
  if (centerDisplay) {
    centerDisplay.textContent = `[${viewState.center[0].toFixed(0)}, ${viewState.center[1].toFixed(0)}]`;
  }
}

// ── Mouse interaction ─────────────────────────────────────────────────────

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function setupMouseInteraction(canvas: HTMLCanvasElement): void {
  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  canvas.addEventListener("mouseup", () => {
    isDragging = false;
  });

  canvas.addEventListener("mouseleave", () => {
    isDragging = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;

    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      // Pan by pixels (accounts for rotation)
      controller.panByPixels(dx, -dy); // -dy because screen Y is flipped
      updateUI();
    }

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  // Wheel zoom
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 1 : -1;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;

    controller.zoomToward(zoomFactor);
    updateUI();
  });

  // Keyboard zoom
  document.addEventListener("keydown", (e) => {
    if (e.shiftKey) {
      const delta = e.key === "=" ? 1 : -1;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      controller.zoomToward(zoomFactor);
      updateUI();
    }
  });

  // Double-click zoom to cursor
  canvas.addEventListener("dblclick", (e) => {
    const rect = canvas.getBoundingClientRect();
    // CSS pixels relative to the canvas (same space as viewportSize)
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen position to absolute world position.
    // zoomToward() expects a world-coordinate anchor, so the offset from
    // the viewport center must be added to the current world center.
    const viewState = controller.getViewState();
    const [width, height] = viewState.viewportSize;
    const resolution = viewState.getResolution();
    const dx = x - width / 2;
    const dy = y - height / 2;

    // Screen Y is flipped relative to world Y
    const worldX = viewState.center[0] + dx * resolution;
    const worldY = viewState.center[1] - dy * resolution;

    controller.zoomToward(2.0, worldX, worldY);
    updateUI();
  });
}

// ── Resize handling ────────────────────────────────────────────────────────

function setupResizeHandling(container: HTMLElement): void {
  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();

    // ViewState viewport stays in CSS pixels; the renderer derives the
    // backing-store size from clientWidth/clientHeight × devicePixelRatio.
    controller.handleResize(width, height);
    renderer.resizeToDisplaySize();
  });

  resizeObserver.observe(container);
}

// ── Initialization ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Check WebGPU support
  if (!navigator.gpu) {
    alert("WebGPU is not supported in this browser");
    return;
  }

  const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
  const container = document.getElementById("canvas-container") as HTMLElement;

  if (!canvas || !container) {
    console.error("Required DOM elements not found");
    return;
  }

  // Initialize canvas backing store (CSS size comes from the stylesheet;
  // the ResizeObserver below re-syncs after layout settles)
  const { width, height } = container.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;

  // Create renderer (manual setup - this example's educational purpose)
  renderer = await WebGpuPointsRenderer.create({ canvas });

  // Generate initial data
  const data = generateRandomPoints(POINT_COUNT, INITIAL_CENTER[0], INITIAL_CENTER[1], RADIUS);

  // Set geometry using correct API structure
  renderer.setGeometry({
    buffer: {
      positions: data.positions,
      featureIds: data.featureIds,
      styleIds: data.styleIds
    },
    vertexCount: POINT_COUNT
  });

  // Create initial ViewState
  const initialViewState = new ViewState(
    INITIAL_CENTER,
    INITIAL_ZOOM,
    0, // rotation
    [width, height]
  );

  // Create controller in standalone mode (manual setup)
  controller = new MapController({
    renderer,
    mode: "standalone",
    initialViewState,
    onBeforeRender: (frameIndex) => {
      const frameDisplay = document.getElementById("frame-display");
      if (frameDisplay) {
        frameDisplay.textContent = frameIndex.toString();
      }
    },
    onAfterRender: () => {
      updateFPS();
    }
  });

  // Setup interactions
  setupResizeHandling(container);
  setupMouseInteraction(canvas);

  // Update UI
  updateUI();

  // Start render loop
  controller.startRenderLoop();
}

// ── Start ─────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Initialization failed:", err);
});
