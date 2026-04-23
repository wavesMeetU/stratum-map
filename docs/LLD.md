# Low-Level Design (LLD)

This document describes **modules**, **data layouts**, **GPU resources**, and **control flows** for **stratum-map**. It complements [HLD.md](./HLD.md) and the API guide [USAGE.md](./USAGE.md).

---

## 1. Source tree (implementation)

```
src/
  core/           # FeatureStore, FeatureRecord, GeometryBuffer contracts
  types/          # FeatureId, StyleId, GeometryKind
  parser/         # GeoJSON flatten/build, worker messages, ingest messages
  worker/         # geojson-worker.ts, ingest-worker.ts (entry bundles)
  client/         # Main-thread facades posting to workers
  geoarrow/       # GeoArrow → same vertex layout as GeoJSON pipeline
  gpu/            # Buffer pools, chunk slots, LRU, incremental draw, streams
  renderer/       # WebGpuPointsRenderer, WGSL points shader, PointStyle
  picking/        # Pick WGSL, id pack/unpack, PointHitTester
```

Public exports are defined in [`src/index.ts`](../src/index.ts) and `package.json` `"exports"`.

---

## 2. Core data contracts

### 2.1 `GeometryBuffer`

Defined in [`src/core/geometry-buffer.ts`](../src/core/geometry-buffer.ts).

| Field | Type | Meaning |
|-------|------|---------|
| `positions` | `Float32Array` | XY pairs in **map projection** units (caller-defined CRS). |
| `featureIds` | `Uint32Array` | Per-vertex stable id for picking / grouping. |
| `styleIds` | `Uint16Array` | Index into renderer style table (0 … `MAX_POINT_STYLES-1`). |
| `indices` | optional `Uint32Array` | Reserved for future indexed primitives; **not** used by current point renderer. |

### 2.2 `GeometryBufferView` + `TransferredGeometryChunk`

`vertexCount` (and optional `indexCount`) scopes valid prefix of arrays. `TransferredGeometryChunk` adds `FeatureRecord[]` and `transferables` for `postMessage` transfer list.

### 2.3 `FeatureRecord`

Per-feature metadata (id, geometry kind, vertex range within a chunk, properties snapshot policy as implemented). `FeatureStore` holds `StoredFeatureRecord` with optional `bbox` when ingested with positions.

### 2.4 `GeometryParser`

Interface in [`src/parser/parser.ts`](../src/parser/parser.ts): `parse(input, signal?) → ParseResult`. Implementations are expected to run in workers; the contract is format-agnostic.

---

## 3. WebGPU renderer (`WebGpuPointsRenderer`)

**File:** [`src/renderer/webgpu-points-renderer.ts`](../src/renderer/webgpu-points-renderer.ts)

### 3.1 Pipelines and bind groups

| Resource | Usage |
|----------|--------|
| `POINTS_WGSL` | Vertex expands unit quad per instance; fragment discards outside radius; reads `frame` uniform + `style_table` storage. |
| `frameUniformBuffer` | `mat4` view-proj, viewport px, style count meta. |
| `styleStorageBuffer` | Up to `MAX_POINT_STYLES` (256) GPU style records. |
| `quadVertexBuffer` | Six vertices (two triangles), **per-vertex** corner attribute. |
| Instance buffers | Per-instance: position (`float32x2`), `style_id` (`uint32`). |

**Vertex buffer layout (conceptual):**

- Buffer 0: quad corners, `stepMode: "vertex"`, stride 8.
- Buffer 1: instance centers, `stepMode: "instance"`, stride 8.
- Buffer 2: instance style ids, `stepMode: "instance"`, stride 4.

Draw: `draw(6, vertexCount)` per chunk or once for single layout.

### 3.2 Geometry modes

- **`single`:** One pair of GPU buffers for all vertices (grow / replace via `setGeometry` APIs).
- **`chunks`:** `Map<chunkKey, GpuPointChunkSlot>` with stable **draw order** array; supports **LRU eviction** of whole chunks.

### 3.3 Picking

- Separate pipeline from `PICK_POINTS_WGSL` ([`src/picking/pick-points-wgsl.ts`](../src/picking/pick-points-wgsl.ts)).
- Renders feature ids into offscreen texture; copies single texel to readback buffer; async map; decode via [`id-pack.ts`](../src/picking/id-pack.ts).

`setPickPointDiameterPx` aligns pick disk with visible splat size.

### 3.4 Key public methods (non-exhaustive)

- `create` / factory: async device + pipeline setup.
- `setMapToClipMatrix`, `setStyleTable`, `setPickPointDiameterPx`.
- `setGeometry` / views for non-transferred paths.
- `ingestTransferredWorkerChunk` — zero-copy path from worker messages.
- `render`, `resizeToDisplaySize`, `pickFeatureIdAtCanvasPixel`, `release`.

---

## 4. Workers

### 4.1 GeoJSON worker

**Files:** [`src/worker/geojson-worker.ts`](../src/worker/geojson-worker.ts), client [`src/client/geojson-worker-client.ts`](../src/client/geojson-worker-client.ts).

- Parses GeoJSON text / features into chunked messages: geometry buffers + `FeatureRecord[]`.
- Messages typed in [`geojson-worker-messages.ts`](../src/parser/geojson-worker-messages.ts).

### 4.2 Ingest worker

**File:** [`src/worker/ingest-worker.ts`](../src/worker/ingest-worker.ts).

- **FlatGeobuf:** HTTP fetch with abort; bbox filter; batches features into chunks via shared `buildGeoJsonFeatureChunk`.
- **WKB:** Uses `wkx` for binary geometry.
- Uses `buffer` npm polyfill in worker global for FGB path.

**Client:** [`src/client/ingest-worker-client.ts`](../src/client/ingest-worker-client.ts).

---

## 5. GPU orchestration helpers

| Module | Role |
|--------|------|
| [`GpuBufferPool`](../src/gpu/gpu-buffer-pool.ts) | Reuse / bucket GPU buffer bytes. |
| [`GpuPointChunkSlot`](../src/gpu/gpu-point-chunk-slot.ts) | One chunk’s GPU vertex buffers + counts. |
| [`ChunkedGeometryController`](../src/gpu/chunked-geometry-controller.ts) | Parse-id filter, max chunk count + LRU eviction, optional `FeatureStore` / `GpuChunkFeatureIndex` sync, incremental draw scheduling. |
| [`GpuChunkFeatureIndex`](../src/gpu/gpu-chunk-feature-index.ts) | Union of feature ids per chunk for `retainIds` after eviction. |
| [`IncrementalDrawScheduler`](../src/gpu/incremental-draw-scheduler.ts) | Coalesce `render` calls after ingest bursts. |
| [`PointGeometryStreamBridge`](../src/gpu/point-geometry-stream.ts) | Stream-style glue between messages and renderer/store. |

---

## 6. GeoArrow

[`src/geoarrow/geoarrow-adapter.ts`](../src/geoarrow/geoarrow-adapter.ts) and related files flatten GeoArrow geometry columns into the same **positions / featureIds / styleIds** layout. Used when hosts already have Arrow tables.

---

## 7. Picking stack

```
Canvas pixel (x,y)
    → WebGpuPointsRenderer.pickFeatureIdAtCanvasPixel
        → pick render pass → copyTextureToBuffer → mapAsync
    → decodeFeatureIdFromRgba8Bytes
    → FeatureStore.getById  (via PointHitTester.getFeatureAtPixel)
```

Extent queries are **CPU** only: `FeatureStore.getRecordsInExtent` using stored bboxes from `ingestRecordsWithPositions`.

---

## 8. Examples and tests (behavioral contracts)

| Artifact | Validates |
|----------|-----------|
| `examples/demo/main.ts` | OL + WebGPU canvas overlay, GPU pick, optional Canvas2D labels, chunked ingest patterns. |
| `examples/pan-zoom-bench/` | Pan/zoom stress with worker pipeline. |
| `tests/geojson-worker.spec.ts` | Worker + Playwright. |
| `tests/pan-zoom-bench.spec.ts` | Bench scenario. |
| `npm run test:feature-store` / `test:geojson-pipeline` | Node tests on built `dist` (see `package.json` scripts). |

---

## 9. Build and distribution

- `tsc` emits `dist/`; `"files": ["dist"]` for publish.
- Subpath exports: main entry, `./client`, `./ingest-client` (see [USAGE.md](./USAGE.md)).

---

## 10. Extension points (for implementers)

1. **New formats:** Implement worker-side flatten producing `GeometryBufferView` + `FeatureRecord[]`; reuse `ingestTransferredWorkerChunk`.
2. **New draw modes:** New WGSL + vertex layout; keep `GeometryBuffer.indices` contract in mind for lines/fills.
3. **Styling:** Extend `PointStyle` and style struct in WGSL (alignment: 16-byte GPU struct rules).

Do not break the **renderer unaware of parser format** rule ([EXECUTION_GUIDELINES.md](../EXECUTION_GUIDELINES.md)).
