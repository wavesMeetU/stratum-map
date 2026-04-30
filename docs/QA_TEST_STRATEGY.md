# QA test strategy (WebGPU mapping engine)

This document captures **test gaps**, **suggested cases**, and **risk areas** for the stratum-map WebGPU renderer and related pipelines. It is scoped to this repository and tied to real code paths (workers, parsers, `WebGpuPointsRenderer`, picking, OpenLayers demos).

**Audience:** QA engineers, maintainers, and contributors defining CI gates.

---

## 1. How tests run today

| Command | What runs |
|---------|-----------|
| `npm test` | `npm run build` then `node --test` on: `tests/feature-store.spec.mjs`, `tests/geojson-pipeline.spec.mjs`, `tests/text-layout.spec.mjs`, `tests/msdf-text.spec.mjs`, `tests/label-declutter.spec.mjs` |
| `npm run test:geojson-worker` | `build:bench` + Playwright: `tests/geojson-worker.spec.ts` (browser worker harness) |
| `npm run verify:pan-zoom` | `build:bench` + Playwright: `tests/pan-zoom-bench.spec.ts` (WebGPU pan/zoom synthetic bench) |
| `npm run test:visual` | `build:bench` + Playwright: `tests/visual-regression/render-correctness.spec.ts` (pixel diff vs PNG baselines) |
| `npm run test:visual:update` | Same as `test:visual` with `--update-snapshots` (refresh baselines after intentional rendering changes) |

Playwright uses Chrome with `--enable-unsafe-webgpu` (`playwright.config.ts`). **Default `npm test` does not run Playwright.**

**CI note:** `.github/workflows/pr-tests.yml` runs on pull requests (and pushes to `main` / `stable`): `npm test` plus `npm run test:visual` (Google Chrome in headless mode + `--enable-unsafe-webgpu`, same as local `playwright.config.ts`). `prepublishOnly` still runs build + test before npm publish. If **Linux CI** pixels still diverge from baselines captured on macOS, run `npm run test:visual:update` in an **ubuntu** environment (or loosen `tests/visual-regression/visual-baseline.ts`). To block merges on green CI, enable **Require status checks** in GitHub branch protection for the `PR tests / test` job.

---

## 2. Strategy pillars

### 2.1 Unit tests (Node, no GPU)

**Goal:** Deterministic coverage of pure logic and data contracts.

**Already covered (representative):** GeoJSON chunk builder and views (`tests/geojson-pipeline.spec.mjs`), `FeatureStore` (`tests/feature-store.spec.mjs`), text layout / MSDF / label declutter (`tests/*.spec.mjs`).

**Gaps:** See [§4 Test gaps](#4-test-gaps).

### 2.2 Rendering and integration tests (browser + WebGPU)

**Goal:** GPU pipeline correctness, worker message contracts, and integration with canvas sizing and async readback.

**Already covered (representative):** Single GeoJSON worker scenario (chunked parse, ArrayBuffers, stable ids) in `tests/geojson-worker.spec.ts`.

**Gaps:** Renderer, picking, OL matrix contract, chunked renderer path, worker failure modes.

### 2.3 Performance and soak tests

**Goal:** Catch regressions under large point counts, upload pressure, resize churn, and concurrent async GPU work.

**Already covered:** `tests/pan-zoom-bench.spec.ts` drives `examples/pan-zoom-bench/` — fixed **100k** points, **240** frames, asserts **p95 frame time** against `P95_BUDGET_MS` in `examples/pan-zoom-bench/main.ts` (bench may **skip** if WebGPU init fails or times out).

**Gaps:** Parameterized scales, text layer, pick storms, resize + pick allocation paths.

### 2.4 Visual regression (Playwright screenshots)

**Goal:** Catch unintended changes to the WebGPU point pass using `expect(locator).toHaveScreenshot` with tolerance.

**Implementation:** `examples/pan-zoom-bench/visual-harness.html` + `visual-harness.ts` (deterministic points, fixed 512×384 canvas). Baselines live under `tests/visual-regression/render-correctness.spec.ts-snapshots/`. Policy and tolerance constants are in `tests/visual-regression/visual-baseline.ts`. `playwright.config.ts` sets `snapshotPathTemplate` without OS suffix so one baseline can gate Linux CI; `maxDiffPixels` / `threshold` absorb `fwidth()` AA and minor GPU variance.

---

## 3. Key code references (for test design)

| Concern | Location |
|---------|----------|
| WebGPU init, render, geometry upload, capacity growth | `src/renderer/webgpu-points-renderer.ts` |
| GPU pick: offscreen pass, `copyTextureToBuffer`, `onSubmittedWorkDone`, `mapAsync` | `src/renderer/webgpu-points-renderer.ts` (`pickFeatureIdAtCanvasPixel`) |
| Feature id decode from RGBA8 readback | `src/picking/id-pack.ts` (`decodeFeatureIdFromRgba8Bytes`) |
| Pick + store composition | `src/picking/point-hit-test.ts` (`PointHitTester`) |
| Style table limit | `src/renderer/point-style.ts` (`MAX_POINT_STYLES` = 256) |
| Chunk slot validation / buffer writes | `src/gpu/gpu-point-chunk-slot.ts` |
| Optional buffer reuse | `src/gpu/gpu-buffer-pool.ts` |
| Ingest worker errors / queue | `src/worker/ingest-worker.ts` |
| GeoJSON worker queue | `src/worker/geojson-worker.ts` |

OpenLayers **clip matrix** helpers today live in **demo entrypoints** (e.g. `examples/demo/main.ts`, `website/demo-pages/*/main.ts`) as `frameStateToClipMatrix` — not under `src/`, which complicates contract testing until extracted.

---

## 4. Test gaps

1. **`npm test` excludes browser/WebGPU suites** — Playwright tests are opt-in. Contributors can pass default tests while breaking worker or pan-zoom behavior.

2. **No automated tests for `WebGpuPointsRenderer`** — `create`, pipeline compile, `setGeometry` / `ensureVertexCapacity`, `useSingleGeometryLayout` vs chunked layout, `resizeToDisplaySize`, `render`, `gpuBufferPool` acquire/release are only exercised manually or via examples/bench.

3. **Picking stack not in default CI path** — Full path: uniforms → pick render pass → `copyTextureToBuffer` → `queue.onSubmittedWorkDone()` → `readbackBuffer.mapAsync`. No golden test for known geometry + matrix → known feature id; no unit tests for `decodeFeatureIdFromRgba8Bytes`.

4. **OpenLayers ↔ clip matrix is demo-local** — Same conceptual transform is duplicated across demos; drift between demos and silent misalignment with the basemap is untested at repo level.

5. **Device loss / recovery** — No harness for `device.lost` or re-creation after context loss; demos handle init failure only.

6. **Workers: uneven coverage** — GeoJSON worker has one browser harness; ingest worker (`ingest-worker.ts`) lacks an equivalent Playwright contract suite for errors, aborts, and queue behavior.

7. **No visual / main-pass pixel regression** — No screenshot or readback-based baseline for the primary color pass (picking is designed for readback, not the main aesthetic pass).

8. **Performance matrix is narrow** — Single point count and single p95 budget; no matrix over DPR, chunked vs single, text enabled, or concurrent picks.

9. **No GitHub Actions workflow running tests** — PRs are not gated by `npm test` or Playwright in this repo’s workflows.

---

## 5. Suggested test cases

### 5.1 Unit / fast (Node or TS, no full browser if avoidable)

| ID | Area | Case |
|----|------|------|
| U1 | `decodeFeatureIdFromRgba8Bytes` | All-zero bytes → `null` (miss / background). |
| U2 | `decodeFeatureIdFromRgba8Bytes` | Packed value `1` → feature id `0`. |
| U3 | `decodeFeatureIdFromRgba8Bytes` | Large ids within `uint32` range; buffer shorter than 4 bytes from offset → `null`. |
| U4 | `setGeometry` | `vertexCount === 0` clears without throwing; negative `vertexCount` throws. |
| U5 | `setGeometry` | `positions` / `featureIds` / `styleIds` shorter than required throws with clear message. |
| U6 | `setGeometry` | `styleIds` with `byteOffset` such that `vertexCount * 2` exceeds backing buffer throws (guard around style GPU upload). |
| U7 | `setStyleTable` | Empty array throws; more than `MAX_POINT_STYLES` styles throws. |
| U8 | Style packing | `packStyleIdsToGpuStride` (or equivalent) preserves `uint16` values round-trip or spot-check high bits. |
| U9 | `FeatureStore` | Extent queries with degenerate bbox; if applicable, antimeridian / world wrapping behavior documented and asserted. |

*(U1–U8 imply importing built `dist/` in Node tests or adding small test-only exports from `src/` after build, consistent with existing `tests/*.spec.mjs` patterns.)*

### 5.2 Rendering / integration (Playwright + WebGPU flags)

| ID | Area | Case |
|----|------|------|
| I1 | Pick correctness | Small canvas: few points at known clip positions, identity `setMapToClipMatrix`, assert `pickFeatureIdAtCanvasPixel` returns expected id on-pixel vs background. |
| I2 | DPR / backing store | Repeat I1 after `resizeToDisplaySize` or equivalent with `devicePixelRatio` 1 vs 2; use **backing-store** pixel coordinates consistently (`PointHitTester` docs). |
| I3 | Frame ordering | Call `pickFeatureIdAtCanvasPixel` immediately after `render()` vs without `render()`; document required ordering for correct results. |
| I4 | Chunked layout | Same as I1 with chunked geometry and multiple chunks; verify draw order does not drop picks. |
| I5 | OL matrix contract | Once `frameStateToClipMatrix` lives in `src/`, add cases: rotation, extreme zoom, `size` vs CSS pixels; use pick or analytic expectation as oracle. |
| I6 | GeoJSON worker | Malformed JSON, oversize payload, abort mid-parse; assert `error` event shape and client state cleanup. |
| I7 | Ingest worker | Invalid FlatGeobuf / WKB paths; assert error messages and no stuck queue under rapid `postMessage` bursts. |

### 5.3 Performance / soak

| ID | Area | Case |
|----|------|------|
| P1 | Scale curve | Parameterize point count (e.g. 25k, 100k, 500k, 1M until `createBuffer` fails); record p50 / p95 / max and optional `memoryHeapInfo` where supported. |
| P2 | Upload vs transform | Fixed matrix: compare full `setGeometry` every frame vs every N frames. |
| P3 | Pick storm | Fire many concurrent `pickFeatureIdAtCanvasPixel` calls, then await `Promise.all`; watch for wrong ids, hangs, or validation errors (readback buffer reuse). |
| P4 | Resize churn | Rapid canvas dimension changes during matrix animation; stress `ensurePickTextureSize` and main pass configuration. |
| P5 | Text layer | Optional: enable `createTextLayerForPointsRenderer` with high `maxGlyphs` and measure frame time and memory; catch OOM gracefully. |

---

## 6. Risk areas

| Risk | Description |
|------|-------------|
| **Concurrent / overlapping picks** | Single `readbackBuffer` and async `mapAsync` / unmap sequence; overlapping picks without serialization may yield incorrect ids or invalid API use. |
| **CSS vs backing-store pixels** | Picking and hit testing assume backing-store coordinates; OL `getEventPixel` vs `canvas.width` / `canvas.height` mismatches are a frequent integration bug. |
| **GPU buffer size limits** | `ensureVertexCapacity` grows vertex buffers; adapters enforce `maxBufferSize` / binding limits — failures surface at runtime, not in current default tests. |
| **Feature id encoding** | RGBA8 packs `featureId + 1`; `0` is reserved for clear/miss. Document and test boundary behavior for large `uint32` ids. |
| **WebGPU init flakes** | Bench uses init timeout and skip path; high skip rate in CI may hide real regressions — monitor skip vs fail. |
| **Text + MSDF path** | Separate pipeline and atlas loads (`src/text/text-renderer.ts`, demos with large `maxGlyphs`); OOM and upload stalls are realistic in the field. |
| **No automated PR gate** | Without CI running tests, documentation alone does not prevent regressions. |

---

## 7. Testability and architecture recommendations

1. **Extract `frameStateToClipMatrix`** (or `olFrameStateToClipMatrix4`) into `src/` (e.g. `src/integration/openlayers-clip-matrix.ts`), unit-test it, and import from demos — single source of truth for OL → WebGPU clip space.

2. **Optional test helper** — `createWebGpuPointsRendererForTests({ device })` or similar, accepting an injected `GPUDevice` from a minimal harness page, to reduce adapter variance in Playwright.

3. **Diagnostics hook (bench / debug builds)** — e.g. `vertexCount`, `capacityVertices`, chunk count, last allocation sizes — to explain perf flakes and buffer growth in CI logs.

4. **CI pipeline** — Add a workflow job: `npm test` plus Playwright suites (`test:geojson-worker`, `verify:pan-zoom`) on a WebGPU-capable runner with the same Chrome flags as `playwright.config.ts`.

5. **Document skip policy** — When `verify:pan-zoom` skips for env reasons, track ratio; distinguish infrastructure skip from `ok: false`.

---

## 8. Success criteria (for closing gaps)

- **Picking:** At least one automated golden test (browser) + `decodeFeatureIdFromRgba8Bytes` unit tests.
- **Renderer:** Smoke tests for `setGeometry`, zero vertices, and style limit errors (Node against built bundle or dedicated test entry).
- **Integration:** Exported OL clip matrix with tests; picking uses backing-store coordinates in all harnesses.
- **CI:** Every PR runs `npm test`; WebGPU jobs run on scheduled or mainline branches if runner cost is a concern.

---

## 9. Related docs

- [HLD.md](./HLD.md) — Architecture and picking overview.
- [LLD.md](./LLD.md) — Module-level detail.
- [USAGE.md](./USAGE.md) — Picking and coordinate conventions for integrators.
