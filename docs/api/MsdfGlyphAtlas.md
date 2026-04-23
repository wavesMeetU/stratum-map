# `MsdfGlyphAtlas`

**MSDF** (multi-channel signed distance field) atlas: loads a prebuilt **RGBA8** PNG and **JSON** metrics, uploads with **`copyExternalImageToTexture`**, implements **`IGlyphAtlas`**. Swap into **`TextLayer.replaceAtlas`** without changing **`TextRenderer`**.

---

## Module

```js
import {
  MsdfGlyphAtlas,
  tryLoadMsdfAtlasFromUrls,
  parseMsdfAtlasJson,
  type MsdfAtlasJsonV1,
} from "stratum-map";
```

---

## Constructor

### `MsdfGlyphAtlas.fromJsonAndImageSource(device, json, imageSource)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `device` | `GPUDevice` | |
| `json` | `MsdfAtlasJsonV1` | Parsed layout (see **`parseMsdfAtlasJson`**). |
| `imageSource` | `TexImageSource` | `ImageBitmap`, `HTMLImageElement`, etc. |

**Returns** `MsdfGlyphAtlas`.

**Metrics:** Glyph slots **0–127** are filled from JSON; layout still sanitizes to ASCII for string display.

---

## Properties (read-only)

| Property | Type | Description |
|----------|------|-------------|
| `family` | `"msdf"` | Selects MSDF branch in fragment shader. |
| `scalesWithDpr` | `false` | **`TextLayer.resize()`** does **not** rebuild this atlas (fixed asset). |
| `cellEmPx` | `number` | From `json.metrics.emSize`. |
| `sdfPixelRange` | `number` | From `json.atlas.distanceRange` (default **4** if omitted). |

---

## `tryLoadMsdfAtlasFromUrls(device, jsonUrl, imageUrl)`

- **Returns:** `Promise<MsdfGlyphAtlas | null>`
- **Description:** `fetch` JSON + image, **`parseMsdfAtlasJson`**, **`createImageBitmap`**, **`fromJsonAndImageSource`**. Any failure → **`null`** (useful for demo fallback to bitmap).

---

## `parseMsdfAtlasJson(text)`

- **Parameters:** `text: string` — UTF-8 JSON body.
- **Returns:** `MsdfAtlasJsonV1`
- **Throws** if `version !== 1` or required fields missing.

---

## Loading examples

### A. Fetch + `ImageBitmap` (same origin)

```js
const jsonText = await (await fetch("/assets/text/atlas.json")).text();
const json = parseMsdfAtlasJson(jsonText);
const blob = await (await fetch("/assets/text/atlas.png")).blob();
const bmp = await createImageBitmap(blob);
const atlas = MsdfGlyphAtlas.fromJsonAndImageSource(device, json, bmp);
bmp.close?.();
```

### B. One helper call

```js
const atlas = await tryLoadMsdfAtlasFromUrls(
  device,
  "/assets/text/atlas.json",
  "/assets/text/atlas.png",
);
if (atlas) {
  const prev = textLayer.getAtlas();
  textLayer.replaceAtlas(atlas);
  prev.destroy();
}
```

---

## `TextLayer` integration

```js
textLayer.replaceAtlas(msdfAtlas);
textLayer.setDefaultHalo({ widthPx: 2, color: [0.02, 0.04, 0.08, 0.92] });
textLayer.setGlobalOutline({ widthPx: 1, color: [0, 0, 0, 0.85] });
textLayer.setMsdfPixelRange(null); // use atlas sdfPixelRange
```

---

## Performance

- **No per-frame rasterize** — only instance upload + draw.
- **Linear filter** — stable under zoom; cost is same as bitmap draw path.
- **VRAM:** One atlas texture until **`destroy()`**.

---

## Notes

- **Unicode:** Current metrics table is **128 entries**; extending to full Unicode is a data + layout change ([QuickStart.md](./QuickStart.md)).
- **WASM generation:** In-repo stub may throw; prefer offline **`msdf-atlas-gen`** or similar, then ship JSON+PNG.
