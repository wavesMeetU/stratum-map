# stratum-map — historical execution phases

Ordered delivery phases used during early development. New work does not need to follow this sequence literally, but the layering (store → worker → GPU → interaction) remains the guiding structure.

## Phase 0 — foundation

Architecture, interfaces, and repository layout.

## Phase 1 — FeatureStore

O(1) feature lookup, indexing, and update paths.

## Phase 2 — workers and GeoJSON

Worker-based parsing and TypedArray chunk generation.

## Phase 3 — WebGPU point renderer

Instanced points, projection matrix contract, style table.

## Phase 4 — zero-copy pipeline

Transferable buffers from worker to main thread to GPU with minimal staging.

## Phase 5 — hit detection and queries

GPU picking and feature-at-pixel style APIs.

## Phase 6 — WKB and FlatGeobuf

Binary formats and bbox-aware loading where applicable.

## Phase 7 — GeoArrow

Columnar ingestion via adapters.

## Phase 8 — optimization and scale

Memory, batching, eviction, and large-dataset behavior.

## Discipline

- Prefer measuring before micro-optimizing.
- Keep responsibilities in the layer where the type system and docs can enforce them.
- Avoid cross-layer shortcuts that hide data ownership.
