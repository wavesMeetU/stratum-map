---
sidebar_position: 1
---

# WebGpuPointsRenderer

GPU instanced **point sprites** (triangle-list quad per instance) with a small **style storage buffer** and a **frame uniform** block for map transform and viewport size.

## Import

```ts
import {
  WebGpuPointsRenderer,
  createWebGpuPointsRenderer,
  type WebGpuPointsRendererOptions,
} from "stratum-map";
```

## Construction

### `createWebGpuPointsRenderer(options)`

Async factory. Requests adapter/device (unless `options.device` provided), builds pipeline, allocates quad + uniform + style buffers, configures canvas context.

**Options (`WebGpuPointsRendererOptions`)**

| Field | Type | Description |
|-------|------|-------------|
| `canvas` | `HTMLCanvasElement` | Target WebGPU canvas |
| `alphaMode` | `GPUCanvasAlphaMode?` | Default `premultiplied` |
| `device` | `GPUDevice?` | Share device across layers |
| `styles` | `readonly PointStyle[]?` | Initial style table |
| `gpuBufferPool` | `GpuBufferPool?` | Optional pooled vertex buffers |

## Key methods

| Method | Summary |
|--------|---------|
| `setMapToClipMatrix(m: Float32Array)` | Column-major 4×4 map → clip |
| `resize()` | Sync canvas context after DPR/size changes |
| `setStyleTable(styles)` | Upload style table to GPU |
| `setVertexBuffers(...)` / `setGeometry(...)` | Single-buffer layout |
| `useChunkedGeometryLayout()` | Switch to per-chunk buffers |
| `ingestTransferredWorkerChunk(...)` | Register chunk from worker |
| `encodeRenderPass(pass, frame)` | Encode draws into caller’s pass |
| `renderToCurrentTexture(frame)` | Convenience full-frame render |
| `pickFeatureIdAtCanvasPixel(x, y)` | Async GPU pick (backing-store px) |
| `destroy()` | Release GPU resources |

## Picking

Enable and size the pick target on the renderer, then call `pickFeatureIdAtCanvasPixel(x, y)` with **backing-store** pixel coordinates. See [GPU picking](../gpu-picking.md) for the full flow.

## Performance notes

- Prefer **partial `writeBuffer`** when only a subrange of vertices changes.
- In chunked mode, avoid **unbounded chunk keys** — eviction reclaims GPU memory.
- Pick target has a **size cost**; resize only when canvas changes.

## Shader exports

`POINTS_WGSL` and `FRAME_UNIFORM_BYTE_LENGTH` are exported for advanced embedding (custom pipelines).

## See also

- [GPU picking](../gpu-picking.md)
- [OpenLayers integration](../openlayers-integration.md)
