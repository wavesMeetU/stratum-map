---
sidebar_position: 2
---

# Installation

## npm package

```bash
npm install stratum-map
```

## Entry points

| Import path | Purpose |
|-------------|---------|
| `stratum-map` | Core types, `WebGpuPointsRenderer`, GPU helpers, text stack, `FeatureStore`, parsers |
| `stratum-map/client` | `GeoJsonWorkerClient` — worker-backed GeoJSON parsing |
| `stratum-map/ingest-client` | `IngestWorkerClient` — bbox / streaming ingest worker |

Type declarations ship with the package (`dist/**/*.d.ts`).

## Browser support

WebGPU availability depends on the browser channel. Treat WebGPU as a **hard requirement** for the renderer; feature-detect `navigator.gpu` and `HTMLCanvasElement.prototype.getContext("webgpu")` before calling `createWebGpuPointsRenderer`.

## OpenLayers

OpenLayers is **not** a runtime dependency of the core library. It appears in this repository as a **devDependency** for the official demo (`examples/demo`). Your application may use any map stack as long as you supply the correct matrix and canvas pixel dimensions.

## Source install (contributors)

```bash
git clone https://github.com/wavesMeetU/stratum-map.git
cd stratum-map
npm install
npm run build
npm test
```
