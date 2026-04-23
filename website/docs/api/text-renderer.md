---
sidebar_position: 3
---

# TextRenderer

Low-level **WebGPU text pass** bound to an **`IGlyphAtlas`** implementation (bitmap or MSDF). Consumes packed **glyph instance** floats prepared by `TextLayer` / `layoutTextLabels`.

## Import

```ts
import { TextRenderer, type TextRendererOptions } from "stratum-map";
```

## Construction

### `TextRenderer.create(options: TextRendererOptions)`

| Field | Type | Description |
|-------|------|-------------|
| `device` | `GPUDevice` | WebGPU device |
| `format` | `GPUTextureFormat` | Render target format |
| `atlas` | `IGlyphAtlas` | Bitmap or MSDF atlas |

## Methods

| Method | Summary |
|--------|---------|
| `setAtlas(atlas)` | Swap atlas implementation (caller manages lifetime) |
| `setInstanceData(floats, count)` | Upload instance buffer |
| `encodeRenderPass(pass, frame)` | Encode draw into existing pass |
| `destroy()` | Release pipelines and buffers |

## Uniforms

`TEXT_FRAME_UNIFORM_BYTE_LENGTH` documents the frame block size. Instance stride: `TEXT_INSTANCE_FLOAT_STRIDE`.

## Performance notes

- Batch instance uploads; avoid resizing GPU buffers every label edit.
- MSDF path uses median **three-channel** sampling in WGSL (`TEXT_WGSL` export for inspection).

## See also

- [Glyph atlas](./glyph-atlas.md)
- [Text layer](./text-layer.md)
