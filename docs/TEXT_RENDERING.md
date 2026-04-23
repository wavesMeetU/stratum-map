# Text rendering (bitmap vs MSDF)

This library draws map labels as instanced quads in the same WebGPU render pass as points. The CPU lays out glyphs; the GPU samples an atlas. The host swaps atlases without changing `TextRenderer` / `TextLayer` wiring.

## Bitmap atlas (default)

`GlyphAtlas` rasterizes ASCII (code points 32–126) into a small grid texture at **device pixel ratio**. Glyphs are nearest-sampled; edges get softer when zoomed because coverage is baked at one resolution.

- **Pros:** zero offline assets, trivial setup, predictable memory.
- **Cons:** blur / stair-steps when labels are magnified; DPR changes require `TextLayer.resize()` to rebuild the atlas.

## SDF and MSDF

**Signed distance fields (SDF)** store a distance-to-edge signal in a texture. The fragment shader reconstructs crisp edges by thresholding that signal with antialiasing derived from screen-space derivatives (or a fixed pixel range).

**Multi-channel SDF (MSDF)** encodes sharp corners better than monochrome SDF by storing independent distance channels (R, G, B) and decoding with a **median-of-three** operation. This is the common choice for real-time UI/map labels at varied scales.

We ship **`MsdfGlyphAtlas`**: linear-sampled RGB atlas + JSON metrics, implementing the same `IGlyphAtlas` interface as the bitmap path. `TextRenderer` sets `atlas_mode` in the frame uniform; `shaders/text.wgsl` branches between bitmap coverage (alpha) and MSDF median decoding + halo/outline.

## Why MSDF here

- **Scale quality:** labels stay sharp under zoom; antialiasing uses `screen_px_range` (from atlas `distanceRange` / `sdfPixelRange`, overridable via `TextLayer.setMsdfPixelRange`).
- **Architecture:** one batch, one pipeline, same instance layout — only the atlas texture and uniform mode change.
- **Operational path:** prefer **prebuilt PNG + JSON** checked in or produced by CI (`npm run gen:demo-msdf`). A **wasm msdfgen** hook is stubbed (`msdf-wasm-stub.ts`) for a future optional in-browser generator.

## Halo and outline

Per-label: `TextLabel.haloColor`, `haloWidthPx`. Defaults for missing fields: `TextLayer.setDefaultHalo(...)`.

Global (uniform): `TextLayer.setGlobalOutline({ widthPx, color })` — drawn behind glyphs on the MSDF path (also combines with per-instance halo width).

## API stability

- `TextLayer.setLabels`, `render`, `resize`, `replaceAtlas` behave as before.
- Bitmap `resize()` rebuilds the atlas on DPR changes. MSDF assets set `scalesWithDpr: false` on the atlas so `resize()` skips GPU rebuild (fixed-resolution atlas).

## Upgrade path to Unicode

Today layout sanitizes to ASCII (32–126) for predictable atlas size. Unicode support is mostly **data + metrics**:

1. Extend atlas JSON / generator to emit additional code points (or multiple atlases / pages).
2. Teach `layoutTextLabels` to map code points → atlas cells (UTF-16 / grapheme awareness as needed).
3. Optionally add dynamic atlas packing or HarfBuzz-shaped advances for complex scripts.

The `IGlyphAtlas` abstraction already isolates metric lookup; swapping in a multi-page or vector atlas is contained to atlas + layout.

## Demo and tests

- **Demo:** `examples/demo` — toggle **Bitmap** vs **MSDF** (loads `public/msdf/atlas.json` + `atlas.png`; falls back to bitmap if fetch/parse fails).
- **Tests:** `npm run test:msdf-text` (JSON parse, wasm stub, WGSL markers). `npm run test:text-layout` covers instance packing.

## Regenerating the demo MSDF atlas

```bash
npm run gen:demo-msdf
```

Writes `examples/demo/public/msdf/atlas.png` and `atlas.json` (Node `canvas`-based synthetic distance field for ASCII — suitable for the demo, not a typography benchmark).
