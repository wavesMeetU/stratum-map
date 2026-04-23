---
sidebar_position: 8
---

# Architecture

## Data path

```mermaid
flowchart LR
  A[Source data] --> B[Workers]
  B --> C[TypedArrays]
  C --> D[FeatureStore]
  D --> E[GPU buffers]
  E --> F[Render pass]
  F --> G[Picking / Text]
```

## Layers

| Layer | Responsibility |
|-------|------------------|
| **Workers** | Parse GeoJSON / ingest payloads; emit chunked `ArrayBuffer` views |
| **FeatureStore** | Feature id ↔ metadata, bbox queries, upsert/remove |
| **GpuPointChunkSlot** | Per-chunk vertex buffers + LRU participation |
| **WebGpuPointsRenderer** | Pipelines, uniforms, draw encoding, optional pick target |
| **TextLayer / TextRenderer** | CPU layout + MSDF/bitmap atlas + text draw pass |

## Chunked geometry

```mermaid
flowchart TB
  subgraph worker[Worker thread]
    W1[Parse chunk]
    W2[Emit positions / ids / styles]
  end
  subgraph main[Main thread]
    M1[Ingest transferable buffers]
    M2[FeatureStore update]
    M3[Partial GPU writeBuffer]
  end
  subgraph gpu[GPU]
    G1[Per-chunk vertex buffers]
    G2[Instanced draw calls]
  end
  worker --> main
  main --> gpu
```

## Design rules

- The **renderer does not parse file formats** — only dense buffers and uniforms.
- **TypedArrays** are the contract across thread boundaries; prefer `Transferable` ownership moves.
- **Picking** and **text** are optional subsystems with their own resources but share the same canvas pixel space.
