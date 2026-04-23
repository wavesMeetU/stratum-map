# Label decluttering

Screen-space **collision rejection** with **priority** ordering. Implemented by **`declutterLabels`** (`src/text/label-declutter.ts`); **`TextLayer`** wraps it when **`setDeclutterEnabled(true)`**.

---

## Module

```js
import {
  declutterLabels,
  projectMapAnchorToScreenPx,
  estimateLabelTextMetrics,
  type DeclutterOptions,
  type DeclutterResult,
  type DeclutterStats,
} from "stratum-map";
```

---

## `declutterLabels(labels, atlas, options)`

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `labels` | `readonly TextLabel[]` | Input labels (`visible: false` skipped). |
| `atlas` | `IGlyphAtlas` | Used for **`estimateLabelTextMetrics`**. |
| `options` | `DeclutterOptions` | See below. |

**`DeclutterOptions`**

| Field | Type | Description |
|-------|------|-------------|
| `mapToClipColumnMajor` | `Float32Array` | Same 4×4 as **`TextLayer.updateMapMatrix`**. |
| `viewportWidthPx` / `viewportHeightPx` | `number` | Backing store pixels (≥ 1). |
| `mapZoom` | `number \| null \| undefined` | If set to a **number**, applies **`minZoom` / `maxZoom`** on labels. **`null`/`undefined`** disables zoom filter. |
| `globalPaddingPx` | `number?` | Added to every collision box. |
| `cullExtent3857` | extent tuple? | Same semantics as **`TextLayer.setCullExtent`** (world prefilter). |
| `cullMarginWorld` | `number?` | Margin on world cull. |
| `debugRects` | `boolean?` | If `true`, fills **`DeclutterResult.debug`**. |

**Returns** `DeclutterResult`:

| Field | Type |
|-------|------|
| `accepted` | `readonly TextLabel[]` |
| `stats` | `DeclutterStats` |
| `debug` | `DeclutterDebugRects?` |

---

## Priority

- Labels sorted by **`priority` descending**, then **`id` ascending** (stable tie-break).
- **Higher `priority`** is placed first; later overlapping labels are **rejected** (`rejectedCollision`).

---

## Anchor

**`TextLabel.anchor`** positions the **collision AABB** relative to the projected screen anchor:

| Value | Box relative to anchor |
|-------|------------------------|
| `center` | Centered (default). |
| `top` | Anchor at top edge center. |
| `bottom` | Anchor at bottom edge center. |
| `left` | Anchor at middle-left. |
| `right` | Anchor at middle-right. |

Does not change GPU glyph quad placement inside **`layoutTextLabels`** today — declutter uses it for **overlap estimation** only.

---

## `minZoom` / `maxZoom`

Require **`options.mapZoom`** (or **`TextLayer.setMapZoom`**) as a **number**.

- `minZoom`: label skipped if `mapZoom < minZoom`.
- `maxZoom`: label skipped if `mapZoom > maxZoom`.

Counts appear in **`DeclutterStats.rejectedZoom`**.

---

## Collision model

1. World cull (optional extent).
2. Zoom filter.
3. Project anchor → screen px (**`projectMapAnchorToScreenPx`**).
4. Estimate label width/height px (**`estimateLabelTextMetrics`** + anchor + padding).
5. Drop if AABB fully outside viewport.
6. **Uniform grid** (≈96 px cells): test overlap only against candidates in touched cells; accept if no overlap with already accepted rects.

**Complexity:** roughly **O(n log n + n·k)** with **k** average labels per cell.

---

## `TextLayer` integration

```js
textLayer.setDeclutterEnabled(true);
textLayer.setDeclutterPadding(6);
textLayer.setMapZoom(map.getView().getZoom() ?? null);
textLayer.setViewport(canvas.width, canvas.height);
textLayer.updateMapMatrix(clipMat);
textLayer.setLabels(denseLabels);
textLayer.render(pass); // rebuilds inside render
const stats = textLayer.getLastDeclutterStats();
```

**Note:** **`updateMapMatrix`** marks dirty when declutter is on — expect per-frame rebuild cost while the map moves.

---

## Dense label cloud

```js
const labels = [];
for (let i = 0; i < 20_000; i++) {
  labels.push({
    id: i,
    x: xs[i],
    y: ys[i],
    text: `P${i}`,
    color: [1, 1, 1, 0.9],
    sizePx: 10,
    priority: (i % 7),
    anchor: "center",
    paddingPx: 1,
  });
}
textLayer.setDeclutterEnabled(true);
textLayer.setLabels(labels);
```

Cap input with **`setCullExtent`** + **`maxGlyphs`** on **`TextLayer.create`** so CPU stays bounded.

---

## Helper exports

| Function | Purpose |
|----------|---------|
| `projectMapAnchorToScreenPx(mat, x, y, vw, vh)` | Debug / tooling — same projection as `text.wgsl`. |
| `estimateLabelTextMetrics(label, atlas)` | Width/height estimate for custom overlays. |

---

## Performance tips

- Fewer labels in **`setLabels`** → faster sort + grid.
- **`setDeclutterDebug(false)`** in production (avoids rect arrays).
- For flicker control across frames, a future tile-stable policy is not built-in — current output is **per-frame independent**.
