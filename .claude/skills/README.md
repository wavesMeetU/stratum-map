# Stratum Map Project Skills

## Installed Skills

### 1. stratum-map (Primary)
**Location**: `.claude/skills/stratum-map/SKILL.md`

**Purpose**: Project-specific guidance and validation

**Contents**:
- Sprint 0 findings (LOD-001, PICK-001)
- ViewState-centered architecture
- Coordinate system mandates
- Stabilization workflow
- Production artifact status (examples as benchmarks)
- Validation gates and performance baselines

**Priority**: ⭐⭐⭐⭐⭐ (Most important)

---

### 2. karpathy-engineering
**Location**: `.claude/skills/karpathy-engineering/SKILL.md`

**Purpose**: Engineering philosophy and workflow

**Contents**:
- Think before coding
- Simplicity first
- Surgical changes
- Goal-driven execution
- Required workflow: Audit → Verify → Implement → Verify

**Priority**: ⭐⭐⭐⭐ (Process foundation)

---

### 3. webgpu
**Location**: `.claude/skills/webgpu/SKILL.md`

**Purpose**: WebGPU implementation reference

**Contents**:
- Buffer lifecycle and patterns
- WGSL reference and examples
- Synchronization best practices
- Rendering architecture patterns
- GPU debugging techniques
- Stratum Map implementation specifics

**Priority**: ⭐⭐⭐ (Technical reference)

---

### 4. webgpu-specs
**Location**: `.claude/skills/webgpu-specs/SKILL.md`

**Purpose**: WebGPU specification reference

**Contents**:
- Official specification links
- API reference (GPUAdapter, GPUDevice, GPUBuffer)
- WGSL type system and built-in functions
- Buffer layout and alignment requirements
- Validation rules and limits
- Stratum Map compliance status

**Priority**: ⭐⭐ (Specification compliance)

---

### 5. geospatial
**Location**: `.claude/skills/geospatial/SKILL.md`

**Purpose**: Mapping and coordinate system guidance

**Contents**:
- EPSG:4326 vs EPSG:3857 conversions
- ViewState coordinate transformations
- Map interactions (pan, zoom, rotate)
- Projections and spatial indexing
- Picking coordinate system rules
- GeoJSON integration patterns

**Priority**: ⭐⭐⭐ (Domain knowledge)

---

## Required Workflow

**All work must follow**:

```
Audit → Verify → Implement → Verify Again
```

**Never jump directly to implementation unless explicitly requested.**

---

## Skill Invocation Order

When solving problems:

1. **stratum-map** - Check project-specific patterns first
2. **karpathy-engineering** - Apply workflow philosophy
3. **webgpu** - Reference WebGPU patterns
4. **geospatial** - Verify coordinate systems
5. **webgpu-specs** - Validate spec compliance

---

## Key Principles

### Repository Reality Override

Roadmap assumptions yield to repository reality:
- If code differs from docs, trust the code
- If examples contradict architecture, examples win
- If tests conflict with comments, tests are right

### Examples are Production

Examples are NOT demos - they are validation benchmarks:
- **examples/global-cell-towers**: Primary validation benchmark
- All examples must build and run
- Visual regression must pass

### Coordinate System Discipline

Always declare coordinate space explicitly:
- `world` - EPSG:3857 meters
- `geographic` - EPSG:4326 degrees
- `screen` - CSS pixels
- `backing-store` - Canvas pixels
- `clip` - Normalized device coordinates [-1, 1]

**Critical rule**: Picking ALWAYS operates in backing-store pixel space.

---

## Validation Gates

Before merging:

1. ✅ Build succeeds: `npm run build`
2. ✅ Tests pass: `npm test`
3. ✅ Visual baselines updated
4. ✅ Global Cell Towers validates
5. ✅ No console errors

---

## Quick Reference

### Commands

```bash
npm run build          # Compile TypeScript
npm run test           # Node unit tests
npm run test:visual    # Playwright visual regression
npm run demo:dev       # OpenLayers + WebGPU demo
```

### Key Files

- `src/core/view-state.ts` - Camera state
- `src/renderer/webgpu-points-renderer.ts` - Main renderer
- `src/map-controller.ts` - Render lifecycle
- `src/bootstrap.ts` - Initialization
- `examples/global-cell-towers/main.ts` - Primary benchmark

---

**Installation Date**: 2025-01-10
**Sprint**: 1B - Minimal Native Recovery
