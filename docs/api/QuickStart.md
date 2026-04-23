# Text & declutter — quick start

GPU text in **stratum-map** is split into three layers:

| Layer | Role |
|-------|------|
| **`TextLayer`** | Host API: labels, map matrix, cull extent, optional declutter, then `render(pass)` into your pass. |
| **`TextRenderer`** | Low-level: pipeline, uniforms, instance buffer, atlas bind group. |
| **`IGlyphAtlas`** | Bitmap (`GlyphAtlas`) or MSDF (`MsdfGlyphAtlas`) texture + metrics. |

Typical integration: one **`WebGpuPointsRenderer`** canvas, one **`TextLayer`** sharing device/format/canvas, labels updated when the map moves, both encoded into **one** `GPURenderPassEncoder`.

## Import

```js
import {
  TextLayer,
  createTextLayerForPointsRenderer,
  type TextLabel,
} from "stratum-map";
```

(Use the same module path your bundler resolves for the package root.)

## Further reading

| Topic | Page |
|-------|------|
| High-level host API | [TextLayer.md](./TextLayer.md) |
| Low-level draw API | [TextRenderer.md](./TextRenderer.md) |
| Bitmap atlas | [GlyphAtlas.md](./GlyphAtlas.md) |
| MSDF atlas | [MsdfGlyphAtlas.md](./MsdfGlyphAtlas.md) |
| Declutter algorithm & stats | [LabelDeclutter.md](./LabelDeclutter.md) |
| Types & constants | [TextTypes.md](./TextTypes.md) |

## Minimal checklist

1. Request **`GPUDevice`** and configure the canvas with **`GPUTextureUsage.RENDER_ATTACHMENT`** (see `WebGpuPointsRenderer`).
2. Build **`Float32Array(16)`** map→clip each frame (same convention as OpenLayers custom WebGL layers).
3. **`textLayer.updateMapMatrix(mat)`**, **`textLayer.setCullExtent(extent, margin)`** (optional), **`textLayer.setLabels(labels)`**.
4. **`beginRenderPass`** on the swap chain → **`pointsRenderer.encodeRenderPass(pass, frame)`** → **`textLayer.render(pass)`** → **`pass.end()`** → **`queue.submit`**.
5. On DPR change: **`pointsRenderer.resizeToDisplaySize()`** and **`textLayer.resize()`** (bitmap atlas rebuilds; MSDF skips GPU rebuild but declutter may still need a dirty pass).

## See also

- [TextLayer.md § OpenLayers example](./TextLayer.md#openlayers-postrender)
- [TextLayer.md § Shared pass](./TextLayer.md#shared-render-pass-with-points)
- [LabelDeclutter.md § Dense labels](./LabelDeclutter.md#dense-label-cloud)
- [TextLayer.md § Migration from Canvas2D](./TextLayer.md#migration-from-canvas2d-labels)
