# stratum-map

**stratum-map** is a TypeScript library for **WebGPU** map rendering in the browser. It targets the same projection and frame conventions as **[OpenLayers](https://openlayers.org/)** so you can drive a WebGPU canvas from an OL `Map` without duplicating map math. The npm package does not require OpenLayers at runtime for core types and workers; OpenLayers appears as a **devDependency** for the official demo.

## What it does

- **Points:** instanced triangle quads with a compact style table, chunked geometry, and optional GPU buffer pooling.
- **Picking:** optional GPU id render pass and decode helpers for feature-at-pixel queries.
- **Ingestion:** worker-side GeoJSON (and related paths) into dense `TypedArray` geometry for upload.
- **Text (optional):** MSDF or bitmap glyph atlases, layout, optional declutter, and a dedicated text pass documented under `docs/api/`.

## Why WebGPU

WebGPU gives explicit buffer and pipeline control, predictable bind layouts, and a path to modern browsers’ primary graphics API. This project keeps **CPU work off the hot path** (workers for parse, minimal main-thread churn) and **data in GPU-friendly layouts** (typed arrays, partial writes) so large geospatial layers remain interactive.

## Features

| Area | Highlights |
|------|--------------|
| Rendering | WebGPU pipelines, premultiplied alpha canvas, column-major map→clip matrix (OpenLayers–style) |
| Data | `FeatureStore`, geometry buffers, chunked slots with LRU-style eviction |
| Workers | GeoJSON worker client, ingest worker client (`stratum-map/client`, `stratum-map/ingest-client`) |
| Text | MSDF atlas loading, `TextLayer` + `TextRenderer`, label declutter |
| Quality | Node test suites for core layout paths; Playwright benches for pan/zoom and worker demos |

## Screenshots

> Placeholder: add `docs/images/demo-points.png` and `docs/images/demo-labels.png` after capturing the official demo.

```text
docs/images/demo-points.png   — points + pan/zoom
docs/images/demo-labels.png   — MSDF labels + declutter
```

## Quick start

```bash
npm install stratum-map
```

```ts
import { createWebGpuPointsRenderer } from "stratum-map";

const renderer = await createWebGpuPointsRenderer({ canvas: document.querySelector("canvas")! });
// Each frame: set mapToClip from your map, setVertexBuffers..., then render.
```

Full export map and coordinate notes: **[docs/USAGE.md](docs/USAGE.md)** and **[docs/api/QuickStart.md](docs/api/QuickStart.md)**.

## OpenLayers integration

The demo (`npm run demo:dev`) composes an OL `Map` with a WebGPU overlay canvas: same size, device pixel ratio, and a `postrender` handler that copies the view’s **column-major** map-to-WebGL matrix into the renderer. See **`examples/demo/main.ts`** for the wiring pattern (view state → frame uniforms → draw).

Conceptually:

```text
ol/Map + ol/View
    → view.getProjection(), getCenter(), getResolution(), getRotation()
    → build 4×4 map → clip (column-major)
    → WebGpuPointsRenderer.setMapToClip / render
```

## Text rendering

Use **`TextLayer`** with **`MsdfGlyphAtlas`** or **`GlyphAtlas`**, feed **`TextLabel`** instances, and call rebuild when the view or labels change. API surface is documented in Markdown under **`docs/api/`** (`TextLayer.md`, `TextRenderer.md`, `MsdfGlyphAtlas.md`, `LabelDeclutter.md`).

## Benchmarks

Playwright-driven scenarios live under **`tests/`** and **`examples/pan-zoom-bench/`**.

```bash
npm run verify:pan-zoom    # build bench app + Playwright pan/zoom
npm run bench:pan-zoom     # preview bench build locally
```

Numbers are machine-dependent; run on your target hardware before drawing conclusions.

## Roadmap

Non-exhaustive direction (see also **`docs/internal/execution-phases.md`**):

- Broader format coverage and streaming ergonomics.
- More examples and hosted API docs.
- Performance guides per browser and GPU tier.

Issues and discussion: **[GitHub Issues](https://github.com/wavesMeetU/stratum-map/issues)**.

## Browser support

Requires **WebGPU** (Chrome/Edge stable channels with flag or default per vendor policy, Safari Technology Preview where available). Check [https://caniuse.com/webgpu](https://caniuse.com/webgpu) for current status. **Node ≥ 20** for development and headless tests.

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)**.

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE).

## Development

```bash
git clone https://github.com/wavesMeetU/stratum-map.git
cd stratum-map
npm install
npm run build
npm test
npm run demo:dev    # OpenLayers + WebGPU demo (dev server)
```

---

**Repository:** [github.com/wavesMeetU/stratum-map](https://github.com/wavesMeetU/stratum-map)  
**Documentation index:** [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md)
