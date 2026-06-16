# Stratum Map - Project Skill

**Primary validation benchmark**: examples/global-cell-towers

## Architecture Principles

### ViewState-Centered Design

All rendering flows through `ViewState`:

```
ViewState (core/view-state.ts)
  ├── center: [number, number]  // EPSG:3857 world coordinates
  ├── zoom: number              // log2 scale
  ├── rotation: number          // radians
  └── viewportSize: [number, number]  // CSS pixels
```

**Critical rule**: ViewState is the single source of truth for camera state. Never duplicate camera logic.

### Strict Layering

```
Parser (worker) → GeometryBuffer → GPU Upload → Renderer → Picking
```

Each layer has strict boundaries:
- Parser is format-agnostic
- GeometryBuffer is contract-based
- Renderer is framework-agnostic
- Picking uses separate RGBA8 pass

### Coordinate System Mandate

**Picking ALWAYS operates in backing-store pixel space.**

Conversion boundary is explicit:
```
CSS → (optional normalized) → backing-store
```

Forbidden:
- ❌ Passing CSS pixels directly to GPU picking
- ❌ Relying on OpenLayers for transforms
- ❌ Mixing coordinate spaces inside renderer

## Sprint 0 Findings

### LOD-001: Vertex Shader LOD Stride

**Issue**: Renderer processes all 5.1M instances regardless of visibility.

**Solution**: WGSL vertex shader stride-based culling

```wgsl
// Built-in LOD stride (instance_id % stride == 0)
let stride = uniforms.lod_stride;
let should_render = (vertex_index & (stride - 1u)) == 0u;
if (!should_render) { return; }
```

**API**: `renderer.setLodStride(stride: number)`

**Validation**: Global Cell Towers demo, stride 1-8

### PICK-001: Picking Coordinate System

**Issue**: Picking coordinates undefined, produces inconsistent results.

**Solution**: Explicit backing-store pixel space conversion

```typescript
function cssToBacking(e: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return [
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY
  ];
}
```

**Rule**: Always declare coordinate space:
- `(css | normalized | backing-store | world)`

## Production Artifacts

### Examples are Production

Examples are NOT demos - they are validation benchmarks:

1. **examples/global-cell-towers/**
   - Primary validation benchmark
   - 5.1M point dataset
   - FPS measurement validation
   - LOD effectiveness testing

2. **examples/minimal-native/**
   - Status: REWRITE REQUIRED
   - Beyond repair (90% broken code)
   - Must use Bootstrap API

3. **examples/geojson-points/**
   - GeoJSON integration pattern
   - Worker pipeline validation

### Technical Debt Status

**CRITICAL**:
- minimal-native: Complete rewrite required (1-2 days)
- FPS measurement: Fixed (frame timestamps, rolling window)

**HIGH**:
- Coordinate system documentation
- Picking test coverage

## Stabilization Workflow

### Required Process

```
Audit → Verify → Implement → Verify Again
```

**Never jump directly to implementation unless explicitly requested.**

### Repository Reality Override

Roadmap assumptions yield to repository reality:
- If code differs from docs, trust the code
- If examples contradict architecture, examples win
- If tests conflict with comments, tests are right

### Audit Checklist

Before any change:
1. Read existing implementation
2. Check related examples
3. Verify test coverage
4. Review architecture docs
5. Cross-reference git history

### Verification Checklist

After implementation:
1. `npm run build` succeeds
2. `npm test` passes
3. Visual regression baselines updated
4. Example behavior validated
5. No console errors

## WebGPU Integration Patterns

### Renderer Lifecycle

```typescript
// Correct: Static factory
const renderer = await WebGpuPointsRenderer.create({
  canvas,
  alphaMode: "premultiplied"
});

// Wrong: Constructor (doesn't exist)
const renderer = new WebGpuPointsRenderer({...}); // ❌
```

### Bootstrap Pattern

```typescript
// Standalone mode
const result = await bootstrapStandalone({
  canvas,
  mode: "standalone",
  initialViewState: new ViewState([0, 0], 10, 0, [800, 600])
});

// Auto-detection
const result = await bootstrapAuto({ canvas });
```

### MapController Usage

```typescript
const controller = new MapController({
  renderer,
  mode: "standalone",
  initialViewState
});

controller.startRenderLoop();
```

## Current Branch Status

### main-with-fixes

**Recent commits**:
- 89a1ce6: fix(fps): correct production FPS measurement
- Benchmark mode integration

**Unmerged changes**:
- examples/global-cell-towers: FPS fix
- examples/global-cell-towers: FRAME metric removed
- Benchmark mode: Separate branch

### Known Issues

1. **minimal-native**: Complete rewrite required
2. **FPS display**: Fixed in main-with-fixes
3. **Documentation**: Outdated vs current code

## Validation Gates

### Before Merging

1. Build succeeds: `npm run build`
2. Tests pass: `npm test`
3. Visual baselines: Updated for current OS
4. Global Cell Towers: Validates at stride 1-8
5. No regression in existing examples

### Performance Baseline

Global Cell Towers (M-series MacBook):
- Stride 1: ~27 FPS baseline
- Stride 8: ~50 FPS (80% improvement)
- Frame time: 20-36ms

## Key Files

- `src/core/view-state.ts` - Camera state
- `src/renderer/webgpu-points-renderer.ts` - Main renderer
- `src/map-controller.ts` - Render lifecycle
- `src/bootstrap.ts` - Initialization
- `examples/global-cell-towers/main.ts` - Primary benchmark

## Commands

```bash
npm run build          # Compile TypeScript
npm run test           # Node unit tests
npm run test:visual    # Playwright visual regression
npm run demo:dev       # OpenLayers + WebGPU demo
```

---

**Last updated**: 2025-01-10 (Sprint 1B preparation)
