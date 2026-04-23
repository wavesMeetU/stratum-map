---
sidebar_position: 5
---

# MsdfGlyphAtlas

**Precomputed MSDF** atlas (`atlas.png` + `atlas.json`). Scales cleanly under minification; **fixed VRAM** footprint vs dynamic bitmap rebuilds.

## Import

```ts
import { MsdfGlyphAtlas, tryLoadMsdfAtlasFromUrls } from "stratum-map";
import { parseMsdfAtlasJson, type MsdfAtlasJsonV1 } from "stratum-map";
```

## Loading

### `tryLoadMsdfAtlasFromUrls(device, imageUrl, jsonUrl)`

Fetches JSON + image, uploads texture with appropriate **usages** (sample + copy as required by the implementation), returns atlas or throws on parse/version mismatch.

## JSON schema

Use `MsdfAtlasJsonV1` / `MsdfAtlasGlyphJson` types from `parseMsdfAtlasJson` for validation.

## Performance notes

- Prefer **static CDN-hosted** assets for atlases used across sessions.
- Tune **`sdfPixelRange`** in JSON for edge softness vs crispness.

## See also

- Repository script `scripts/gen-demo-msdf-atlas.mjs` for regenerating demo assets
