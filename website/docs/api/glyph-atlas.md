---
sidebar_position: 4
---

# GlyphAtlas

**CPU-rasterized** ASCII atlas backed by a `GPUTexture`. Good for prototyping and deterministic tests; rebuilds when **DPR** changes.

## Import

```ts
import { GlyphAtlas } from "stratum-map";
```

## Construction

### `GlyphAtlas.create(device, dpr?)`

Allocates atlas texture and sampler; rasterizes a fixed ASCII grid on CPU.

## Interface

Implements `IGlyphAtlas` used by `TextRenderer`:

- UV rectangles per glyph cell
- Metrics for layout (`GlyphMetrics`)
- `destroy()` to free GPU texture

## Performance notes

- **CPU cost** on atlas rebuild — avoid toggling DPR-dependent paths in hot loops.
- Texture size grows with cell count × resolution — keep atlas modest for mobile GPUs.

## See also

- [MSDF glyph atlas](./msdf-glyph-atlas.md) for production-quality scaling
