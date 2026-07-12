/**
 * Integration Example - MapController Mode Transitions
 *
 * This example demonstrates rendering architecture migration patterns:
 * 1. OpenLayers-managed rendering (compatibility mode for existing apps)
 * 2. Standalone rendering (new standalone path)
 * 3. Runtime mode switching (migration path)
 *
 * Purpose:
 * - Show MapController dual-mode capability
 * - Demonstrate migration from managed to standalone rendering
 * - Illustrate ViewState management patterns
 * - Provide mode switching examples
 *
 * Note: This example demonstrates the API patterns and mode transitions.
 * It does not embed a live OpenLayers map.
 */

import { WebGpuPointsRenderer, MapController, ViewState, type RenderMode } from '../../src/index.js';

// Track current mode and shared controller
let currentMode: RenderMode = 'openlayers';
let sharedController: MapController | null = null;

/**
 * Generate sample point data
 */
function generateSamplePoints(count: number): { positions: Float32Array; featureIds: Uint32Array; styleIds: Uint16Array } {
  const positions = new Float32Array(count * 2);
  const featureIds = new Uint32Array(count);
  const styleIds = new Uint16Array(count);

  for (let i = 0; i < count; i++) {
    // Create a grid of points
    const gridSize = Math.ceil(Math.sqrt(count));
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;

    const x = (col - gridSize / 2) * 50000;
    const y = (row - gridSize / 2) * 50000;

    positions[i * 2] = x;
    positions[i * 2 + 1] = y;

    featureIds[i] = i;
    styleIds[i] = Math.floor(Math.random() * 3);
  }

  return { positions, featureIds, styleIds };
}

/**
 * Example 1: OpenLayers-managed rendering (compatibility mode)
 *
 * In this mode, MapController delegates frame timing to an external system
 * (e.g., OpenLayers postrender event). The renderer doesn't control the loop.
 */
async function exampleOpenLayersMode(): Promise<MapController> {
  console.log('=== OpenLayers-managed Rendering Example ===');

  // Check WebGPU support
  if (!navigator.gpu) {
    console.error('WebGPU is not supported');
    throw new Error('WebGPU not supported');
  }

  const container = document.getElementById('map-container')!;
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;

  if (!container || !canvas) {
    throw new Error('Required DOM elements not found');
  }

  // Create renderer
  const renderer = await WebGpuPointsRenderer.create({ canvas });

  // Generate sample data
  const { positions, featureIds, styleIds } = generateSamplePoints(10000);
  renderer.setGeometry({
    buffer: { positions, featureIds, styleIds },
    vertexCount: 10000
  });

  // Create MapController in OpenLayers mode
  const controller = new MapController({
    renderer,
    mode: 'openlayers',
    onBeforeRender: (frameIndex, timestamp) => {
      console.log(`Frame ${frameIndex} (OpenLayers mode)`);
    }
  });

  // Resize handler for OpenLayers mode
  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    controller.handleResize(width, height);
  });
  resizeObserver.observe(container);

  // In OpenLayers mode, an external system controls frame timing
  // For demonstration, we set a callback that would be called by OpenLayers
  controller.setOpenLayersRenderFrame(() => {
    // In real OpenLayers integration, this would be called in postrender
    console.log('External render callback invoked');
  });

  // Simulate external frame timing for demo
  let frameIndex = 0;
  const frameInterval = setInterval(() => {
    controller.renderFrame(performance.now());
    frameIndex++;
    if (frameIndex > 10) {
      clearInterval(frameInterval);
      console.log('OpenLayers mode demo complete');
    }
  }, 100);

  currentMode = 'openlayers';
  console.log('Mode: OpenLayers-managed');
  return controller;
}

/**
 * Example 2: Standalone rendering (new path)
 *
 * In this mode, MapController owns the render loop and uses requestAnimationFrame.
 * ViewState is managed directly, with full control over view updates.
 */
async function exampleStandaloneMode(): Promise<MapController> {
  console.log('=== Standalone Rendering Example ===');

  // Check WebGPU support
  if (!navigator.gpu) {
    console.error('WebGPU is not supported');
    throw new Error('WebGPU not supported');
  }

  const container = document.getElementById('map-container')!;
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;

  if (!container || !canvas) {
    throw new Error('Required DOM elements not found');
  }

  // Create renderer
  const renderer = await WebGpuPointsRenderer.create({ canvas });

  // Generate sample data
  const { positions, featureIds, styleIds } = generateSamplePoints(10000);
  renderer.setGeometry({
    buffer: { positions, featureIds, styleIds },
    vertexCount: 10000
  });

  // Initial ViewState
  const { width, height } = container.getBoundingClientRect();
  const initialViewState = new ViewState([0, 0], 10, 0, [width, height]);

  // Create MapController in standalone mode
  const controller = new MapController({
    renderer,
    mode: 'standalone',
    initialViewState,
    onBeforeRender: (frameIndex, timestamp) => {
      console.log(`Frame ${frameIndex} (Standalone mode)`);
    }
  });

  // Resize handler for standalone mode
  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    controller.handleResize(width, height);
  });
  resizeObserver.observe(container);

  // Start render loop
  controller.startRenderLoop();

  // Example: Pan periodically
  let angle = 0;
  let lastX = 0;
  let lastY = 0;
  const panInterval = setInterval(() => {
    angle += 0.01;
    const radius = 2000000;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    // pan() expects deltas, not absolute positions
    controller.pan(x - lastX, y - lastY);
    lastX = x;
    lastY = y;
  }, 16);

  // Example: Zoom in/out periodically
  let zoomLevel = 10;
  let zoomingIn = true;
  const zoomInterval = setInterval(() => {
    const delta = zoomingIn ? 0.05 : -0.05;
    zoomLevel += delta;

    if (zoomLevel < 5 || zoomLevel > 18) {
      zoomingIn = !zoomingIn;
    }

    controller.zoomBy(delta);
  }, 500);

  // Store intervals for cleanup
  (controller as any)._demoIntervals = [panInterval, zoomInterval];

  currentMode = 'standalone';
  console.log('Mode: Standalone');
  return controller;
}

/**
 * Example 3: Mode switching at runtime
 *
 * This shows how to switch between OpenLayers-managed and standalone modes.
 * The switch preserves the current ViewState and rendering state.
 */
function exampleModeSwitching() {
  console.log('=== Mode Switching Example ===');

  // In a real application, you might start in OpenLayers mode
  // and provide a user option to switch to standalone mode
  // or vice versa

  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;

  // Simulate mode switching button
  const toggleButton = document.createElement('button');
  toggleButton.id = 'mode-toggle-button';
  toggleButton.textContent = 'Switch to Standalone';
  document.body.appendChild(toggleButton);

  let inOpenLayersMode = true;

  toggleButton.addEventListener('click', async () => {
    if (sharedController) {
      // Clear any demo intervals
      const intervals = (sharedController as any)._demoIntervals;
      if (intervals) {
        intervals.forEach((interval: number) => clearInterval(interval));
      }

      // Switch mode
      if (inOpenLayersMode) {
        console.log('Switching to Standalone mode...');
        sharedController.switchMode('standalone');
        sharedController.startRenderLoop();
        toggleButton.textContent = 'Switch to OpenLayers';
        inOpenLayersMode = false;

        // Start standalone animation
        exampleStandaloneMode().then((ctrl) => {
          sharedController = ctrl;
        });
      } else {
        console.log('Switching to OpenLayers mode...');
        sharedController.switchMode('openlayers');
        sharedController.stopRenderLoop();
        toggleButton.textContent = 'Switch to Standalone';
        inOpenLayersMode = true;

        // Start OpenLayers simulation
        exampleOpenLayersMode().then((ctrl) => {
          sharedController = ctrl;
        });
      }
    }
  });

  // Initialize in OpenLayers mode
  exampleOpenLayersMode().then((ctrl) => {
    sharedController = ctrl;
  });
}

/**
 * UI for mode switching
 */
function createModeSwitchingUI() {
  const ui = document.createElement('div');
  ui.className = 'mode-switching-ui';
  ui.innerHTML = `
    <h3>MapController Integration Example</h3>
    <p>This example demonstrates MapController mode transitions and rendering patterns.</p>
    <p>Current mode: <strong id="current-mode">Loading...</strong></p>
    <div style="margin-top: 10px;">
      <button id="ol-btn" style="padding: 8px 16px; margin-right: 8px;">OpenLayers Mode</button>
      <button id="sa-btn" style="padding: 8px 16px;">Standalone Mode</button>
      <button id="auto-btn" style="padding: 8px 16px;">Auto Switch Demo</button>
    </div>
  `;
  document.body.appendChild(ui);

  // Mode switching buttons
  const olBtn = document.getElementById('ol-btn');
  const saBtn = document.getElementById('sa-btn');
  const autoBtn = document.getElementById('auto-btn');

  olBtn?.addEventListener('click', () => {
    window.location.hash = '#openlayers';
    location.reload();
  });

  saBtn?.addEventListener('click', () => {
    window.location.hash = '#standalone';
    location.reload();
  });

  autoBtn?.addEventListener('click', () => {
    window.location.hash = '#auto';
    location.reload();
  });

  // Update mode display based on current hash
  const hash = window.location.hash.substring(1) || 'openlayers';
  const modeDisplay = document.getElementById('current-mode');
  if (modeDisplay) {
    modeDisplay.textContent = hash === 'openlayers' ? 'OpenLayers-managed (Simulation)' :
                            hash === 'standalone' ? 'Standalone (Animation)' :
                            'Auto-Switching Demo';
  }

  // Handle initial mode
  if (hash === 'openlayers') {
    exampleOpenLayersMode().then((ctrl) => {
      sharedController = ctrl;
    });
  } else if (hash === 'standalone') {
    exampleStandaloneMode().then((ctrl) => {
      sharedController = ctrl;
    });
  } else {
    exampleModeSwitching();
  }
}

// Start the example
createModeSwitchingUI();
