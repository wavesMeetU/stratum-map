# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-17

### Added

#### Core Rendering

- **WebGpuPointsRenderer** — WebGPU-based instanced point rendering with style table support
- **createWebGpuPointsRenderer()** — Factory function for renderer initialization
- **MapController** — Render lifecycle management with dirty flag optimization
- **ViewState** — Map camera state (center, zoom, rotation, viewport)
- **bootstrapAuto()** — Automatic WebGPU initialization and canvas creation
- **standaloneBootstrap()** — Manual bootstrap with mode selection (OpenLayers/standalone)

#### Geometry & Data Pipeline

- **FeatureStore** — In-memory feature storage with geometry buffer management
- **GeometryBuffer / GeometryBufferView** — TypedArray-based geometry contracts
- **ChunkedGeometryController** — Chunked GPU uploads with LRU eviction
- **GpuBufferPool** — Optional GPU buffer pooling for reduced allocation overhead
- **GeoJSON Worker Client** — Web Worker-based GeoJSON parsing
- **Ingest Worker Client** — Generic worker client for data ingestion
- **GeoArrow support** — Apache Arrow / GeoArrow integration via `@geoarrow/geoarrow-js`

#### Picking

- **PointHitTester** — Feature-at-pixel queries for hover/click interactions
- **decodeFeatureIdFromRgba8Bytes()** — Feature ID decoding from GPU picking pass
- **GPU picking shader** — Offscreen RGBA8 render pass for feature ID encoding

#### Text Rendering

- **TextRenderer** — WebGPU-based text rendering
- **TextLayer** — High-level text layer with automatic layout
- **MsdfGlyphAtlas** — MSDF (multi-signed distance field) glyph atlas support
- **GlyphAtlas** — Bitmap glyph atlas support
- **layoutTextLabels()** — Label layout engine
- **declutterLabels()** — Label decluttering with collision detection

#### OpenLayers Integration

- **OpenLayersFrameStateAdapter** — OpenLayers frame state integration
- **MapController render modes** — Switch between OpenLayers-managed and standalone rendering

#### Utilities

- **panByPixels()** — Pan by pixel delta
- **zoomToward()** — Zoom toward a point
- **alignTo4Bytes()** — Byte alignment utilities
- **bucketByteSizeCeil()** — Buffer size calculation

### Examples

- **minimal-native** — Minimal rendering example with 3-point triangle
- **standalone-rendering** — Manual renderer setup with pan/zoom controls
- **integration-example** — OpenLayers integration with mode switching
- **global-cell-towers** — Real-world example with 5.1M cell towers and picking

### Verification

#### Node Test Suite

- FeatureStore tests
- GeoJSON pipeline tests
- Text layout tests
- MSDF text tests
- Label declutter tests
- OpenLayers adapter tests
- ViewState tests

#### Playwright Tests

- **Smoke tests** — Visual regression across all examples
- **Interaction tests** — Pan/zoom, mode switching, tower picking

### Notes

#### Requirements

- **WebGPU** — Requires a WebGPU-enabled browser
- **Node.js >= 20** — For development and testing
- **TypeScript >= 5.7** — For type safety

#### Browser Support

- **Chrome/Edge 113+** — WebGPU available by default or via flag
- **Firefox Nightly** — WebGPU under active development
- **Safari Technology Preview** — WebGPU under active development

Check [caniuse.com/webgpu](https://caniuse.com/webgpu) for current status.

#### Stability

This is the initial public release (v0.1.0). The API surface may evolve based on early adopter feedback. Particular areas under active development:

- Buffer pooling strategies
- Level-of-detail (LOD) scaling
- Performance optimization patterns
- Browser-specific GPU workarounds

#### License

Apache-2.0. See [LICENSE](LICENSE).

#### Third-Party Notices

This project integrates:
- Apache Arrow (@geoarrow/geoarrow-js)
- OpenLayers (devDependency, demos only)

Full third-party notices in [website/docs/third-party-notices.md](website/docs/third-party-notices.md).

## [Unreleased]
