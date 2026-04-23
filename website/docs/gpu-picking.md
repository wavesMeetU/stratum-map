---
sidebar_position: 7
---

# GPU picking

## Model

The renderer can allocate an **offscreen RGBA8 target**, draw points with **packed feature ids** as color, and **copyTextureToBuffer** (or readback path) for a single pixel. Decoding uses `decodeFeatureIdFromRgba8Bytes`.

## Coordinates

Always pass **backing-store pixel** coordinates \([0, canvas.width) × [0, canvas.height)\) aligned with the WebGPU render target.

## Composition with FeatureStore

[`PointHitTester`](./api/point-hit-tester.md) wraps:

```text
renderer.pickFeatureIdAtCanvasPixel(x, y) → featureId → FeatureStore.getById
```

## Performance

Picking is **O(1)** per query relative to vertex count (one render + one readback), but has **fixed overhead** — avoid calling it every frame for hover unless throttled. Tune pick diameter / framebuffer size to balance precision vs cost.

## API

- Renderer: `pickFeatureIdAtCanvasPixel`, `resizePickTargetIfNeeded`, etc. — see [Points renderer](./api/points-renderer.md#picking).
- Hit tester: [Point hit tester](./api/point-hit-tester.md).
