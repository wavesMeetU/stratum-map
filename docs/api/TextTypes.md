# Text types & constants

Types and literals used by **`TextLayer`**, **`TextRenderer`**, **`layoutTextLabels`**, and **`declutterLabels`**.

## Module

```js
import type {
  TextLabel,
  TextLabelAnchor,
  TextViewState,
  IGlyphAtlas,
  GlyphMetrics,
  GlyphUv,
  AtlasFamily,
} from "stratum-map";
import {
  TEXT_INSTANCE_FLOAT_STRIDE,
  TEXT_FRAME_UNIFORM_BYTE_LENGTH,
} from "stratum-map";
import type { DeclutterStats, DeclutterDebugRects, ScreenRect } from "stratum-map";
```

`DeclutterStats` / `DeclutterDebugRects` / `ScreenRect` are re-exported from the package root alongside `declutterLabels`.

---

## `TextLabelAnchor`

```ts
type TextLabelAnchor = "center" | "top" | "bottom" | "left" | "right";
```

Used by declutter to place the screen-space collision box relative to the projected anchor. Default when omitted: **`"center"`**.

---

## `TextLabel`

Descriptor for one logical label (one string, one map anchor). Layout expands to **one GPU instance per glyph** (ASCII 32–126; other code points map to glyph `?`).

| Property | Type | Description |
|----------|------|-------------|
| `id` | `number` | Stable id (sort tie-break with declutter; not necessarily feature id). |
| `x`, `y` | `number` | Map-space anchor (e.g. EPSG:3857), same CRS as your `mapToClip` matrix. |
| `text` | `string` | Label string (ASCII recommended). |
| `color` | `[r,g,b,a]` | Linear 0–1 RGBA. |
| `sizePx` | `number` | Nominal size in **CSS pixels** (clamped internally). |
| `priority` | `number?` | Higher draws first in layout; wins declutter collisions. Default `0`. |
| `visible` | `boolean?` | If `false`, label skipped. Default `true`. |
| `haloColor`, `haloWidthPx` | optional | MSDF halo (per glyph); see [TextLayer.md](./TextLayer.md). |
| `minZoom`, `maxZoom` | `number?` | Declutter zoom gate; requires `TextLayer.setMapZoom`. |
| `anchor` | `TextLabelAnchor?` | Declutter collision box placement. |
| `paddingPx` | `number?` | Extra collision padding (plus layer `setDeclutterPadding`). |

---

## `TextViewState`

Passed to **`TextRenderer.render(pass, viewState)`** (usually built inside **`TextLayer.render`**).

| Property | Type | Description |
|----------|------|-------------|
| `mapToClipColumnMajor` | `Float32Array` | Length **16**, column-major 4×4: `(mapX, mapY, 0, 1)` → clip. |
| `viewportWidthPx` | `number` | Backing store width (≥ 1). |
| `viewportHeightPx` | `number` | Backing store height (≥ 1). |
| `msdfPixelRange` | `number?` | Overrides atlas SDF range for edge softness. |
| `globalOutlineWidthPx` | `number?` | Uniform outline behind glyphs (MSDF path). |
| `globalOutlineColor` | `[r,g,b,a]?` | Outline color (linear 0–1). |

---

## `DeclutterStats`

Returned by **`TextLayer.getLastDeclutterStats()`** when declutter was enabled on the last rebuild.

| Field | Meaning |
|-------|---------|
| `inputCount` | Labels passed in (excluding `visible: false`). |
| `afterWorldCull` | Survived world `setCullExtent` filter. |
| `afterZoom` | Survived `minZoom` / `maxZoom` (if `setMapZoom` set). |
| `afterProject` | Got a valid screen projection and on-screen AABB overlap. |
| `acceptedCount` | Final non-colliding labels. |
| `rejectedOffscreen` | Dropped: invalid projection or AABB fully outside viewport. |
| `rejectedZoom` | Dropped by zoom range. |
| `rejectedCollision` | Dropped: overlapped a higher-priority (or same-priority lower-id) accepted box. |

---

## `DeclutterDebugRects` & `ScreenRect`

When **`TextLayer.setDeclutterDebug(true)`**, the last declutter pass may fill:

```ts
interface DeclutterDebugRects {
  readonly accepted: readonly ScreenRect[];
  readonly rejected: readonly ScreenRect[];
}

interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

Coordinates are **canvas pixels**, origin **top-left**. Use for DOM/SVG debug overlays only; not required for production.

---

## `IGlyphAtlas`

Atlas contract implemented by **`GlyphAtlas`** and **`MsdfGlyphAtlas`**. See [GlyphAtlas.md](./GlyphAtlas.md) and [MsdfGlyphAtlas.md](./MsdfGlyphAtlas.md).

---

## Constants

| Name | Value | Meaning |
|------|-------|---------|
| `TEXT_INSTANCE_FLOAT_STRIDE` | `20` | Floats per glyph instance (= 80 bytes). |
| `TEXT_FRAME_UNIFORM_BYTE_LENGTH` | `96` | Bytes of the text pass uniform block. |

Custom **`layoutTextLabels`** callers must emit **`TEXT_INSTANCE_FLOAT_STRIDE`** floats per glyph.
