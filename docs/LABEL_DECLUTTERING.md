# Label decluttering

Map labels that share the same screen often become unreadable. **Decluttering** picks a non-overlapping subset so higher-priority labels remain visible while lower-priority labels are dropped for that frame.

## Pipeline

Each `TextLayer` rebuild (when labels or view inputs are dirty):

1. **World cull** (optional): drop anchors outside `setCullExtent` (same as glyph layout).
2. **Zoom filter**: if `setMapZoom(z)` is set, drop labels outside optional `minZoom` / `maxZoom`.
3. **Projection**: map anchor → canvas pixels using the same column-major `view_proj` as `text.wgsl`.
4. **Screen bounds**: estimate label width/height in CSS pixels from atlas metrics (matches `text-layout` scaling) and shift by `anchor` + padding.
5. **Offscreen reject**: drop boxes fully outside the viewport (after padding).
6. **Sort**: descending `priority`, then ascending `id` (stable tie-break).
7. **Collision placement**: walk sorted candidates; accept if the padded screen AABB does not intersect any previously accepted box.

Accepted labels are passed to `layoutTextLabels` → `TextRenderer` unchanged.

## API (`TextLayer`)

| Method | Role |
|--------|------|
| `setDeclutterEnabled(on)` | Turn declutter on/off (default off). |
| `setDeclutterPadding(px)` | Global extra collision padding (adds to each label’s `paddingPx`). |
| `setViewport(w, h)` | Optional backing-store override; `null` uses `canvas.width/height`. |
| `setMapZoom(z)` | Enables `minZoom` / `maxZoom` on `TextLabel`; `null` disables zoom gating. |
| `setDeclutterDebug(on)` | When enabled, `getDeclutterDebugRects()` returns last pass green/red boxes. |
| `getLastDeclutterStats()` | Counts from the last rebuild when declutter is enabled. |

`updateMapMatrix` marks layout dirty while declutter is enabled so pan/zoom recomputes collisions.

## Collision engine

Implementation: **uniform grid** buckets (~96 px cells). Each accepted rectangle registers into all overlapped cells; candidates only test overlaps against labels indexed in those cells.

- **Average case:** roughly \(O(n \log n + n \cdot k)\) with \(k\) the average occupancy per touched cell (small when labels spread out).
- **Worst case:** clustered labels can increase \(k\); increase cell size or cap input count if needed.

Alternatives not shipped: sweep-and-prune on sorted intervals, R-tree, or GPU occlusion — the grid keeps CPU code simple and predictable for thousands of labels per frame.

## Label fields

Optional on `TextLabel`:

- `minZoom` / `maxZoom` — require `setMapZoom`.
- `anchor` — `"center"` \| `"top"` \| `"bottom"` \| `"left"` \| `"right"` for collision box placement vs the projected anchor.
- `paddingPx` — per-label collision expansion.

## Debug overlay (demo)

The demo can draw **DOM** outlines (no Canvas2D in the library): accepted boxes in green, rejected in red, driven by `getDeclutterDebugRects()`.

## Future: GPU placement

Possible directions:

- **Compute shader binning** for massive label sets (tile-based counts + compact accepted list).
- **MSAA / stencil** tricks are usually a poor fit for vector text; CPU or compute placement remains common in map engines.
- **Temporal coherence**: cache per-tile winners across frames to reduce flicker (not implemented here).

## Tests

```bash
npm run test:label-declutter
```
