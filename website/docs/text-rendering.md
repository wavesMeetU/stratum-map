---
sidebar_position: 5
---

# Text rendering

## Overview

The text stack is **optional** and sits beside the point renderer:

1. **`GlyphAtlas`** — CPU-rasterized bitmap atlas; simple to reason about; rebuilds on DPR changes.
2. **`MsdfGlyphAtlas`** — precomputed MSDF atlas + JSON metrics; better minification; fixed atlas cost.
3. **`TextLayer`** — owns labels, map matrix, cull rect, declutter options; feeds `TextRenderer`.
4. **`TextRenderer`** — GPU pipeline for glyph instances and frame uniforms.

## Import paths

```ts
import {
  TextLayer,
  createTextLayerForPointsRenderer,
  GlyphAtlas,
  tryLoadMsdfAtlasFromUrls,
} from "stratum-map";
```

## Workflow

1. Build `TextLabel[]` (anchor in map CRS, strings, priorities, optional halos).
2. `textLayer.setLabels(labels)` and update `setMapToClipMatrix` each frame.
3. `textLayer.rebuildInstancesIfDirty(viewState)` then encode the text pass after points (or interleaved per your compositing rules).

See [Text layer API](./api/text-layer.md) and [Text renderer API](./api/text-renderer.md).

## MSDF assets

Ship `atlas.png` + `atlas.json` (versioned schema). Use `tryLoadMsdfAtlasFromUrls` or construct `MsdfGlyphAtlas` from existing GPU textures in advanced integrations.
