# Global Cell Towers Example

## Overview

The **Global Cell Towers** example demonstrates GPU-native geospatial visualization at massive scale. It renders **5.1 million cellular towers** worldwide from the [OpenCellID](https://opencellid.org/) dataset using a custom binary data format, Cloudflare edge delivery, and WebGPU rendering.

This example showcases Stratum's core philosophy: **GPU-first architecture** with minimal CPU overhead and zero feature object allocation.

## What It Demonstrates

- **Massive-scale point rendering**: 5.1M points rendered efficiently
- **Binary streaming architecture**: Custom binary format → TypedArrays → GPU
- **Zero GeoJSON overhead**: No runtime parsing, reprojection, or feature object creation
- **Edge delivery**: Cloudflare R2 + Workers for fast global data serving
- **GPU-native pipeline**: Direct TypedArray → GPU buffer uploads
- **Interactive**: Hover popover, GPU picking, legend toggles, zoom controls
- **Performance metrics**: Real-time FPS, tower count, zoom level display

## Architecture

### Data Pipeline

```
Cloudflare R2 Storage
    ↓
Cloudflare Worker (binary streaming)
    ↓
ArrayBuffer (in browser)
    ↓
Float32Array (positions)
Uint32Array (feature IDs)
Uint16Array (style IDs)
DataView (metadata)
    ↓
WebGPU Buffer Upload
    ↓
WebGPU Renderer (instanced points)
```

### Key Features

1. **Custom Binary Format** (`towers.bin`)
   - 24-byte header: magic, version, point count, buffer offsets
   - Contiguous typed arrays for GPU upload
   - Compact metadata per tower (radio type, MCC, network ID, range)

2. **WebGPU Rendering**
   - Instanced point sprites with quad vertices
   - Additive blending for density visualization
   - Gaussian glow falloff per radio type
   - Zoom-dependent LOD (stride culling in vertex shader)

3. **Interactive Features**
   - Hover popover with tower metadata
   - GPU picking via offscreen RGBA8 render pass
   - Radio-type legend with visibility toggles
   - Zoom-dependent point sizing

## Performance Characteristics

- **Dataset**: 5.1M towers worldwide
- **Data size**: ~200MB binary (compressed)
- **Load time**: <5 seconds via Cloudflare CDN
- **Rendering**: 60 FPS at world view, GPU-limited at high zoom
- **Memory**: GPU buffers sized for full dataset
- **LOD**: Dynamic stride culling (2.5% → 100% based on zoom)

## Technical Details

### Binary Format Specification

**Header** (24 bytes):
- `magic`: 0x53524f42 ("SRoB")
- `version`: 1
- `N`: point count (uint32)
- `positionsOffset`: offset to Float32Array positions (uint32)
- `featureIdsOffset`: offset to Uint32Array feature IDs (uint32)
- `metaOffset`: offset to metadata records (uint32)

**Data Layout**:
- `Float32Array positions[N * 2]`: x, y coordinates (EPSG:3857)
- `Uint32Array featureIds[N]`: unique feature ID per tower
- `Uint16Array styleIds[N]`: radio type (0=NR, 1=LTE, 2=UMTS, 3=GSM)
- `Metadata records[N * 12]`: radio, MCC, network, range per tower

### Styling System

Four radio types with distinct colors:
- **NR (5G)**: Cyan `#00e5ff` - glow 1.0, size 5px
- **LTE (4G)**: Green `#39ff14` - glow 1.0, size 4px
- **UMTS (3G)**: Orange `#ff9100` - glow 1.0, size 3.5px
- **GSM (2G)**: Red `#ff1744` - glow 1.5, size 3px

### Zoom-Dependent LOD

| Zoom Range | LOD Stride | Points Rendered |
|-----------|------------|-----------------|
| 6+ | 1 | 100% |
| 4.5-6 | 2 | 50% |
| 3.5-4.5 | 4 | 25% |
| 2.5-3.5 | 8 | 12.5% |
| 1.5-2.5 | 20 | 5% |
| <1.5 | 40 | 2.5% |

Stride culling happens in the vertex shader using `featureId % stride == 0` - zero CPU overhead.

## Running Locally

```bash
npm run towers:dev
```

Then open http://127.0.0.1:4176/

## Live Demo

<https://wavesmeetu.github.io/stratum-map/examples/towers>

## Data Source

[OpenCellID](https://opencellid.org/) - Largest open database of cell tower locations worldwide. Licensed under CC BY-SA 4.0.

## Browser Requirements

- **WebGPU support**: Chrome 113+, Edge 113+
- **Memory**: 4GB+ RAM recommended for full dataset
- **Network**: Broadband connection for initial data load (~200MB)

## See Also

- [WebGPU Integration Guide](openlayers-integration.md)
- [GPU Picking Documentation](gpu-picking.md)
- [Text Rendering](text-rendering.md)
- [Label Decluttering](label-decluttering.md)
