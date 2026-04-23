# `GlyphAtlas`

**Bitmap** glyph atlas: rasterizes ASCII **32–126** into a fixed **16×6** grid on the GPU via **`copyExternalImageToTexture`** from an **`OffscreenCanvas`**. Implements **`IGlyphAtlas`** for **`TextRenderer`** / **`TextLayer`**.

---

## Module

```js
import { GlyphAtlas } from "stratum-map";
```

---

## Constructor

### `GlyphAtlas.create(device, dpr?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `device` | `GPUDevice` | — | Target device. |
| `dpr` | `number` | `1` | Clamped ~**0.5–4**; drives cell pixel size for crisp UI text. |

**Returns** `GlyphAtlas`.

**Texture usage:** The atlas texture is created with **`TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT`** so Chromium’s **`copyExternalImageToTexture`** fast path is valid.

---

## Properties (read-only)

| Property | Type | Description |
|----------|------|-------------|
| `family` | `"bitmap"` | Atlas mode selector for shaders. |
| `scalesWithDpr` | `true` | **`TextLayer.resize()`** rebuilds atlas on DPR change. |
| `cellEmPx` | `number` | Reference em square for **`sizePx`** scaling in layout. |
| `cols` / `rows` | `number` | Grid dimensions (16 × 6). |

---

## `IGlyphAtlas` methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getTextureView()` | `GPUTextureView` | Sampled in fragment shader. |
| `getGlyphMetrics(code)` | `GlyphMetrics` | Per code point; invalid codes use fallback slot. |
| `atlasSampleModes()` | `{ magFilter, minFilter }` | Bitmap: **`nearest`**. |
| `destroy()` | `void` | Destroys GPU texture. |

---

## When to use bitmap vs MSDF

| Use bitmap | Use MSDF ([MsdfGlyphAtlas.md](./MsdfGlyphAtlas.md)) |
|------------|------------------------------------------------------|
| No offline assets; quick demos | Production maps; zoomed labels must stay sharp |
| Debugging layout / matrix issues | Linear filtering; halo/outline tuned in shader |
| Accept DPR-driven VRAM + rebuild cost | Fixed resolution; `scalesWithDpr === false` |

**Best practice:** Ship MSDF JSON+PNG from CI or a font tool; keep bitmap for tests and minimal repros.

---

## Example — default `TextLayer` atlas

`TextLayer.create` / `createForPointsRenderer` already constructs **`GlyphAtlas.create(device, dpr)`**.

---

## Example — manual replace after DPR

`TextLayer.resize()` normally recreates bitmap atlas internally. If you hold your own **`GlyphAtlas`**, pattern is:

```js
const prev = textLayer.getAtlas();
const next = GlyphAtlas.create(device, devicePixelRatio);
textLayer.replaceAtlas(next);
prev.destroy();
```

---

## Performance

- **Rebuild:** Full grid re-rasterize on DPR step — avoid thrashing **`devicePixelRatio`** during animated UI chrome changes.
- **Sampling:** Nearest — edges are resolution-dependent; zoom in and bitmap labels soften.
- **Memory:** One RGBA texture per atlas instance; size grows with **`cellEmPx`**.

---

## Notes

- **ASCII only** in layout (other Unicode maps to **`?`** glyph metrics).
- **OffscreenCanvas 2D** must be available in the environment where **`GlyphAtlas.create`** runs.
