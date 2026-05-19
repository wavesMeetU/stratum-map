# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

---

## Essential Commands

```bash
npm run build                  # Compile TypeScript to dist/
npm run typecheck             # Type check without emitting
npm test                      # Node unit tests (no WebGPU)
npm run test:visual           # Playwright visual regression (requires WebGPU browser)
npm run test:visual:update    # Update baselines for current OS only
npm run demo:dev              # OpenLayers + WebGPU demo (dev only)
```

---

## Architecture Overview

This is a **WebGPU-accelerated map rendering engine** designed for **OpenLayers compatibility without OpenLayers runtime dependency**.

The system is **strictly layered**:

```
Parser (worker)
→ GeometryBuffer (TypedArrays)
→ GPU Upload (chunked)
→ Renderer (WebGPU)
→ Picking (offscreen pass)
```

### Core Principles

* Renderer is **format-agnostic**
* Data is passed as **dense TypedArrays**
* Parsing happens **off-main-thread (Web Workers)**
* GPU memory is **chunked + LRU managed**
* Rendering is **stateless per frame**

---

## Key Modules

* `src/core/` → FeatureStore, FeatureRecord, GeometryBuffer contracts
* `src/parser/` → GeoJSON / FlatGeobuf / WKB parsing
* `src/worker/` → Worker pipelines and transferable buffers
* `src/gpu/` → ChunkedGeometryController, buffer pools, LRU eviction
* `src/renderer/` → WebGPU renderers (points, future: lines, polygons)
* `src/picking/` → GPU-based feature ID encoding (RGBA8 pass)
* `src/text/` → MSDF / bitmap text + decluttering

---

## Coordinate System (CRITICAL)

### There is NO implicit coordinate handling in this system.

All coordinate spaces must be treated explicitly.

### Spaces

1. **CSS Pixel Space**

   * Origin: DOM events (mouse, pointer)
   * Resolution: layout pixels

2. **Normalized Space (optional but recommended)**

   * Range: `[0, 1]`
   * Device-independent abstraction

3. **Backing-Store Pixel Space (GPU space)**

   * Resolution: `canvas.width × canvas.height`
   * Includes `devicePixelRatio`
   * Used for rendering + picking

---

### Mandatory Rule

> **Picking ALWAYS operates in backing-store pixel space.**

---

### Conversion Boundary (STRICT)

All integrations MUST explicitly convert:

```
CSS → (optional normalized) → backing-store
```

Example:

```ts
function cssToBackingPixel(x: number, y: number, canvas: HTMLCanvasElement) {
  const scaleX = canvas.width / canvas.clientWidth
  const scaleY = canvas.height / canvas.clientHeight
  return [x * scaleX, y * scaleY]
}
```

---

### Forbidden

* ❌ Passing CSS pixels directly into GPU picking
* ❌ Relying on OpenLayers for coordinate transforms
* ❌ Mixing coordinate spaces inside renderer
* ❌ Hidden scaling using `window.devicePixelRatio` without context

---

### Source of Truth

> The **WebGPU renderer defines** coordinate system, not OpenLayers.

OpenLayers is:

* ✅ allowed for demos
* ❌ NOT a dependency for runtime logic

---

## Matrix Conventions

* 4×4 matrices (map → clip space)
* **Column-major layout**
* Compatible with OpenLayers WebGL style (for demos only)

All matrices must be explicitly constructed — no implicit assumptions.

---

## GPU Architecture

### Chunking

* Geometry split into **keyed chunks**
* Managed by `ChunkedGeometryController`
* Supports:

  * Incremental loading
  * Partial updates
  * LRU eviction

---

### Buffer Management

* Uses `ensureVertexCapacity` growth pattern
* Optional pooling via `GpuBufferPool`
* Must respect:

  * `maxBufferSize`
  * binding limits

---

### Readback Strategy

* Picking uses **minimal RGBA8 framebuffer**
* Only 1 pixel read per query
* ❌ No full-buffer readbacks in hot paths

---

## Picking Pipeline

```
Render Pass (color)
→ Offscreen Pass (feature ID encoded in RGBA8)
→ readPixels (1x1)
→ decode feature ID
```

### Rules

* Coordinates MUST be in backing-store space
* Feature IDs must be stable across frames
* Encoding must be deterministic

---

## Testing Strategy

### Node Tests (`tests/*.spec.mjs`)

* No GPU
* Covers:

  * FeatureStore
  * Geometry pipeline
  * Text layout
  * Decluttering
  * MSDF parsing

---

### Playwright Tests (`tests/*.spec.ts`)

* Requires WebGPU-enabled browser
* Covers:

  * Worker pipelines
  * Chunking correctness
  * Rendering correctness
  * Pan/zoom performance

---

### Visual Regression

* Baselines:

  ```
  tests/visual-regression/render-correctness.spec.ts-snapshots/
    ├── linux/
    └── darwin/
  ```

* CI compares against **linux/**

* macOS updates **darwin/**

---

### Tolerance

Defined in `visual-baseline.ts`:

* `maxDiffPixels: 3500`
* `threshold: 0.3`

This accounts for GPU / driver variation.

---

## Performance Principles

### Main Thread

* MUST remain responsive
* No heavy loops over features
* No sync parsing

---

### Workers

* Parsing happens in workers
* Uses transferable buffers
* Zero-copy where possible

---

### GPU

* Avoid buffer reallocation
* Batch uploads
* Prefer instancing

---

## Important Constraints

* OpenLayers is **devDependency only**
* WebGPU is **required**
* Node >= 20
* Strict TypeScript (no implicit any, no unused vars)
* Worker isolation required

---

## Non-Negotiable Rules

* Every function dealing with coordinates MUST declare its space:

  ```
  (css | normalized | backing-store | world)
  ```

* No cross-layer shortcuts:

  ```
  parser ≠ renderer ≠ store
  ```

* No implicit conversions anywhere in pipeline

* Renderer must remain **framework-agnostic**

---

## Key Files

* `src/index.ts` → Public API
* `src/renderer/webgpu-points-renderer.ts` → Main renderer
* `src/gpu/chunked-geometry-controller.ts` → Chunk + LRU logic
* `tests/visual-regression/visual-baseline.ts` → Screenshot tolerance
* `playwright.config.ts` → Browser test config
* `docs/HLD.md`, `docs/LLD.md` → Architecture docs

---

## Development Workflow

1. Must pass:

   ```bash
   npm run build
   npm test
   ```

2. Rendering changes require:

   * Updating visual baselines (linux + darwin)

3. Use Conventional Commits:

   * `feat(renderer):`
   * `fix(picking):`
   * `test:`

4. Any architectural change must preserve:

   * Layer separation
   * Explicit coordinate handling
   * GPU-first design

---

## Mental Model

This is NOT a wrapper over OpenLayers.

This is:

> A **GPU-first rendering engine** with optional OpenLayers interoperability.

Claude must optimize for:

* correctness in coordinate systems
* deterministic GPU behavior
* scalability to large datasets
* minimal CPU involvement

---

## Common Failure Mode (IMPORTANT)

If picking is incorrect:

→ First check coordinate space
→ Then check DPR scaling
→ Then check framebuffer resolution

NOT shader.

---

## Final Note

When in doubt:

> Make coordinate space explicit.
> Make data flow explicit.
> Avoid magic.

---
