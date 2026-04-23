# stratum-map — execution guidelines

Maintainer-facing notes on how the codebase is intended to evolve.

## Development rules

### 1. Separation of concerns

- FeatureStore, parser, and renderer stay distinct; do not merge responsibilities across layers.

### 2. TypedArrays as the render path

- Geometry and IDs for the GPU path live in TypedArrays, not ad hoc object graphs per frame.

### 3. Worker-first parsing

- Heavy parsing runs in workers; keep the main thread thin for interaction and GPU scheduling.

### 4. GPU-oriented updates

- Prefer batched uploads, buffer reuse, and partial updates over per-frame allocations.

## Performance

### Prefer

- Transferable `ArrayBuffer` where ownership can move across threads.
- Chunked processing for large inputs.
- Partial GPU buffer writes when only a subset of vertices changed.

### Avoid

- Recreating large GPU buffers every frame without need.
- Shipping large JSON blobs between threads when binary layouts suffice.
- Doing format parsing on the main thread during pan/zoom.

## Styling

- Point styling stays intentionally small (color, size, style table indices); keep mapping through `styleId`.

## Data flow

- Normalize external formats before they reach the renderer; the renderer should not depend on GeoJSON vs FlatGeobuf vs GeoArrow specifics.
- `FeatureStore` remains the bridge between logical features and GPU-backed geometry.

## Debugging order

1. Feature id ↔ index mappings in `FeatureStore`.
2. Layout of worker-produced TypedArrays (stride, counts).
3. Worker messages and chunk boundaries.
4. GPU uploads (sizes, offsets, `writeBuffer` timing).
5. Shader uniforms and instance counts.

## Common pitfalls

- Parsing and rendering in the same module.
- Optimizing before measuring (profile large datasets first).
- Ignoring chunking and eviction when tile or batch keys grow without bound.
- Leaking GPU buffers or not returning pooled buffers on teardown.

## Delivery order (high level)

1. Feature store and indexing.
2. Worker parsing and chunk messages.
3. Renderer integration.
4. Map / host integration.
5. Interaction (picking, hit testing).
6. Additional formats and optimizations.

## Principle

Keep the pipeline predictable and data-driven. Added complexity should be justified by measured wins on realistic workloads.
