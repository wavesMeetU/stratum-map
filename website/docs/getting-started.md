---
sidebar_position: 1
---

# Getting started

**stratum-map** is a TypeScript library for **WebGPU** point rendering, optional **GPU picking**, and optional **MSDF / bitmap text** with **label decluttering**. It is designed to consume the same **column-major map → clip** matrix and canvas sizing conventions as **OpenLayers**, so you can drive a WebGPU overlay from an `ol/Map` without duplicating projection math.

## Prerequisites

- **Node.js 20+** for development and headless tests.
- A **WebGPU-capable** browser for runtime (see [installation](./installation.md#browser-support)).

## Install

```bash
npm install stratum-map
```

## Live demo (hosted)

On the documentation site:

- **[Live demo](/demo)** — OpenLayers + WebGPU points (50k–2M), FPS, style controls (`/demos/flagship/`).
- **[GPU picking demo](/examples/picking)** — click to pick, `FeatureStore` metadata, GPU highlight (`/demos/picking/`).
- **[GPU text labels demo](/examples/text)** — `TextLayer` over points, bitmap vs MSDF, declutter (`/demos/text/`).

These load Vite bundles from `/demos/...` under the GitHub Pages base path.

## Next steps

1. [Installation](./installation.md) — package entry points and optional worker bundles.
2. [Quick start](./quick-start.md) — create a renderer and submit a frame.
3. [OpenLayers integration](./openlayers-integration.md) — overlay canvas and `FrameState` wiring.
4. [API reference](./api/points-renderer.md) — `WebGpuPointsRenderer`, `TextLayer`, `FeatureStore`, picking.
