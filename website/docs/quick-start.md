---
sidebar_position: 3
---

# Quick start

## Minimal renderer

```ts
import { createWebGpuPointsRenderer } from "stratum-map";

const canvas = document.querySelector("canvas")!;
const renderer = await createWebGpuPointsRenderer({
  canvas,
  alphaMode: "premultiplied",
});

// Each animation frame from your map:
renderer.setMapToClipMatrix(columnMajor4x4);
renderer.resize(); // when canvas backing store size changes
// Upload positionBuffer, styleIdBuffer, featureIdBuffer (see API)
renderer.beginFrame();
renderer.renderToCurrentTexture({ timeMs: performance.now() });
```

## Matrix contract

Pass a **column-major** 4×4 matrix mapping **map projection coordinates** (e.g. EPSG:3857 meters) to **WebGPU clip space** with \(w = 1\). This matches the matrix style OpenLayers uses for WebGL layers.

## Geometry layout

- **Single buffer** — `setGeometry` / `setVertexBuffers` style API for one contiguous vertex range.
- **Chunked** — per-key `GpuPointChunkSlot` buffers for worker tiles with incremental uploads and LRU eviction.

See [Points renderer API](./api/points-renderer.md) for method-level detail.

## Picking

Enable GPU picking on the renderer, then use `pickFeatureIdAtCanvasPixel(x, y)` with **backing-store** pixel coordinates, or compose [`PointHitTester`](./api/point-hit-tester.md) with your [`FeatureStore`](./api/feature-store.md).
