# WebGPU Layer — Execution Phases

---

## Phase 0 — Foundation

Define architecture, interfaces, and folder structure.

---

## Phase 1 — FeatureStore

Implement O(1) feature lookup, indexing, and update system.

---

## Phase 2 — Worker + GeoJSON

Build worker-based parsing and TypedArray generation with chunking.

---

## Phase 3 — WebGPU Renderer (Points)

Render points with simple styling and projection support.

---

## Phase 4 — Zero-Copy Pipeline

Integrate worker → main thread → GPU with Transferable buffers.

---

## Phase 5 — Hit Detection + Queries

Implement GPU picking and query API (getFeatureAtPixel).

---

## Phase 6 — WKB + FlatGeobuf

Add binary parsing and streaming with bbox-based loading.

---

## Phase 7 — GeoArrow Support

Add high-performance columnar ingestion via adapter.

---

## Phase 8 — Optimization + Scaling

Improve memory usage, batching, updates, and large dataset handling.

---

## ⚠️ Rules

* Do not skip phases
* Do not optimize before measuring
* Do not mix responsibilities across layers
