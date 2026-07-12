# stratum-map

[![npm version](https://img.shields.io/npm/v/stratum-map.svg)](https://www.npmjs.com/package/stratum-map)

**stratum-map** is a TypeScript library for **WebGPU** map rendering in the browser. It provides GPU-accelerated point rendering, picking, and text rendering with OpenLayers interoperability—without requiring OpenLayers at runtime.

## What it does

- **Points:** Instanced triangle quads with a compact style table, chunked geometry, and optional GPU buffer pooling
- **Picking:** GPU-based feature-at-pixel queries for hover/click interactions
- **Ingestion:** Worker-side GeoJSON and GeoArrow parsing into dense `TypedArray` geometry
- **Text:** Optional MSDF or bitmap glyph atlases with layout and label decluttering

## Why WebGPU

WebGPU gives explicit buffer and pipeline control, predictable bind layouts, and a path to modern browsers' primary graphics API. This project keeps **CPU work off the hot path** (workers for parsing, minimal main-thread churn) and **data in GPU-friendly layouts** (typed arrays, partial writes) so large geospatial layers remain interactive.

## Quick start

```bash
npm install stratum-map
```

**New to Stratum Map?** Start with the [**Getting Started guide**](docs/getting-started.md) for a complete walkthrough of your first render in under 15 minutes.

**Minimal example:**

```ts
import { bootstrapAuto, ViewState, MapController } from "stratum-map";

async function init() {
  const { renderer, canvas } = await bootstrapAuto();
  document.body.appendChild(canvas);

  const viewState = new ViewState({
    center: [0, 0],
    zoom: 0,
    rotation: 0,
    width: 800,
    height: 600,
  });

  const controller = new MapController(renderer, viewState);

  // Add point data and start rendering
  controller.setPoints(yourGeometryBufferView);
  controller.start();
}
```

## Examples

The `examples/` directory demonstrates progressive usage patterns:

| Example | Level | Description |
|---------|-------|-------------|
| [minimal-native](examples/minimal-native/) | Beginner | Simplest working example—3-point triangle |
| [standalone-rendering](examples/standalone-rendering/) | Intermediate | Manual setup with pan/zoom controls |
| [integration-example](examples/integration-example/) | Advanced | OpenLayers integration with mode switching |
| [global-cell-towers](examples/global-cell-towers/) | Real-World | 5.1M cell towers with picking interactions |

**Run examples locally:**

```bash
npm run demo:dev    # Dev server with all examples
```

## Features

| Area | Highlights |
|------|--------------|
| Rendering | WebGPU pipelines, premultiplied alpha canvas, column-major map→clip matrix (OpenLayers–style) |
| Data | `FeatureStore`, geometry buffers, chunked slots with LRU-style eviction |
| Workers | GeoJSON worker client, ingest worker client (`stratum-map/client`, `stratum-map/ingest-client`) |
| Text | MSDF atlas loading, `TextLayer` + `TextRenderer`, label declutter |
| Picking | GPU feature ID encoding, `PointHitTester` for hover/click interactions |

## Documentation

- **[Getting Started](docs/getting-started.md)** — First render in 15 minutes
- **[USAGE.md](docs/USAGE.md)** — Advanced usage patterns and API reference
- **[CHANGELOG.md](CHANGELOG.md)** — Version history and release notes
- **[Documentation Index](docs/DOCUMENTATION_INDEX.md)** — Complete documentation map

**Architecture:**
- **[HLD.md](docs/HLD.md)** — High-level design and architecture
- **[LLD.md](docs/LLD.md)** — Low-level implementation details

## OpenLayers integration

Stratum Map targets the same projection and frame conventions as **[OpenLayers](https://openlayers.org/)** so you can drive a WebGPU canvas from an OL `Map` without duplicating map math. The npm package does not require OpenLayers at runtime for core types and workers.

**Integration pattern:**

```text
ol/Map + ol/View
    → view.getProjection(), getCenter(), getResolution(), getRotation()
    → build 4×4 map → clip (column-major)
    → WebGpuPointsRenderer.setMapToClip / render
```

See the [integration-example](examples/integration-example/) for a complete working example.

## Browser support

**WebGPU required:**

- **Chrome/Edge 113+** — WebGPU available by default or via flag
- **Firefox Nightly** — WebGPU under active development
- **Safari Technology Preview** — WebGPU under active development

Check [caniuse.com/webgpu](https://caniuse.com/webgpu) for current status.

**Development requirements:**
- **Node.js >= 20**
- **TypeScript >= 5.7**

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)**.

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE).

Hosted demos bundle **OpenLayers** (BSD-2-Clause). Full notice: [website/docs/third-party-notices.md](website/docs/third-party-notices.md).

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
**npm:** [stratum-map](https://www.npmjs.com/package/stratum-map)
