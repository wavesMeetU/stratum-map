# `TextLayer`

Host-facing API: holds **`TextLabel[]`**, map transform, optional world cull, optional **declutter**, CPU layout → GPU instances, then records draws into an existing **`GPURenderPassEncoder`**.

Use **`TextLayer`** when integrating with OpenLayers (or any host) and **`TextRenderer`** only if you bypass this layer and drive instances yourself.

---

## Module

```js
import {
  TextLayer,
  createTextLayer,
  createTextLayerForPointsRenderer,
  type TextLayerOptions,
} from "stratum-map";
```

---

## Constructor (factory)

`TextLayer` has no public constructor. Use:

### `TextLayer.create(options)`

**Parameters**

| Option | Type | Description |
|--------|------|-------------|
| `device` | `GPUDevice` | Shared with your canvas / points renderer. |
| `format` | `GPUTextureFormat` | Must match swap chain / render target (e.g. `navigator.gpu.getPreferredCanvasFormat()`). |
| `canvas` | `HTMLCanvasElement` | Same canvas as WebGPU context; used for backing-store size and optional viewport defaults. |
| `dpr` | `number?` | Device pixel ratio for initial **bitmap** atlas; default `devicePixelRatio`. |
| `maxGlyphs` | `number?` | Cap on **glyph** instances per frame (default `500_000`). |

**Returns** `TextLayer` with a new **`GlyphAtlas`** and **`TextRenderer`**.

### `TextLayer.createForPointsRenderer(renderer, options?)`

Convenience over **`create`**: reads **`renderer.getDevice()`**, **`renderer.getCanvasFormat()`**, **`renderer.getCanvas()`**.

| Option | Type |
|--------|------|
| `dpr` | `number?` |
| `maxGlyphs` | `number?` |

### `createTextLayer(options)` / `createTextLayerForPointsRenderer(renderer, options?)`

Function aliases for the same factories.

---

## Methods

### `setLabels(labels)`

- **Parameters:** `labels: readonly TextLabel[]`
- **Returns:** `void`
- **Description:** Replaces the label list. Skips work if deep-equal to previous (including optional declutter fields).
- **Note:** Each label is expanded to many glyphs; total glyphs must stay under **`maxGlyphs`**.

---

### `updateMapMatrix(columnMajor4x4)`

- **Parameters:** `columnMajor4x4: Float32Array` — length **16**, column-major 4×4: map `(x, y, 0, 1)` → clip (same convention as OpenLayers custom WebGL / `frameState` helpers).
- **Returns:** `void`
- **Description:** Copies the matrix for layout and for **`TextRenderer`** uniforms. If **declutter** is enabled, marks layout dirty so screen collisions refresh on pan/zoom.

> **OpenLayers naming:** This is the transform you typically build from `frameState` (e.g. map projection coordinates → NDC). The API name is **`updateMapMatrix`**, not `setMapMatrix`.

---

### `setViewport(widthPx, heightPx)`

- **Parameters:** `widthPx: number | null`, `heightPx: number | null`
- **Returns:** `void`
- **Description:** Overrides **viewport width/height in pixels** for **`TextRenderer`** uniforms and for **declutter** projection. **`null`** for a component stores `null` for that side; both `null` clears overrides so **`canvas.width` / `canvas.height`** are used again.
- **Note:** In OL demos, pass **`canvas.width` / `canvas.height`** each `postrender` if the backing store tracks the map size after **`resizeToDisplaySize()`**.

---

### `setMapZoom(zoom)`

- **Parameters:** `zoom: number | null` — e.g. `map.getView().getZoom()`. **`null`** disables **`minZoom` / `maxZoom`** filtering on labels.
- **Returns:** `void`
- **Description:** When declutter is enabled, changing zoom marks layout dirty.

---

### `setDeclutterEnabled(enabled)`

- **Parameters:** `enabled: boolean`
- **Returns:** `void`
- **Description:** Turns **screen-space collision** filtering on or off. When on, **`rebuildInstancesIfDirty`** runs **`declutterLabels`** before **`layoutTextLabels`**.

---

### `setDeclutterPadding(px)`

- **Parameters:** `px: number` — clamped ≥ 0; extra **CSS px** added to every collision box (in addition to each label’s **`paddingPx`**).
- **Returns:** `void`

---

### `setDeclutterDebug(enabled)`

- **Parameters:** `enabled: boolean`
- **Returns:** `void`
- **Description:** When `true`, the next declutter pass may fill **`getDeclutterDebugRects()`** (small CPU overhead).

---

### `getLastDeclutterStats()` / `getDeclutterDebugRects()`

- **Returns:** `DeclutterStats | null` / `DeclutterDebugRects | null`
- **Description:** Snapshot from the **last** `rebuildInstancesIfDirty` when declutter was on and debug was on, respectively.

---

### `setCullExtent(extent3857, marginWorld?)`

- **Parameters:** `extent3857: [minX, minY, maxX, maxY] | null`, `marginWorld = 0`
- **Returns:** `void`
- **Description:** World-space AABB filter (same CRS as label anchors). `null` clears culling.

---

### `cullOffscreen()`

- **Returns:** `void`
- **Description:** Marks layout dirty if you moved a spatial index but kept the same **`setLabels`** reference.

---

### `rebuildInstancesIfDirty()`

- **Returns:** `void`
- **Description:** Runs declutter (if enabled) + **`layoutTextLabels`** + uploads instance buffer. Normally invoked from **`render`**; call explicitly if you need **`getLastDeclutterStats()`** before **`render`** in the same frame.

---

### `setDefaultHalo(style)` / `setGlobalOutline(style)` / `setMsdfPixelRange(pxRange)`

- **Halo:** `style: { widthPx, color } | null` — default for labels missing halo fields (MSDF).
- **Outline:** uniform behind glyphs; **`null`** clears.
- **MSDF range:** `number | null` — overrides atlas distance range for AA.

---

### `render(pass)`

- **Parameters:** `pass: GPURenderPassEncoder` — same pass as points (or your clear/load strategy).
- **Returns:** `void`
- **Description:** **`rebuildInstancesIfDirty()`** then **`TextRenderer.render(pass, TextViewState)`** (matrix, viewport from overrides or canvas, MSDF/outline options).

---

### `resize()`

- **Returns:** `void`
- **Description:** If atlas **`scalesWithDpr !== false`** (bitmap), rebuilds atlas on meaningful DPR change and **`rebindAtlas`**. MSDF atlases skip GPU rebuild. If declutter is enabled, marks dirty so projection updates after canvas resize.

---

### `replaceAtlas(atlas)`

- **Parameters:** `atlas: IGlyphAtlas`
- **Returns:** `void`
- **Description:** Swaps atlas and GPU bind group. **Caller must `destroy()`** the previous atlas if it is no longer referenced elsewhere.

---

### `getAtlas()`

- **Returns:** `IGlyphAtlas` — use before **`replaceAtlas`** to destroy the outgoing atlas.

---

### `destroy()`

- **Returns:** `void`
- **Description:** Destroys atlas and **`TextRenderer`** GPU resources.

---

## OpenLayers `postrender`

Build the same **column-major** map→clip matrix you use for custom WebGL layers (often from `frameState.coordinateToPixelTransform` and size). Each OL render:

```js
import Map from "ol/Map.js";

// clipMat: Float32Array(16) filled from frameState
map.on("postrender", (evt) => {
  const fs = evt.frameState;
  if (!fs || !renderer || !textLayer) return;

  frameStateToClipMatrix(fs, clipMat);
  renderer.setMapToClipMatrix(clipMat);
  textLayer.updateMapMatrix(clipMat);

  if (fs.extent) {
    textLayer.setCullExtent(
      [fs.extent[0], fs.extent[1], fs.extent[2], fs.extent[3]],
      0,
    );
  } else {
    textLayer.setCullExtent(null);
  }

  textLayer.setViewport(canvas.width, canvas.height);
  textLayer.setMapZoom(map.getView().getZoom() ?? null);
  textLayer.setLabels(myLabels);

  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  renderer.encodeRenderPass(pass, { timeMs: fs.time });
  textLayer.render(pass);
  pass.end();
  device.queue.submit([encoder.finish()]);
});
```

---

## Shared render pass with points

Order matters for your **`loadOp`** strategy: typically **clear once**, draw **points** (additive or alpha sprites), then **text** (alpha blended), then **`pass.end()`**. Both **`encodeRenderPass`** and **`textLayer.render`** only append commands; they do not begin/end the pass.

---

## Dense label cloud with declutter

```js
textLayer.setDeclutterEnabled(true);
textLayer.setDeclutterPadding(4);
textLayer.setMapZoom(map.getView().getZoom() ?? null);

const labels = features.map((f, i) => ({
  id: f.id,
  x: f.geometry.x,
  y: f.geometry.y,
  text: f.name,
  color: [0.95, 0.95, 0.95, 1],
  sizePx: 11,
  priority: f.importance,
  anchor: "left",
  paddingPx: 1,
}));

textLayer.setLabels(labels);
// render(pass) → stats available:
const s = textLayer.getLastDeclutterStats();
```

See [LabelDeclutter.md](./LabelDeclutter.md) for priority, anchor, and collision model.

---

## Migration from Canvas2D labels

| Canvas2D | `TextLayer` |
|----------|-------------|
| `ctx.fillText` in pixel space | Labels in **map CRS** + **`updateMapMatrix`** from OL |
| Per-frame string layout | **`setLabels`**; CPU layout batches glyphs |
| `devicePixelRatio` font sizing | Bitmap atlas: **`resize()`** rebuilds on DPR; MSDF: fixed atlas, sharp at zoom |
| Overlap hacks (manual skip) | **`setDeclutterEnabled(true)`** + **`priority`** |
| Separate canvas overlay | Same **WebGPU canvas** as points; one composited surface |

**Performance:** Prefer a capped label set (e.g. only features in view + max count). Use **`setCullExtent`** to drop world-distant labels before glyph layout.

---

## Performance tips

- **`maxGlyphs`** caps CPU layout and GPU vertex upload — set from your worst-case in-view budget.
- **`setLabels`**: avoid allocating a new array every frame if nothing changed; equality short-circuits.
- **Declutter:** `updateMapMatrix` marks dirty every frame while enabled — expected cost for moving maps; reduce label count or disable when not needed.
- **MSDF** for production sharpness; **bitmap** for zero-asset debugging (see [GlyphAtlas.md](./GlyphAtlas.md)).
