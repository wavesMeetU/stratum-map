---
sidebar_position: 6
---

# Label decluttering

## Purpose

When many labels overlap in **screen space**, show the highest-priority label and hide lower-priority colliders. Optional **zoom gates** (`minZoom` / `maxZoom`) drop labels before projection.

## API surface

`TextLayer` exposes:

- `setDeclutterEnabled(boolean)`
- `setDeclutterPaddingPx(number)`
- `setMapZoomForDeclutter(number | null)` — pass OpenLayers view zoom when available
- `setDeclutterDebug(boolean)` — collect debug rects (extra allocation; dev-only)

Underlying primitive: `declutterLabels()` in the main package (pure function; testable).

## Performance

Declutter runs on **CPU** over projected screen boxes — keep label counts bounded for the view (the demo caps in-view promoted labels). Use priorities so the most important labels win under contention.

## Further reading

- [Label declutter API](./api/text-layer.md#decluttering)
- Repository `docs/LABEL_DECLUTTERING.md` for deeper design notes
