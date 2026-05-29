# WebGPU Development Guidelines

GPU-native development rules for stratum-map rendering engine.

## Core Principles

1. **GPU-First Architecture**: Rendering is GPU-native, not CPU-driven
2. **Zero-Copy Pipeline**: Data flows from disk → GPU with minimal CPU intervention
3. **TypedArrays Only**: No JS objects during hot paths
4. **Spatial Coherence**: Preserve locality in data layouts
5. **Explicit Spaces**: Always declare coordinate system (CSS/backing/world)

## Coordinate System Rules

**MANDATORY**: Every function handling coordinates MUST declare its space:
- `css` - DOM event coordinates (top-left origin)
- `backing` - Canvas pixel space (WebGPU texture coordinates)
- `world` - EPSG:3857 projected coordinates
- `ndc` - Normalized device coordinates (-1 to +1)

**Forbidden**:
- Implicit coordinate conversions
- Mixing coordinate spaces without explicit conversion
- Relying on OpenLayers for coordinate transforms

## Binary Data Conventions

- **Column-major matrices** (WebGPU standard)
- **Little-endian byte order** (x86/ARM standard)
- **TypedArray views** over ArrayBuffer slices (zero-copy)
- **Metadata headers** with magic/version/offset fields
- **Contiguous vertex data** (interleaved or parallel arrays)

## Performance Rules

1. **No CPU loops over features** in render path
2. **No per-frame allocations** - reuse buffers
3. **Batch GPU uploads** - minimize draw calls
4. **Instancing preferred** over individual draws
5. **LOD culling on GPU** - not CPU side
6. **Texture atlases** for font glyphs
7. **Chunked rendering** for large datasets

## Shader Guidelines

- **Prefer vertex shader computation** over fragment when possible
- **Avoid divergent control flow** in fragment shaders
- **Use fwidth()** in uniform control flow only
- **Encode feature IDs in RGBA8** for picking
- **Additive blending** for density visualization

## Memory Management

- **Buffer pools** for transient allocations
- **LRU eviction** for chunked geometry
- **Transferable objects** for worker communication
- **No string manipulation** in hot paths
- **Recycle arrays** where possible

## Common Pitfalls

❌ **Parsing JSON on main thread**
✅ **WebWorker + binary format**

❌ **Creating objects per frame**
✅ **TypedArray reuse**

❌ **CPU-side LOD filtering**
✅ **GPU stride culling**

❌ **Implicit coordinate handling**
✅ **Explicit space declarations**

❌ **Texture readback per frame**
✅ **Offscreen pick pass on demand**