# stratum-map

**stratum-map** is a GPU-first geospatial rendering layer for the browser (**WebGPU**). It is built to sit beside **[OpenLayers](https://openlayers.org/)**: shared map projection, `FrameState`-style transforms, and canvas sizing—while keeping the core library free of a hard OpenLayers runtime dependency where possible.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/USAGE.md](docs/USAGE.md) | Install, exports, `WebGpuPointsRenderer`, workers, picking |
| [docs/api/QuickStart.md](docs/api/QuickStart.md) | Text & declutter — `TextLayer`, atlases, Markdown API reference |
| [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md) | Credits (OpenLayers, WebGPU ecosystem) |

The [docs/api/](docs/api/) folder is plain Markdown. Host it on GitHub, GitHub Pages, or any static file host.

## License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE).

## Development

```bash
npm install
npm run build
```

See `package.json` for tests and the OpenLayers demo (`npm run demo:dev`).
