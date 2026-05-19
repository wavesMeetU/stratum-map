# MapController Guide

## Overview

The `MapController` class provides a standalone rendering lifecycle for the WebGPU map engine while maintaining full compatibility with OpenLayers-driven rendering.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     Application Layer                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                  MapController                          │ │
│ │                                                         │ │
│ │  ┌──────────────┐                 ┌──────────────┐ │ │
│ │  │              │                 │              │ │ │
│ │  │ ViewState     │                 │ Renderer     │ │ │ │
│ │  │              │                 │              │ │ │ │
│ │  └──────────────┘                 └──────────────┘ │ │ │
│ │                                                         │ │
│ │  ┌─────────────────────────────────────────────────────────┐ │ │
│ │  │                 Render Loop                 │ │ │ │
│ │  │  ┌─────────────────────────────────────────────┐ │ │ │
│ │  │  │             │             requestAnimationFrame  │ │ │
│ │  │  │  ┌──────────┐     └───────────────┘ │ │ │
│ │  │  │  ┌──────┐                        │ │ │
│ │  │  │  └──────┘   Dirty Flag Check   │ │ │
│ │  │  │                           (Optional)  │ │ │ │
│ │  └─────────────────────────────────────────────────────┘ │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │ │
│                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Dual Rendering Modes

#### Mode 1: OpenLayers-managed

In this mode, the controller delegates frame timing to OpenLayers.

**Flow:**
```
OpenLayers Map
    ↓
postrender event
    ↓
controller.setOpenLayersRenderFrame(callback)
    ↓
controller.renderFrame() delegates to callback
    ↓
OpenLayers handles GPU submission
```

**Use when:**
- Existing OpenLayers integration
- Gradual migration from OpenLayers
- Need OpenLayers features (vector layers, controls, etc.)

**Characteristics:**
- Frame timing controlled by OpenLayers
- Controller provides render callback via `setOpenLayersRenderFrame()`
- ViewState updates are still managed by application
- No internal render loop

#### Mode 2: Standalone

In this mode, the controller owns the render loop using `requestAnimationFrame`.

**Flow:**
```
controller.startRenderLoop()
    ↓
requestAnimationFrame loop
    ↓
controller.renderFrameIfNeeded(timestamp)
    ↓
Check dirty flag
    ↓
If dirty:
  controller.renderFrame(timestamp)
    ↓
renderer.renderWithViewState(viewState)
    ↓
GPU rendering
```

**Use when:**
- New standalone applications
- Full control over view state
- Custom frame timing
- Animation systems
- Performance optimization via dirty flags

**Characteristics:**
- Frame timing controlled by controller
- ViewState managed internally
- Automatic dirty flag optimization
- RequestAnimationFrame-based render loop

### Dirty Flag Optimization

The dirty flag prevents unnecessary re-renders:

```typescript
// View state changed
controller.updateViewState(newState);

// This marks the scene as dirty internally
// Next renderFrameIfNeeded() will:
// - Check if dirty
// - If dirty: render and clear dirty flag
// - If not dirty: skip render (performance win)

// Manual render (e.g., after data update)
controller.setDirty();  // Force render on next frame

// Check if render needed
if (controller.needsRender()) {
  // Scene will be re-rendered
}
```

**Benefits:**
- Avoid re-rendering when nothing changed
- Automatic optimization for view-only changes
- Manual override for data updates

## API Reference

### Constructor

```typescript
const controller = new MapController({
  renderer,           // WebGpuPointsRenderer instance
  mode: 'openlayers', // Optional: 'openlayers' or 'standalone'
  initialViewState,   // Optional: Initial ViewState (for standalone mode)
  onBeforeRender,     // Optional: Callback before each frame
  onAfterRender,      // Optional: Callback after each frame
});
```

### Core Methods

#### Mode Management

```typescript
// Get current mode
const mode = controller.getRenderMode(); // 'openlayers' | 'standalone'

// Switch mode at runtime
controller.switchMode('standalone');  // Instant, preserves view state
```

#### ViewState Management

```typescript
// Get current ViewState
const viewState = controller.getViewState();

// Update ViewState (marks dirty)
controller.updateViewState(newViewState);

// Pan by world coordinates
controller.pan(deltaX, deltaY);

// Pan by screen pixels (accounts for rotation)
controller.panByPixels(pixelDeltaX, pixelDeltaY);

// Zoom by delta
controller.zoomBy(deltaZoom);

// Zoom toward point
controller.zoomToward(zoomFactor, anchorX, anchorY);

// Rotate
controller.rotateBy(deltaRotation);

// Resize viewport
controller.resize(width, height);
```

#### Render Control

```typescript
// Start standalone render loop
controller.startRenderLoop();

// Stop standalone render loop
controller.stopRenderLoop();

// Set OpenLayers render callback (OpenLayers mode only)
controller.setOpenLayersRenderFrame(callback);

// Render a single frame (regardless of dirty flag)
controller.renderFrame(timestamp);

// Render only if dirty (returns true if rendered)
const wasRendered = controller.renderFrameIfNeeded(timestamp);

// Check if render needed
const needsRender = controller.needsRender();

// Force render on next frame
controller.setDirty();
```

#### Information

```typescript
// Get current frame index
const frameIndex = controller.getFrameIndex();

// Get current render mode
const mode = controller.getRenderMode();
```

#### Lifecycle

```typescript
// Release all resources
controller.release();
```

## Integration Examples

### Example 1: Standalone Map

```typescript
import { WebGpuPointsRenderer } from 'stratum-map';
import { MapController } from 'stratum-map';
import { ViewState } from 'stratum-map';

// Create renderer
const renderer = await WebGpuPointsRenderer.create({ canvas });

// Create controller in standalone mode
const controller = new MapController({
  renderer,
  mode: 'standalone',
  initialViewState: new ViewState([0, 0], 10, 0, [800, 600]),
  onBeforeRender: (frameIndex, timestamp) => {
    console.log(`Frame ${frameIndex}`);
  }
});

// Start render loop
controller.startRenderLoop();

// Later: Update view state
controller.zoomBy(1);
controller.pan(1000, 500);
```

### Example 2: OpenLayers Integration

```typescript
import { WebGpuPointsRenderer } from 'stratum-map';
import { MapController } from 'stratum-map';
import { OpenLayersFrameStateAdapter } from 'stratum-map';

// Create renderer
const renderer = await WebGpuPointsRenderer.create({ canvas });

// Create controller in OpenLayers mode
const controller = new MapController({
  renderer,
  mode: 'openlayers'
});

// In OpenLayers' postrender handler:
map.on('postrender', (evt) => {
  const frameState = evt.frameState;

  // Convert to ViewState for consistency
  const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(frameState);

  // Update controller's view state
  controller.updateViewState(viewState);

  // Set render callback (delegates to OpenLayers' frame timing)
  controller.setOpenLayersRenderFrame(() => {
    // OpenLayers will call this and handle GPU submission
  });
});
```

### Example 3: Mode Switching

```typescript
// Start in OpenLayers mode
let controller = new MapController({
  renderer,
  mode: 'openlayers'
});

// Later: Switch to standalone mode
controller.switchMode('standalone');
controller.startRenderLoop();

// Switch back to OpenLayers mode
controller.switchMode('openlayers');
controller.stopRenderLoop();

// Set OpenLayers render callback again
controller.setOpenLayersRenderFrame(() => {
  // Frame timing back to OpenLayers
});
```

## Migration Path

### From OpenLayers to MapController

**Before:**
```typescript
// Direct renderer usage
renderer.setMapToClipMatrix(clipMatrix);
renderer.render({ timeMs });
```

**After:**
```typescript
// MapController owns render lifecycle
const controller = new MapController({
  renderer,
  mode: 'openlayers'  // Start in OpenLayers mode
});

// In OpenLayers postrender:
const viewState = OpenLayersFrameStateAdapter.frameStateToViewState(frameState);
controller.updateViewState(viewState);
controller.setOpenLayersRenderFrame(() => {
  // OpenLayers handles frame timing
});
```

### From Direct ViewState to MapController

**Before:**
```typescript
// Manual ViewState management
let currentViewState = new ViewState([0, 0], 10, 0, [800, 600]);

// Manual render loop
function renderLoop() {
  renderer.renderWithViewState(currentViewState, { timeMs });
  requestAnimationFrame(renderLoop);
}
```

**After:**
```typescript
// MapController manages everything
const controller = new MapController({
  renderer,
  mode: 'standalone',
  initialViewState
});

// View state updates go through controller
controller.zoomBy(1);
controller.pan(1000, 500);

// Dirty flag optimization automatic
// Render loop managed by controller
controller.startRenderLoop();
```

## Best Practices

### Dirty Flag Usage

**DO:**
```typescript
// ❌ Render on every frame (inefficient)
controller.renderFrame();

// ❌ Set dirty on every view change
function onDrag() {
  controller.updateViewState(newState);
  controller.setDirty();  // Redundant - updateViewState already sets dirty
}
```

**DO:**
```typescript
// ✅ Update view state (automatically sets dirty)
controller.updateViewState(newState);

// ❌ Only set dirty for data updates, not view updates
function onDataUpdate() {
  controller.setDirty();  // Correct
}
```

### Mode Switching

**Guidelines:**
1. Switch modes only when necessary (e.g., removing OpenLayers dependency)
2. Preserve ViewState when switching (automatic)
3. Update UI to reflect mode change
4. Test both modes thoroughly

### Performance

**Recommendations:**
1. Use dirty flag optimization to avoid unnecessary re-renders
2. Batch view updates when possible
3. Use `needsRender()` before forcing renders
4. Profile performance in both modes during migration
5. Monitor FPS during mode transitions

## Troubleshooting

### Issue: Nothing renders

**Symptoms:**
- Canvas is blank
- No console output from callbacks

**Causes:**
1. Controller not started (`startRenderLoop()` not called in standalone mode)
2. Canvas size is 0 (resize handler not configured)
3. No data loaded (geometry not set)

**Solutions:**
1. Ensure `startRenderLoop()` is called in standalone mode
2. Configure resize handler
3. Load geometry before starting render loop

### Issue: Flickering on mode switch

**Symptoms:**
- Brief flash when switching modes
- Frame rate drop during transition

**Causes:**
1. Both render loops active during switch
2. ViewState not synchronized

**Solutions:**
1. Stop previous render loop before starting new one
2. Ensure ViewState is preserved during switch (automatic)
3. Use smooth transitions for UI updates

## Examples Location

- `examples/standalone-rendering/index.html` - Full standalone application
- `examples/integration-example/main.ts` - Dual mode example with runtime switching

## Further Reading

- `docs/OPENLAYS_MIGRATION.md` - Complete migration strategy
- `docs/REFACTORING_SUMMARY.md` - Detailed renderer refactoring
- `src/core/view-state.ts` - ViewState implementation
- `src/core/openlayers-adapter.ts` - OpenLayers adapter
