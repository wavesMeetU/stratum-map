---
sidebar_position: 2
---

# TextLayer

Host-facing façade for **CPU text layout** → **`TextRenderer`** instance buffer. Owns a **`GlyphAtlas`** by default; call **`replaceAtlas`** to swap in **`MsdfGlyphAtlas`**.

## Import

```ts
import { TextLayer, createTextLayerForPointsRenderer } from "stratum-map";
```

## Construction

### `TextLayer.create(options: TextLayerOptions)`

| Field | Type | Description |
|-------|------|-------------|
| `device` | `GPUDevice` | Shared WebGPU device |
| `format` | `GPUTextureFormat` | Swapchain / render target format |
| `canvas` | `HTMLCanvasElement` | Layout / DPR reference |
| `dpr` | `number?` | Override device pixel ratio |
| `maxGlyphs` | `number?` | Cap emitted instances |

### `TextLayer.createForPointsRenderer(renderer, options?)`

Convenience: pulls `device`, `format`, and `canvas` from an existing `WebGpuPointsRenderer`.

## Label pipeline

1. `setLabels(labels: TextLabel[])` — map-anchored strings, priorities, halos.
2. `setMapToClipMatrix(m)` — same contract as points.
3. `setCullExtent(extent, margin?)` — optional map-space cull.
4. `rebuildInstancesIfDirty(view: TextViewState)` — CPU layout + declutter when dirty.

## Decluttering {#decluttering}

| Method | Purpose |
|--------|---------|
| `setDeclutterEnabled(on)` | Toggle screen-space collision |
| `setDeclutterPaddingPx(px)` | Extra collision padding |
| `setMapZoomForDeclutter(zoom)` | Zoom min/max gates on labels |
| `setDeclutterDebug(on)` | Emit debug rects (dev) |

## Performance notes

- Layout is **CPU O(n)** in label count; cap labels per view.
- MSDF avoids per-zoom atlas rebuild; bitmap atlas rebuilds on **DPR** changes.

## See also

- [Text renderer](./text-renderer.md)
- [MSDF glyph atlas](./msdf-glyph-atlas.md)
