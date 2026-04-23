# Documentation index

Central map of design and usage docs for **stratum-map**.

| Document | Audience | Contents |
|----------|----------|----------|
| [HLD.md](./HLD.md) | Architects, new contributors | Goals, context diagram, layers, data flows, scope / non-goals |
| [LLD.md](./LLD.md) | Implementers | Module map, buffer layouts, GPU pipelines, workers, sequences |
| [USAGE.md](./USAGE.md) | Integrators | npm exports, APIs, coordinate systems, GeoJSON / ingest clients, picking |
| [ACKNOWLEDGMENTS.md](./ACKNOWLEDGMENTS.md) | Everyone | Credits — OpenLayers, WebGPU, dependencies |
| [SYSTEM_OVERVIEW.md](../SYSTEM_OVERVIEW.md) | Everyone (short) | One-page pipeline overview |
| [EXECUTION_GUIDELINES.md](../EXECUTION_GUIDELINES.md) | Contributors | Separation of concerns, performance dos/don’ts |
| [PHASES.md](../PHASES.md) | Maintainers | Ordered delivery phases (roadmap discipline) |

Optional contributor notes under [`.cursor/skills/`](../.cursor/skills/).

**Examples:** `examples/demo/`, `examples/pan-zoom-bench/` — run via `package.json` scripts (`demo`, `demo:dev`, `bench:pan-zoom`, etc.).
