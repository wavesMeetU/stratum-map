# `TextRenderer`

Low-level WebGPU text draw: one **render pipeline**, one **uniform buffer**, one **atlas bind group**, instanced **unit quad** × glyph count. Does **not** own the atlas texture lifecycle — the host (**`TextLayer`** or your code) supplies an **`IGlyphAtlas`** and calls **`rebindAtlas`** when it changes.

---

## Module

```js
import { TextRenderer, type TextRendererOptions } from "stratum-map";
import type { TextViewState } from "stratum-map";
```

---

## Constructor

### `TextRenderer.create(options)`

**`TextRendererOptions`**

| Property | Type | Description |
|----------|------|-------------|
| `device` | `GPUDevice` | GPU device. |
| `format` | `GPUTextureFormat` | Color target format of the render pass (must match attachment). |
| `atlas` | `IGlyphAtlas` | Initial atlas (bitmap or MSDF). |

**Returns** `TextRenderer`.

---

## Methods

### `rebindAtlas(atlas)`

- **Parameters:** `atlas: IGlyphAtlas`
- **Returns:** `void`
- **Description:** Recreates sampler (from **`atlas.atlasSampleModes()`**) and bind group pointing at **`atlas.getTextureView()`**. Use after DPR bitmap rebuild or MSDF swap.

---

### `setGlyphInstances(instanceData, glyphCount)`

- **Parameters:**
  - `instanceData: Float32Array` — interleaved per glyph; length ≥ **`glyphCount * TEXT_INSTANCE_FLOAT_STRIDE`** (see [TextTypes.md](./TextTypes.md)).
  - `glyphCount: number` — number of glyphs (instances), not labels.
- **Returns:** `void`
- **Description:** Grows or shrinks GPU vertex buffer as needed; uploads instance slice.

---

### `render(pass, viewState)`

- **Parameters:**
  - `pass: GPURenderPassEncoder`
  - `viewState: TextViewState` — map matrix, viewport px, optional MSDF/outline overrides.
- **Returns:** `void`
- **Description:** Writes frame uniform buffer (includes bitmap vs MSDF mode, screen px range, packed outline), binds pipeline and buffers, **`draw(6, instanceCount)`**. No-op if **`glyphCount ≤ 0`**.

---

### `getAtlas()` / `getDevice()`

- **Returns:** Current **`IGlyphAtlas`** / **`GPUDevice`**.

---

### `destroy()`

- **Returns:** `void`
- **Description:** Destroys internal GPU buffers (quad, instances, frame uniform). **Does not** destroy the atlas — host owns it.

---

## Instance layout

Stride **`TEXT_INSTANCE_FLOAT_STRIDE`** (20 floats = 80 bytes) per glyph. Built by **`layoutTextLabels`** in the library; custom producers must match **`text.wgsl`** vertex attributes (anchor, glyph offset, color, UVs, halo, size, halo width, padding floats).

---

## Notes

- **Blend:** Premultiplied-friendly alpha blend is configured on the pipeline target; match **`GPUCanvasContext.configure({ alphaMode })`** with your points layer (see `WebGpuPointsRenderer`).
- **Uniforms:** `TEXT_FRAME_UNIFORM_BYTE_LENGTH` bytes; do not assume a smaller packing when extending shaders.

---

## Example (custom host, no `TextLayer`)

```js
import { TextRenderer, layoutTextLabels, GlyphAtlas } from "stratum-map";

const atlas = GlyphAtlas.create(device, devicePixelRatio);
const textRenderer = TextRenderer.create({ device, format, atlas });

const { instanceData, instanceCount } = layoutTextLabels(labels, atlas, {
  maxGlyphs: 50_000,
});

textRenderer.setGlyphInstances(instanceData, instanceCount);
textRenderer.render(pass, {
  mapToClipColumnMajor: clipMat,
  viewportWidthPx: canvas.width,
  viewportHeightPx: canvas.height,
});
```

For production integration, prefer **`TextLayer`** ([TextLayer.md](./TextLayer.md)) so declutter, cull extent, and DPR/MSDF swaps stay consistent.
