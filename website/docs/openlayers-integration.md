---
sidebar_position: 4
---

# OpenLayers integration

## Pattern

1. Stack a **WebGPU `<canvas>`** above or below OpenLayers layers (CSS `position` + identical `width`/`height` in CSS pixels).
2. Listen to the map **`postrender`** event (or equivalent frame hook).
3. From `ol/Map` **`FrameState`**, build the same **column-major map → clip** matrix you would use for OL WebGL rendering.
4. Pass `frameState.time` (or `performance.now()`) into the renderer frame struct.

## Reference implementation

The repository demo (`examples/demo/main.ts`) wires:

- `ol/View` projection, center, resolution, rotation
- `frameStateToClipMatrix(fs, out)` compatible with WebGPU clip conventions
- `WebGpuPointsRenderer` + optional `TextLayer` + declutter debug overlay

Run locally:

```bash
npm run demo:dev
```

## Performance notes

- Keep **per-frame work** on the main thread to matrix upload, buffer patches, and draw submission.
- Prefer **worker-side** parsing for large GeoJSON so parsing does not block pan/zoom.

## Coordinate spaces

Use **canvas backing-store pixels** (device pixels) for pick queries and viewport uniforms, not CSS pixels, unless you explicitly scale.
