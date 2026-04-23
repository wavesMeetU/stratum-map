# stratum-map — system overview

High-level picture of the GPU-first geospatial rendering stack. The library is designed to align with **OpenLayers** map state and canvas conventions while keeping a **soft** dependency on OpenLayers at the package boundary (see published exports and examples).

## Core idea

A **GPU-first** pipeline: user data becomes dense GPU-friendly buffers; shading and picking run on **WebGPU**.

Separation of concerns:

- User / map interaction and orchestration (often OpenLayers in apps).
- Feature metadata and CPU-side indexing (`FeatureStore`).
- Parsing and normalization (workers).
- TypedArray geometry buffers.
- WebGPU draw and pick passes.

## Architecture

```text
User API (features, queries)
        ↓
Feature store (metadata + indexing)
        ↓
Parser layer (workers)
        ↓
Geometry buffers (TypedArrays)
        ↓
WebGPU renderer (points, text, picking)
```

## Responsibilities

### User-facing API

- Add, remove, and update features.
- Query features (for example hit testing at a pixel).
- Apply a compact style table for points.

### Feature store

- Maps `featureId` ↔ buffer indices and properties.
- O(1) style lookups where the design allows.
- Mediates between logical features and GPU-bound geometry.

### Parser layer (workers)

- Accepts GeoJSON and other supported inputs (see parser modules).
- Emits GPU-oriented TypedArrays and chunk messages.
- Runs off the main thread.

### Geometry buffers

- Positions (`Float32Array`), feature ids (`Uint32Array`), style ids (`Uint16Array`), and related views.
- Sized for upload with minimal copying.

### WebGPU renderer

- Manages pipelines, uniforms, buffer uploads, and optional picking textures.
- Does not embed knowledge of specific file formats.

### Text (optional path)

- MSDF or bitmap atlases, layout, optional declutter, and a dedicated text render pass wired alongside points where the app enables it.

## Styling model

- Small OpenLayers-like circle parameters mapped to an internal style buffer via `styleId`.

## Data flow sketches

### Loading

```text
Map view / data change
   ↓
Worker parses input
   ↓
TypedArrays (possibly chunked)
   ↓
Feature store updates
   ↓
GPU buffer updates
   ↓
Draw
```

### Query (picking)

```text
Pointer event
   ↓
GPU pick pass (when enabled)
   ↓
featureId
   ↓
Feature store lookup
   ↓
Return feature to host
```

### Update

```text
User update
   ↓
Feature store resolves indices
   ↓
TypedArray mutation
   ↓
Targeted GPU write
```

## Constraints and assumptions

- Avoid carrying full OpenLayers `Feature` instances inside the core pipeline; exchange plain records and buffers.
- Optional **WASM** may appear for specific accelerations (for example MSDF tooling); it is not required for the default point path.
- Prefer TypedArray-centric updates over per-frame object churn.

## Design principles

- Data-oriented layouts for throughput.
- Minimize copies between worker, main thread, and GPU.
- Worker-first ingestion; GPU-first drawing.
- Clear module boundaries to keep the codebase maintainable as features grow.
