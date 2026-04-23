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

## Next steps

1. [Installation](./installation.md) — package entry points and optional worker bundles.
2. [Quick start](./quick-start.md) — create a renderer and submit a frame.
3. [OpenLayers integration](./openlayers-integration.md) — overlay canvas and `FrameState` wiring.
4. [API reference](./api/points-renderer.md) — `WebGpuPointsRenderer`, `TextLayer`, `FeatureStore`, picking.

## Repository layout

The Git repository is often checked out as **`wgpu-ol-renderer`**; the published npm name is **`stratum-map`**. This site uses the public package name throughout.
