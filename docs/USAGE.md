# stratum-map — usage guide

**stratum-map** is a **GPU-first geospatial rendering foundation**: it moves geometry into **TypedArrays**, uploads them to **WebGPU**, and draws **point sprites** (circular quads). It is designed to sit beside **OpenLayers** (same map projection and frame matrix conventions) but does **not** depend on OL types at runtime.

**Text & declutter (Markdown API):** see [docs/api/QuickStart.md](./api/QuickStart.md) — `TextLayer`, `TextRenderer`, atlases, and label decluttering (no JSDoc build; plain `.md` files you can host on GitHub Pages or any static host). **Credits:** [ACKNOWLEDGMENTS.md](./ACKNOWLEDGMENTS.md) (OpenLayers, WebGPU).

---

## Table of contents

1. [Install and package entry points](#1-install-and-package-entry-points)
2. [What is actually rendered today?](#2-what-is-actually-rendered-today)
3. [Geometry kinds in the data pipeline](#3-geometry-kinds-in-the-data-pipeline)
4. [Styling (`PointStyle` and `styleId`)](#4-styling-pointstyle-and-styleid)
5. [Core renderer: `WebGpuPointsRenderer`](#5-core-renderer-webgpupointsrenderer)
6. [Lines: `WebGpuLineRenderer` (experimental)](#6-lines-webgpulinerenderer-experimental)
7. [Coordinate systems and the map matrix](#7-coordinate-systems-and-the-map-matrix)
8. [Loading GeoJSON (`GeoJsonWorkerClient`)](#8-loading-geojson-geojsonworkerclient)
9. [Other ingest (`IngestWorkerClient`)](#9-other-ingest-ingestworkerclient)
10. [Metadata and picking (`FeatureStore`, `PointHitTester`)](#10-metadata-and-picking-featurestore-pointhittester)
11. [GeoArrow (optional)](#11-geoarrow-optional)
12. [Browser and performance notes](#12-browser-and-performance-notes)
13. [Examples in this repo](#13-examples-in-this-repo)
14. [Text / declutter API docs (Markdown)](#14-text--declutter-api-docs-markdown)

---

## 1. Install and package entry points

```bash
npm install stratum-map
```

Published **exports** (see `package.json`):

| Import path | Purpose |
|-------------|---------|
| `stratum-map` | Library surface: renderer, parsers (types), workers’ message types, GPU helpers, picking. |
| `stratum-map/client` | `GeoJsonWorkerClient` / `createGeoJsonWorkerClient` (bundlers must resolve the worker URL). |
| `stratum-map/ingest-client` | `IngestWorkerClient` for FlatGeobuf bbox + WKB paths. |

TypeScript types ship with the package (`dist/*.d.ts`).

**Requirements:** Node **≥ 20** (repo engines). In the browser you need **WebGPU** (typically Chromium) and a **secure context** (HTTPS or localhost) for workers and GPU.

---

## 2. What is actually rendered today?

The primary GPU pipeline is **`WebGpuPointsRenderer`**:

- Each logical **vertex** in your buffers is drawn as one **screen-space circle** (two triangles, antialiased disc in WGSL).
- There is **no** polygon triangulation, and **no** use of `GeometryBuffer.indices`, in the point renderer.

So:

- **Point / MultiPoint:** each position is one dot — matches intuition.
- **Polygon / Multi* / GeometryCollection:** parsers still **emit one vertex per coordinate** along rings, but `WebGpuPointsRenderer` draws **each of those vertices as an independent point**, not as connected strokes or fills.

A separate, **experimental** renderer, **`WebGpuLineRenderer`** (§6), now draws plain `LineString` geometry as true shader-extruded segments — solid color, constant width, no joins/dashes, no `MultiLineString`. It is independent of `WebGpuPointsRenderer` (no shared base class, no coupling) and is exported for point/line coexistence use cases; everything else (`MultiLineString`, `Polygon`, etc.) still only renders as independent points through `WebGpuPointsRenderer`.

`GeometryBuffer` already documents optional future `indices` for “lines as meshes / filled polygons”; that is **not** wired to either renderer yet.

---

## 3. Geometry kinds in the data pipeline

The type `GeometryKind` (`point`, `line`, `polygon`, `multiPoint`, `multiLine`, `multiPolygon`, `geometryCollection`) describes **metadata** on `FeatureRecord` and worker messages. It reflects **what the source geometry was**, not a separate GPU draw mode.

Flattening (`writeFlattenedGeometry`, GeoJSON worker, chunk builder):

| GeoJSON type | Vertex count (conceptually) | Notes |
|--------------|----------------------------|--------|
| `Point` | 1 | One XY. |
| `MultiPoint` | N | One vertex per point. |
| `LineString` | N | All coordinates in order (no topology for the GPU). |
| `MultiLineString` | sum of line lengths | Lines concatenated. |
| `Polygon` | sum of ring lengths | Outer + inner rings, **GeoJSON order**; closing duplicate is **not** removed. |
| `MultiPolygon` | sum over rings | Nested loops flattened. |
| `GeometryCollection` | sum of children | Recursive flatten. |
| `null` geometry | 0 | Handled as empty where applicable. |

**Feature id:** every emitted vertex carries the same `featureId` for that feature (used for picking and `FeatureStore`).

**Vertex range in records:** `FeatureRecord.vertexStart` / `vertexCount` index the **chunk’s** position buffer for that feature (when using chunked worker payloads), not a global buffer unless you merge on the host.

---

## 4. Styling (`PointStyle` and `styleId`)

### `PointStyle` (GPU style table)

Defined in `src/renderer/point-style.ts`:

```ts
interface PointStyle {
  /** RGBA, linear 0–1 (hosts may still pass sRGB-like values; document per app). */
  color: readonly [number, number, number, number];
  /** Diameter in **backing-store (physical) pixels** — see note below. */
  sizePx: number;
}
```

- Up to **`MAX_POINT_STYLES` (256)** entries.
- Set on the renderer with `setStyleTable(styles[])`.
- The WGSL shader indexes `style_table[style_id]` per vertex.
- **`sizePx` is backing-store pixels, not CSS pixels.** The shader multiplies it directly against the canvas's `viewport_px` uniform (`canvas.width` / `canvas.height`). On a HiDPI display, a given `sizePx` renders larger on-screen (in CSS terms) than the name alone suggests — divide by `devicePixelRatio` yourself if you want CSS-pixel-equivalent sizing. `WebGpuLineRenderer`'s `LineStyle.widthPx` uses the exact same convention (see [§ Lines](#lines-webgpulinerenderer-experimental)), so the two renderers stay consistent with each other.

### Per-vertex `styleId`

- Stored as **`Uint16`** per vertex (`GeometryBuffer.styleIds`).
- GeoJSON worker parse options include **`defaultStyleId`** (default `0`): every vertex in that parse gets that style unless you change the pipeline to assign per-feature ids yourself.
- To use multiple styles, pass several `PointStyle`s and set `defaultStyleId` differently per batch, **or** build / patch `styleIds` before `setGeometry` / after chunk upload (advanced).

**Pick halo:** `setPickPointDiameterPx(px)` should be on the order of the **on-screen** point size so GPU picking matches what you see.

---

## 5. Core renderer: `WebGpuPointsRenderer`

### Create

```ts
import { createWebGpuPointsRenderer } from "stratum-map";

const renderer = await createWebGpuPointsRenderer({
  canvas: htmlCanvasElement,
  alphaMode: "premultiplied", // default; matches typical canvas compositing
  styles: [{ color: [0.2, 0.6, 1, 1], sizePx: 8 }],
  device: optionalSharedGPUDevice,
  gpuBufferPool: optionalPool,
});
```

### Layout modes

1. **Single buffer** — one merged vertex buffer for all points:

   ```ts
   renderer.useSingleGeometryLayout();
   renderer.setGeometry({
     buffer: { positions, featureIds, styleIds },
     vertexCount: n,
   });
   ```

   - `positions`: `Float32Array`, length ≥ `vertexCount * 2` (XY in map CRS).
   - `featureIds`: `Uint32Array`, length ≥ `vertexCount`.
   - `styleIds`: `Uint16Array`, length ≥ `vertexCount` (GPU stride pads to 4 bytes per instance internally on upload).

2. **Chunked** — one GPU buffer triple per worker chunk (good for streaming tiles):

   ```ts
   renderer.useChunkedGeometryLayout();
   renderer.ingestTransferredWorkerChunk(workerChunk, { chunkKey: "tile-12-3456" });
   ```

   - Replace the same `chunkKey` to update that slot.
   - `vertexCount === 0` removes the chunk when `chunkKey` is set.

### Every frame (e.g. from OpenLayers `postrender`)

1. Resize backing store when the map/canvas resizes:

   ```ts
   renderer.resizeToDisplaySize(); // client size × devicePixelRatio
   ```

2. Build a **column-major** 4×4 **map → clip** matrix (same convention as OL WebGL custom layers) and set it:

   ```ts
   renderer.setMapToClipMatrix(columnMajorFloat32x16);
   ```

3. Draw:

   ```ts
   renderer.render({ timeMs: performance.now() });
   ```

### Updating styles without re-uploading positions

In **`useSingleGeometryLayout()`**, you can push new per-vertex `styleIds` only:

```ts
renderer.writeStyleIdsForSingleLayout(styleIdsUint16, vertexCount);
```

`vertexCount` must match the last `setGeometry` call. Useful for selection highlighting (see `examples/demo/main.ts`).

### GPU picking

```ts
const featureId = await renderer.pickFeatureIdAtCanvasPixel(x, y);
```

- `x`, `y` are **canvas backing-store** pixels (`canvas.width` / `canvas.height`), not CSS pixels unless you scale them.
- Returns `null` if nothing hit (id `0` is reserved as empty in the pick encoding).

### Cleanup

```ts
renderer.release();
```

---

## 6. Lines: `WebGpuLineRenderer` (experimental)

**Status:** experimental but supported. The rendering, chunk residency, and picking behavior are proven (Stage 6.2); this section documents the public surface (Stage 6.3). Not yet covered: `MultiLineString`, joins, dashes, polygons — see [§2](#2-what-is-actually-rendered-today).

### Create

```ts
import { createWebGpuLineRenderer } from "stratum-map";

const lineRenderer = await createWebGpuLineRenderer({
  device: pointsRenderer.getDevice(),      // share the device with WebGpuPointsRenderer
  format: pointsRenderer.getCanvasFormat(),
  canvas,                                   // used only to size the offscreen pick texture
  styles: [{ color: [1.0, 0.55, 0.15, 1.0], widthPx: 6 }],
});
```

`WebGpuLineRenderer` never calls `canvas.getContext("webgpu")` and never owns the swapchain — see [Intentional design asymmetries](#intentional-design-asymmetries-vs-webgpupointsrenderer) below.

### Preparing and ingesting `LineString` geometry (the supported path)

```
GeometryBuffer + FeatureRecord[]  →  buildLineSegments(...)  →  LineSegmentBatch  →  renderer.ingestLineSegments(...)
```

```ts
import { buildLineSegments } from "stratum-map";

// buffer.positions/featureIds/styleIds are the same prepared, world-coordinate
// GeometryBuffer used elsewhere in this doc (EPSG:3857 or whatever CRS your view uses) —
// buildLineSegments does not transform or reproject anything.
const segments = buildLineSegments(buffer, records);
lineRenderer.ingestLineSegments(segments, { chunkKey: "my-lines" });
```

- `buildLineSegments(buffer, records)` is the **normal LineString preparation path**. It derives one GPU segment instance per pair of consecutive vertices for every `records` entry whose `geometryKind === "line"` (plain `LineString`); everything else is skipped, not an error. Features with fewer than 2 vertices produce zero segments. `MultiLineString` (`"multiLine"`) is deliberately skipped — its flattened vertices have no retained part boundary, so naively pairing them would draw a spurious segment connecting two logically separate lines.
- **`LineSegmentBatch`** (the return type) is the GPU-shaped intermediate — per-segment start/end positions, feature id, style id. Most callers only pass it straight through to `ingestLineSegments`. **Advanced callers who already have prepared segment-shaped data** (e.g. precomputed off-thread) may construct a `LineSegmentBatch` directly and skip `buildLineSegments` entirely — this is an explicitly supported low-level entry point, not an accident of implementation.
- Positions must already be **prepared world coordinates** — the same CRS as your view, projected before this call (§7). Projection is not, and will not become, this renderer's responsibility.
- `ingestLineSegments(batch, { chunkKey? })` replaces the chunk at `chunkKey` if given (or appends an anonymous, non-replaceable chunk otherwise); `segmentCount === 0` removes the keyed chunk. Same replace/tombstone semantics as `WebGpuPointsRenderer.ingestTransferredWorkerChunk`.

### Styles

`LineStyle` mirrors `PointStyle`: `{ color: [r,g,b,a], widthPx }`, up to `MAX_LINE_STYLES` (256) entries, set with `setStyleTable(styles[])`. `widthPx` is **backing-store pixels**, exactly like `PointStyle.sizePx` (§4) — not CSS pixels.

### Render

```ts
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({ colorAttachments: [{ view, clearValue, loadOp: "clear", storeOp: "store" }] });
lineRenderer.encodeRenderPass(pass, viewState, { timeMs: performance.now() });
pointsRenderer.encodeRenderPass(pass, { timeMs: performance.now() }); // both renderers share one pass
pass.end();
device.queue.submit([encoder.finish()]);
```

### Picking

```ts
const featureId = await lineRenderer.pickFeatureIdAtCanvasPixel(x, y, viewState);
```

- `x`, `y` are **canvas backing-store pixels**, identical convention to `WebGpuPointsRenderer.pickFeatureIdAtCanvasPixel` (§5).
- Unlike the point renderer, `viewState` is an **explicit, required argument** — see asymmetries below.
- `setPickWidthPx(px)` sets the pick hit-test width independently of each line's own visual `widthPx` style, mirroring `setPickPointDiameterPx`.
- Returns `null` on a miss, otherwise the `FeatureId`, using the exact same RGBA8 encode/decode convention as point picking.

### Chunk residency and disposal

Same shape as `WebGpuPointsRenderer`'s chunked layout: `removeChunkByKey`, `evictOldestChunk`, `evictOldestChunks(count)`, `clearChunks`, `getChunkCount`, `getChunkKeys`, `getResidentBytes`, `getChunkByteSize`, `getStats`, `release()`.

### Intentional design asymmetries (vs. `WebGpuPointsRenderer`)

These are **supported design choices**, not missing functionality:

- **`encodeRenderPass()` always encodes into a caller-owned `GPURenderPassEncoder`.** There is no `render()`/`renderWithViewState()` convenience — the line renderer is designed to compose into a pass someone else (typically `WebGpuPointsRenderer`, or your own code) has already opened, per the coexistence example above.
- **The line renderer does not own or configure the canvas context.** It never calls `canvas.getContext("webgpu")` or `context.configure`.
- **It therefore has no `resizeBackingStore()` / `resizeToDisplaySize()` equivalent.** It reads the canvas's current backing-store `width`/`height` live on every `encodeRenderPass`/`pickFeatureIdAtCanvasPixel` call, so resizing the canvas elsewhere (e.g. via the points renderer, or your own code) is sufficient — there is nothing to call on the line renderer itself.
- **`pickFeatureIdAtCanvasPixel()` takes an explicit `ViewState` argument.** `WebGpuPointsRenderer` caches a `ViewState` internally (`renderWithViewState`); the line renderer holds no camera state of its own and requires it on every call. Picking coordinates remain backing-store pixels in both cases.

---

## 7. Coordinate systems and the map matrix

- All **XY** in `positions` must live in the **same CRS as your OpenLayers view** (commonly **EPSG:3857**).
- The demo builds `frameStateToClipMatrix` from `frameState.coordinateToPixelTransform` and map size so that `view_proj * vec4(mapX, mapY, 0, 1)` lands in clip space consistently with the basemap.
- If your data is WGS84, transform with `ol/proj` (`fromLonLat`, `transform`, etc.) **before** filling `positions`.

---

## 8. Loading GeoJSON (`GeoJsonWorkerClient`)

Use the **`stratum-map/client`** entry so your bundler resolves the worker module.

```ts
import { createGeoJsonWorkerClient } from "stratum-map/client";

const client = createGeoJsonWorkerClient();

await client.parse({
  text: geojsonString,
  batchFeatureCount: 10_000,
  baseFeatureId: 0,
  defaultStyleId: 0,
  signal: optionalAbortSignal,
  onChunk: ({ view, records, workerChunk }) => {
    store.ingestRecords(records);
    renderer.ingestTransferredWorkerChunk(workerChunk, { chunkKey: `chunk-${workerChunk.chunkIndex}` });
  },
});

client.terminate();
```

- **`onChunk`** may run many times; buffers are **transferred** (detached on the worker side).
- **`records`**: `FeatureRecord[]` with `geometryKind`, `vertexStart`, `vertexCount`, `properties`.
- For bbox queries, prefer `FeatureStore.ingestRecordsWithPositions` when you have a shared `positions` buffer and valid ranges.

---

## 9. Other ingest (`IngestWorkerClient`)

From **`stratum-map/ingest-client`**:

- **`parse-flatgeobuf-bbox`**: fetch a URL, decode features intersecting a `BBox`, emit the **same chunk wire format** as GeoJSON.
- **`parse-wkb`**: parse a single WKB (optionally EWKB) buffer.

Chunk handling on the main thread is the same as for GeoJSON: ingest into `WebGpuPointsRenderer` + `FeatureStore` as needed.

---

## 10. Metadata and picking (`FeatureStore`, `PointHitTester`)

### `FeatureStore`

- Upsert by **`FeatureRecord.id`**.
- `getById` / `getRecordsInExtent` (extent needs `bbox` from `ingestRecordsWithPositions` when you care about spatial filtering).

### `PointHitTester`

```ts
import { PointHitTester } from "stratum-map";

const tester = new PointHitTester(renderer, store);
const record = await tester.getFeatureAtPixel({ x: backingStoreX, y: backingStoreY });
```

Combines **`pickFeatureIdAtCanvasPixel`** with **`store.getById`**.

---

## 11. GeoArrow (optional)

The package exports **GeoArrow → flatten** helpers (`flattenGeoArrowGeometryData`, etc.) for building the same style of XY buffers from Arrow tables. You still feed the result into **`WebGpuPointsRenderer`** as points; line/polygon Arrow geometries flatten to vertices the same way as GeoJSON.

---

## 12. Browser and performance notes

- **WebGPU** must be available; WGSL uses instanced quads (no `point_size` / `point_coord` builtins).
- Large `vertexCount` means large **instance draws** (6 vertices × N points per frame). Budget accordingly.
- **Picking** runs an offscreen pass over the same geometry; tight loops of many picks per frame are expensive.
- **`@webgpu/types`** is a dev dependency in this repo; consumers may add it for `GPU*` types in TS.

---

## 13. Examples in this repo

| Command | What it runs |
|---------|----------------|
| `npm run bench:pan-zoom` | Synthetic pan/zoom stress (100k points). |
| `npm run demo` / `npm run demo:dev` | OpenLayers + WebGPU overlay demo (`examples/demo/`). |
| `npm run test:smoke` / `test:interaction` (serves it) | `WebGpuPointsRenderer` + `WebGpuLineRenderer` coexistence (`examples/points-lines-demo/`) — see §6. |

For integration patterns (matrix from `FrameState`, canvas overlay, workers), start from **`examples/demo/main.ts`**.

---

## 14. Text / declutter API docs (Markdown)

OpenLayers-style reference pages (hand-written Markdown, not JSDoc):

| Doc | Topic |
|-----|--------|
| [api/QuickStart.md](./api/QuickStart.md) | Overview, imports, checklist |
| [api/TextLayer.md](./api/TextLayer.md) | Host API, OL `postrender`, migration |
| [api/TextRenderer.md](./api/TextRenderer.md) | Low-level GPU draw |
| [api/GlyphAtlas.md](./api/GlyphAtlas.md) | Bitmap atlas |
| [api/MsdfGlyphAtlas.md](./api/MsdfGlyphAtlas.md) | MSDF atlas + loading |
| [api/LabelDeclutter.md](./api/LabelDeclutter.md) | Declutter algorithm |
| [api/TextTypes.md](./api/TextTypes.md) | `TextLabel`, `TextViewState`, constants |

Host these files on **GitHub** (browse in-repo), **GitHub Pages**, or any static site; no build step is required.

---

## Summary table: geometry vs rendering

| Source geometry | In buffers | On screen today |
|-----------------|------------|-----------------|
| Point | 1 vertex / feature | 1 dot |
| MultiPoint | N vertices | N dots |
| LineString | N vertices | N dots via `WebGpuPointsRenderer`, or a true extruded polyline via the experimental `WebGpuLineRenderer` (§6) |
| Polygon rings | sum of ring vertices | many dots (not a fill) |
| MultiLine / MultiPolygon / Collection | flattened vertices | many dots |

For **filled polygons**, you would add (or use elsewhere) pipelines that consume **indexed triangles**; `WebGpuPointsRenderer` is intentionally **point-sprite**-based, and `WebGpuLineRenderer` (§6) covers plain `LineString` only.

If you want a shorter “quick start” only for points, copy the **`createWebGpuPointsRenderer` + `setGeometry` + `setMapToClipMatrix` + `render`** sequence from §5 and supply EPSG:3857 `positions` plus `featureIds` / `styleIds`.
