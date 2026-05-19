/**
 * Integration Example - MapController with Dual Mode Support
 *
 * This example demonstrates how to use MapController with both:
 * 1. OpenLayers-managed rendering (legacy compatibility)
 * 2. Standalone rendering (new standalone path)
 *
 * The example shows how to:
 * - Create a MapController
 * - Switch between modes at runtime
 * - Handle resize events
 * - Update ViewState
 * - Use callbacks for frame timing
 */

import { WebGpuPointsRenderer } from '../../dist/renderer/webgpu-points-renderer.js';
import { MapController, type RenderMode } from '../../dist/map-controller.js';
import { ViewState } from '../../dist/core/view-state.js';
import { OpenLayersFrameStateAdapter } from '../../dist/core/openlayers-adapter.js';

// Track current mode
let currentMode: RenderMode = 'openlayers';

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
 * Example 1: OpenLayers-managed rendering (legacy compatibility)
 *
 * In this mode, MapController delegates frame timing to OpenLayers.
 * The renderer is updated in OpenLayers' postrender event.
 */
async function exampleOpenLayersMode() {
  console.log('=== OpenLayers-managed Rendering Example ===');

  // Check WebGPU support
  if (!navigator.gpu) {
    console.error('WebGPU is not supported');
    return;
  }

  const container = document.getElementById('map-container')!;
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;

  // Create renderer
  const renderer = await WebGpuPointsRenderer.create({ canvas });

  // Generate sample data
  const { positions, featureIds, styleIds } = generateSamplePoints(10000);
  renderer.setGeometry({ positions, styleIds, featureIds });

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
    renderer.resizeToDisplaySize();
  });
  resizeObserver.observe(container);

  // In OpenLayers mode, we need to set up the render callback
  // This would typically be done in an OpenLayers postrender handler
  // For this example, we simulate it:
  controller.setOpenLayersRenderFrame(() => {
    // In OpenLayers mode, the controller doesn't control frame timing
    // OpenLayers calls this callback in its postrender event
    // This demonstrates how to integrate with OpenLayers
    console.log('OpenLayers would call this in postrender');
  });

  currentMode = 'openlayers';
  console.log('Mode: OpenLayers-managed');
}

/**
 * Example 2: Standalone rendering (new path)
 *
 * In this mode, MapController owns the render loop and uses requestAnimationFrame.
 * ViewState is managed directly, with full control over view updates.
 */
async function exampleStandaloneMode() {
  console.log('=== Standalone Rendering Example ===');

  // Check WebGPU support
  if (!navigator.gpu) {
    console.error('WebGPU is not supported');
    return;
  }

  const container = document.getElementById('map-container')!;
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;

  // Create renderer
  const renderer = await WebGpuPointsRenderer.create({ canvas });

  // Generate sample data
  const { positions, featureIds, styleIds } = generateSamplePoints(10000);
  renderer.setGeometry({ positions, styleIds, featureIds });

  // Initial ViewState
  const initialViewState = new ViewState([0, 0], 10, 0, [800, 600]);

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
  setInterval(() => {
    angle += 0.01;
    const radius = 2000000;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    controller.pan(x, y);
  }, 16);

  // Example: Zoom in/out periodically
  let zoomLevel = 10;
  let zoomingIn = true;
  setInterval(() => {
    const delta = zoomingIn ? 0.05 : -0.05;
    zoomLevel += delta;

    if (zoomLevel < 5 || zoomLevel > 18) {
      zoomingIn = !zoomingIn;
    }

    controller.zoomBy(delta);
  }, 500);

  currentMode = 'standalone';
  console.log('Mode: Standalone');
}

/**
 * Example 3: Mode switching at runtime
 *
 * This shows how to switch between OpenLayers and standalone modes
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
  toggleButton.textContent = 'Switch to Standalone';
  toggleButton.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 10px 20px;
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  document.body.appendChild(toggleButton);

  let inOpenLayersMode = true;
  let controller: MapController | null = null;

  toggleButton.addEventListener('click', async () => {
    if (controller) {
      // Switch mode
      if (inOpenLayersMode) {
        console.log('Switching to Standalone mode...');
        controller.switchMode('standalone');
        controller.startRenderLoop();
        toggleButton.textContent = 'Switch to OpenLayers';
        inOpenLayersMode = false;
      } else {
        console.log('Switching to OpenLayers mode...');
        controller.switchMode('openlayers');
        controller.stopRenderLoop();
        toggleButton.textContent = 'Switch to Standalone';
        inOpenLayersMode = true;
      }
    }
  });

  // Initialize in OpenLayers mode
  exampleOpenLayersMode().then(() => {
    controller = window.controller;
  });
}

/**
 * UI for mode switching
 */
function createModeSwitchingUI() {
  const ui = document.createElement('div');
  ui.innerHTML = `
    <h3>Integration Example</h3>
    <p>This example demonstrates how to switch between OpenLayers-managed and standalone rendering modes.</p>
    <p>Current mode: <strong id="current-mode">Loading...</strong></p>
    <div style="margin-top: 10px;">
      <button id="ol-btn" style="padding: 8px 16px; margin-right: 8px;">OpenLayers Mode</button>
      <button id="sa-btn" style="padding: 8px 16px;">Standalone Mode</button>
      <button id="auto-btn" style="padding: 8px 16px;">Auto Switch Demo</button>
    </div>
  `;
  document.body.appendChild(ui);

  // Mode switching buttons
  document.getElementById('ol-btn')!.addEventListener('click', () => {
    window.location.hash = '#openlayers';
  });

  document.getElementById('sa-btn')!.addEventListener('click', () => {
    window.location.hash = '#standalone';
  });

  document.getElementById('auto-btn')!.addEventListener('click', () => {
    window.location.hash = '#auto';
  });

  // Handle hash navigation
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1) || 'openlayers';
    document.getElementById('current-mode')!.textContent = hash === 'openlayers' ? 'OpenLayers-managed' : 'Standalone';

    if (hash === 'openlayers') {
      exampleOpenLayersMode();
    } else if (hash === 'standalone') {
      exampleStandaloneMode();
    } else {
      exampleModeSwitching();
    }
  });

  // Initialize based on current hash
  if (window.location.hash.includes('standalone')) {
    exampleStandaloneMode();
  } else {
    exampleOpenLayersMode();
  }
}

// Create HTML
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MapController Integration Example</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #map-container {
      width: 100vw;
      height: 100vh;
    }
    canvas {
      display: block;
    width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="map-container">
    <canvas id="map-canvas"></canvas>
  </div>
</body>
</html>
`;

document.body.innerHTML = html;

// Start
createModeSwitchingUI();
