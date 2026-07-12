# Getting Started with Stratum Map

Welcome! Stratum Map is a TypeScript library for high-performance map rendering using WebGPU. This guide will help you render your first map in under 15 minutes.

**What you'll learn:** How to set up Stratum Map, render point data, and handle basic interactions like pan and zoom.

**Prerequisites:** Familiarity with TypeScript and basic web development. No prior WebGPU or mapping experience needed.

---

## Installation

Add Stratum Map to your project:

```bash
npm install stratum-map
```

**Requirements:**
- Node.js >= 20
- TypeScript >= 5.7
- A WebGPU-enabled browser (Chrome 113+, Edge 113+, Firefox Nightly)

**Vite setup (recommended):** Stratum Map works best with Vite. If you're not using Vite, ensure your build tool supports WebGPU and ES modules.

---

## Your First Render

Let's create a simple map that renders point features. We'll use `bootstrapAuto()`, the fastest way to get started.

```typescript
import { bootstrapAuto, ViewState, MapController } from "stratum-map";

async function init() {
  // 1. Initialize WebGPU and create a canvas
  const { renderer, canvas } = await bootstrapAuto();
  document.body.appendChild(canvas);

  // 2. Create a ViewState for map camera parameters
  const viewState = new ViewState({
    center: [0, 0],      // [longitude, latitude] in EPSG:3857
    zoom: 0,            // Zoom level (0 = world view)
    rotation: 0,         // Rotation in radians
    width: 800,          // Canvas width in pixels
    height: 600,        // Canvas height in pixels
  });

  // 3. Create a MapController to manage the render lifecycle
  const controller = new MapController(renderer, viewState);

  // 4. Define point data as GeometryBufferView
  const points = {
    positions: new Float32Array([
      // Triangle: x, y (world coordinates)
      -10000000, -10000000,  // Bottom-left
       10000000, -10000000,  // Bottom-right
           0,  10000000,   // Top-center
    ]),
    featureIds: new Uint32Array([0, 0, 0]),
    styleIds: new Uint32Array([0, 0, 0]),
    vertexCount: 3,
  };

  // 5. Load data and start rendering
  controller.setPoints(points);
  controller.start();
}

init().catch(console.error);
```

**What's happening:**
- `bootstrapAuto()` handles WebGPU initialization and canvas creation
- `ViewState` defines the camera (center, zoom, rotation, viewport size)
- `MapController` manages the render loop and data updates
- `GeometryBufferView` (the `points` object) contains your feature data

Run this code and you'll see three points forming a triangle on a blank canvas.

---

## Understanding Key Concepts

### ViewState

`ViewState` encapsulates the map's camera parameters. It tells the renderer:

- **Where** to look (`center`: [longitude, latitude] in EPSG:3857)
- **How close** to look (`zoom`: 0-18, where 0 = world view)
- **Which direction** (`rotation`: radians, 0 = north-up)
- **How big** the viewport is (`width`, `height` in pixels)

Update the view to pan or zoom:

```typescript
viewState.center = [500000, 500000];  // Pan to new location
viewState.zoom = 2;                   // Zoom in
```

### MapController

`MapController` manages the rendering lifecycle:

- **setPoints():** Load point data into the renderer
- **start() / stop():** Control the render loop
- **dirty:** Boolean flag—set to `true` when view changes to trigger re-render

```typescript
// When view changes, mark as dirty for re-render
viewState.center = [newLon, newLat];
controller.dirty = true;
```

### GeometryBufferView

This structure contains your feature data:

```typescript
interface GeometryBufferView {
  positions: Float32Array;    // [x, y] pairs in world coordinates (EPSG:3857)
  featureIds: Uint32Array;    // One ID per vertex (for picking)
  styleIds: Uint32Array;      // One style ID per vertex (for styling)
  vertexCount: number;        // Total number of vertices
}
```

**Key points:**
- Coordinates are in EPSG:3857 (Web Mercator), not longitude/latitude
- `featureIds` enable clicking/hovering on features (picking)
- `styleIds` allow per-feature styling

---

## Coordinate Systems

Stratum Map uses two coordinate systems. Understanding them prevents rendering bugs.

### World Space (EPSG:3857)

- Used for **feature data** (positions in GeometryBufferView)
- Units are meters (projected Web Mercator)
- Example: `[0, 0]` is the null island (equator at prime meridian)

**Conversion from longitude/latitude:**

```typescript
// Simple approximation for near-equator locations
function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  const yMeters = (y * 20037508.34) / 180;
  return [x, yMeters];
}
```

### Screen Space

- Used for **user interactions** (mouse clicks, touches)
- Units are pixels (relative to canvas origin)
- Important for picking and event handling

**The critical rule:** Feature data in world space, user interactions in screen space. Never mix them.

---

## Progressive Examples

The `examples/` directory demonstrates four progressive usage patterns:

### 1. minimal-native (Beginner)

**What it shows:** The simplest working example—rendering 3 points in a triangle.

**Use when:** You're learning Stratum Map and want to understand the basics.

**Key concepts:** `bootstrapAuto()`, `ViewState`, `MapController`

**Run it:** `npm run demo:dev` and navigate to the minimal-native example.

### 2. standalone-rendering (Intermediate)

**What it shows:** Full manual setup without `bootstrapAuto()`, including pan/zoom controls.

**Use when:** You need custom initialization or want to understand the full rendering pipeline.

**Key concepts:** Manual `WebGpuPointsRenderer` creation, event handling for pan/zoom

**Run it:** `npm run demo:dev` and navigate to the standalone-rendering example.

### 3. integration-example (Advanced)

**What it shows:** Integration with OpenLayers, mode switching between OpenLayers and Stratum Map rendering.

**Use when:** You're integrating Stratum Map into an existing OpenLayers application.

**Key concepts:** OpenLayers interoperability, mode switching, canvas sharing

**Run it:** `npm run demo:dev` and navigate to the integration-example.

### 4. global-cell-towers (Real-World)

**What it shows:** Real-world application rendering 5.1 million cell towers with picking interactions.

**Use when:** You're building a production application with large datasets.

**Key concepts:** Data loading (FlatGeobuf), picking, performance optimization, popups

**Run it:** `npm run demo:dev` and navigate to the global-cell-towers example.

---

## Common Problems

### "WebGPU not available"

**Cause:** Browser doesn't support WebGPU or hardware acceleration is disabled.

**Fix:**
- Update to Chrome 113+ or Edge 113+
- Enable WebGPU: `chrome://flags/#enable-unsafe-webgpu` (Chrome) or `about:config` (Firefox)
- Ensure hardware acceleration is enabled in browser settings

### "Canvas shows nothing"

**Cause:** Usually incorrect coordinate system (longitude/latitude instead of EPSG:3857).

**Fix:** Convert coordinates to EPSG:3857:

```typescript
// Wrong (lon/lat):
positions: new Float32Array([0, 0, 10, 10, 20, 20])

// Correct (EPSG:3857):
positions: new Float32Array([0, 0, 1113194, 0, 2226389, 0])
```

### "Features don't appear after zoom"

**Cause:** ViewState viewport size doesn't match canvas size.

**Fix:** Update ViewState when canvas resizes:

```typescript
canvas.addEventListener("resize", () => {
  viewState.width = canvas.clientWidth;
  viewState.height = canvas.clientHeight;
  controller.dirty = true;
});
```

### "Performance drops with large datasets"

**Cause:** Too many features rendered at once or inefficient data structures.

**Fix:**
- Use chunked loading (see `global-cell-towers` example)
- Implement level-of-detail (LOD) scaling
- Enable GPU buffer pooling via `ChunkedGeometryController`

---

## Next Steps

You've rendered your first map! Here's where to go next:

**Advanced features:**
- **Picking:** Enable hover/click interactions on features (see `global-cell-towers` example)
- **Styling:** Apply colors and sizes based on feature properties
- **Data loading:** Load GeoJSON, FlatGeobuf, or WKB files
- **Performance:** Optimize for large datasets with chunking and LOD

**Documentation:**
- [USAGE.md](./USAGE.md) — Advanced usage patterns and API reference
- [HLD.md](./HLD.md) — High-level architecture design
- [LLD.md](./LLD.md) — Low-level implementation details
- [API docs](./api/index.html) — Generated API documentation

**Examples:**
- Explore the `examples/` directory for complete, working examples
- Check the source code for patterns you can adapt to your use case

Happy rendering!
