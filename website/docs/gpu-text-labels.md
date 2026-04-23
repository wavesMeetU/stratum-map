---
sidebar_position: 8
---

# GPU text labels

## Model

`TextLayer` expands each [`TextLabel`](./api/text-layer.md) into **glyph instances** (CPU layout), uploads a vertex buffer, and records a **WebGPU** draw into the same color target as your points pass. Atlas backends are either a **CPU-rasterized bitmap** (`GlyphAtlas`) or a prebuilt **MSDF** texture (`MsdfGlyphAtlas`).

## OpenLayers wiring

Use the same **column-major map → clip** matrix and **backing-store** viewport size as the points renderer (`FrameState` from `postrender`). Call `textLayer.render(pass)` after points so labels draw on top.

## Declutter

Optional **screen-space collision** runs before layout when enabled; see [Label decluttering](./label-decluttering.md) for priorities and anchors.

## Live demo

**[GPU text labels demo](/examples/text)** — hosted bundle: in-view synthetic points get coordinate strings; toggle bitmap vs MSDF, declutter, and debug collision boxes.

## API

- [`TextLayer`](./api/text-layer.md), [`GlyphAtlas`](./api/glyph-atlas.md), [`MsdfGlyphAtlas`](./api/msdf-glyph-atlas.md)
