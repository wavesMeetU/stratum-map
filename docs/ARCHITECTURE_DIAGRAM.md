# Native Map Engine Architecture Diagram

## Architecture Overview

This document visualizes the architecture for a GPU-native map engine with two rendering modes: OpenLayers-managed and standalone.

## Visual Legend

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         ┌─────────────┐    │
│                         │                Application Layer            │
│                         └─────────────┘ │    │
│                    ┌──────────────────────┐    │
│   │                  ViewState                 │  │
│                    └───────────────┘    │
│                    │                  Projection System        │
│                         ┌──────────────────────┐    │
│   │                  Matrix System            │
│                    └──────────────────────┘    │
│                    │                  Camera              │
│                    └───────────────┘    │
│                         │                  Render Loop           │
│                    │                    ┌──────────────┐    │
│                    │                  Dirty Flag           │
│                    │                  WebGPU Renderer     │
│                    │                  │   ┌──────────────┐   │
│                    │                  │                  │
│                    │  └───────────────┘    │
│                    │                  │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                  │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│ │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│ │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────�   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────�   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌──────────────┐   │
│   │                  │                   │   ┌───────────────┘
│                         └───────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Overview

| Component | Location | Primary Responsibility | Secondary Dependency |
|-----------|----------|-------------------|-------------------|
| **Application Layer** | User code/applications | Manages rendering loop | Frame timing |
| **ViewState** | Core view-state | View management | Clip matrix generation |
| **Projection System** | Coordinate transforms (future) | CRS handling |
| **Matrix System** | World→View→Screen→Clip matrix computation | Clip matrix math |
| **Camera** | View state manager (future) | Pan/zoom/rotate control |
| **Render Loop** | requestAnimationFrame | Dirty flag | Frame callbacks |
| **WebGPU Renderer** | Draw submission | Buffer management |
| **OpenLayers Adapter** | OpenLayers FrameState→ViewState conversion (optional) |
| **MapController** | Lifecycle management | Mode switching | View updates |

## Data Flow

### OpenLayers-Managed Rendering Path

```
OpenLayers Map
    postrender event
        ↓
    OpenLayersFrameStateAdapter
            ↓
        ViewState
        ↓
    renderer.renderWithViewState()
```

### Standalone Rendering Path

```
Bootstrap System (auto-detects)
    ↓
    bootstrapStandalone()
            ↓
    MapController
                ↓
        ViewState
        ↓
    renderer.renderWithViewState()
```

## Key Design Principles

**Single Source of Truth**: ViewState is the authoritative source for all clip matrices

**No FrameState Dependencies**: Renderer uses only `currentViewState.getClipMatrix()`

**Optional OpenLayers Path**: Adapter bridges legacy code without disrupting core

**Mode Separation**: Clean separation - no mixing of concerns in same code path

**Lifecycle Independence**: MapController owns render scheduling, not OpenLayers

## Rendering Modes Comparison

| Feature | OpenLayers Mode | Standalone Mode |
|-----------|-----------|---------------|-----------------|
| Frame source | `postrender` callback | `startRenderLoop()` method |
| Matrix source | OpenLayers adapter (optional) | `ViewState.getClipMatrix()` |
| ViewState source | Direct `ViewState` object | `getClipMatrix()` method |
| Dirty checking | Manual `setDirty()` | Automatic via ViewState |
| Loop control | OpenLayers manages timing | `requestAnimationFrame()` loop |
| Resize handling | Direct via `resizeToDisplaySize()` | `handleResize()` callback | `resize(width, height)` |

## Component Interactions

### ViewState ↔ Renderer

```
setViewState/getClipMatrix()
    ↓
    renderer.setMapToClipMatrix(matrix)
    ↓
    renderer.render(frameState)
```

### MapController ↔ Renderer

```
renderWithViewState(viewState)
    ↓
    ViewState.getClipMatrix()
    ↓
    renderer.render(frameState)
```

### Application ↔ MapController

```
updateViewState()
    ↓
    controller.zoomBy()
    ↓
    controller.pan()
    ↓
    controller.setDirty()
    ↓
    controller.zoomBy()
    ↓
    controller.rotateBy()
    ↓
    controller.resize()
```

## Dependency Graph

```
OpenLayers → FrameStateAdapter → ViewState → renderer → matrix
         (optional dependency path)

Standalone:
    ViewState → renderer → matrix
         (no intermediate layer)
```

## File Summary

| File | Purpose | Status |
|------|----------|--------|
| `src/map-controller.ts` | Lifecycle manager | ✅ |
| `src/renderer/webgpu-points-renderer.ts` | Renderer with ViewState support | ✅ |
| `src/core/view-state.ts` | Single source of truth | ✅ |
| `src/core/openlayers-adapter.ts` | Legacy bridge | ✅ |
| `examples/standalone-rendering/index.html` | Standalone demo | ✅ |
| `docs/MAP_CONTROLLER_GUIDE.md` | Complete guide | ✅ |
| `docs/STANDALONE_SUMMARY.md` | Implementation summary | ✅ |
| `docs/REFACTORING_SUMMARY.md` | Renderer refactoring | ✅ |
| `src/bootstrap.ts` | Standalone bootstrap | ❌ (removed) |
| `docs/ARCHITECTURE_DIAGRAM.md` | Visual architecture | ✅ |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
└─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Current State

**OpenLayers Integration**: Working (no changes required)
**Standalone Bootstrap**: Created (ready for new code)
**Renderer Refactoring**: Complete (ViewState as single source of truth)
**Tests**: All 61 passing

## Migration Path

### From OpenLayers → Standalone

**Phase 1**: Adapter → Single Source
- ✅ OpenLayersFrameStateAdapter bridges legacy ↔ ViewState
- ✅ MapController manages both modes
- ✅ `renderWithViewState()` provides clean API

### From Standalone → OpenLayers

**Phase 2**: Remove Adapter (Future)
- When ready: Make `OpenLayersFrameStateAdapter` optional
- Remove from public exports
- Update demos to use `renderWithViewState()`

### From Dual Mode → Single

**Phase 3**: Cleanup (Future)
- Remove `setMapToClipMatrix()` from renderer (legacy only)
- Remove `mapToClip` field (use currentViewState instead)
- Simplify `encodeRenderPass()` (remove mode checking)
