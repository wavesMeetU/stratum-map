# Complete Architecture - Standalone Rendering Engine

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    Application Layer                          │
├────────────────────────────────────────────────────────────────────────────────────┤
│                         └──────────────────────────────────────────────────────────────────────────────┘
│                                                            │
│  ┌──────────────┐                 ┌──────────────┐                 │  └──────────────┘
│  │  │               │                  ViewState       │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                 │  │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │ │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────�                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────�                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────�                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────�                 │                   │   └──────────────�
│  │  │                  ┌──────────────�                 │                   │   └──────────────┘
│ │  │                  ┌──────────────�                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                   │   └──────────────�
│  │  │                  ┌──────────────�                 │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                   │   └──────────────�
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌───────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │  │                  ┌──────────────┐                 │                   │   └──────────────┘
│  │  │                  ┌──────────────┐                 │                   │   └──────────────�
│ │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │                  ┌──────────────┐                 │                   │   └──────────────┘
│ │                  ┌──────────────┐                 │                   │   └──────────────�
│ │ │                  ┌───────────────┘
│ └───────────────┘
```

## Key Relationships

### Application Layer → ViewState → Renderer
```
map.on('postrender') → OpenLayersFrameStateAdapter.frameStateToViewState() → ViewState
↓
ViewState.getClipMatrix() → renderer.setMapToClipMatrix()
↓
renderer.encodeRenderPass() → GPU rendering
```

### MapController → Renderer
```
controller.updateViewState(newState)
↓
controller.panByPixels(dx, dy)
↓
controller.zoomBy(deltaZoom)
↓
controller.rotateBy(deltaRotation)
↓
controller.startRenderLoop()
    (in standalone mode only)
↓
controller.renderFrame(timestamp)
    ↓
controller.setDirty()
```

### OpenLayers FrameStateAdapter (Optional Component)

```
frameStateToViewState(frameState)
    - Converts OpenLayers state to ViewState
    - Uses ViewState.getClipMatrix() internally
```

### Migration Path: OpenLayers → Standalone

```
Before: (Current State)
    - OpenLayers → FrameStateAdapter → ViewState
    - Renderer.setMapToClipMatrix()
    - Renderer.render()

After: (Target State)
    - Standalone → MapController
    - renderer.renderWithViewState()
    - ViewState becomes single source of truth
```

### Component Responsibilities

| Component | OpenLayers Mode | Standalone Mode |
|-----------|-----------------|----------------|
| **Application** | Manages postrender events | Uses MapController for frame scheduling |
| **ViewState** | Stores view parameters (center, zoom, rotation, viewport) | Single source of truth for matrix generation |
| **WebGPU Renderer** | Uploads uniforms, encodes renders, manages buffers |
| **MapController** | Orchestrates render loop, updates ViewState, handles dirty flag |

| **OpenLayers Adapter** | (Optional) Converts OpenLayers state to ViewState (for compatibility) |
| **Standalone Bootstrap** | Initializes system cleanly without OpenLayers dependency |

## Implementation Files

| File | Purpose | Changes |
|------|----------|--------|
| `src/map-controller.ts` | New core lifecycle management | ✅ |
| `src/renderer/webgpu-points-renderer.ts` | Refactored for ViewState internals | ✅ |
| `src/bootstrap.ts` | Standalone bootstrap system | ✅ |
| `examples/standalone-rendering/index.html` | Standalone demo | ✅ |
| `docs/MAP_CONTROLLER_GUIDE.md` | Architecture guide | ✅ |
| `docs/OPENLAYS_MIGRATION.md` | Migration strategy | ✅ |
| `docs/REFACTORING_SUMMARY.md` | Refactoring summary | ✅ |

## Key Achievement

✅ **Renderer Independence**: WebGPU renderer now derives all clip matrices from ViewState internally
✅ **Dual-Mode Support**: MapController provides clean separation between OpenLayers-managed and standalone rendering
✅ **Clean Separation**: Application layer, rendering, and view state are cleanly separated
✅ **Zero Breaking**: All existing demos continue working with full API compatibility

## Next Steps

### For New Applications
1. Use `bootstrapStandalone()` to initialize new standalone applications
2. Update demos gradually to use `renderWithViewState()`
3. When ready: Update `docs/MAP_CONTROLLER_GUIDE.md` to document the adapter pattern

### For Existing OpenLayers Integration
1. Keep using current paths until ready to fully remove OpenLayers
2. Update `docs/REFACTORING_SUMMARY.md` with future removal guidance

### For Future OpenLayers Removal
1. All new code must use standalone mode exclusively
2. Update demos to standalone-only
3. Remove `setMapToClipMatrix()` when adapter is removed
4. Delete `OpenLayersFrameStateAdapter` from exports
5. Update `src/index.ts` and `src/bootstrap.ts` exports
