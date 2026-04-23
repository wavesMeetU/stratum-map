---
sidebar_position: 9
---

# Benchmarks

## In-repository harnesses

| Script | What it measures |
|--------|------------------|
| `npm run verify:pan-zoom` | Playwright pan/zoom on the Vite bench bundle |
| `npm run test:geojson-worker` | Worker integration under Playwright |
| `npm run bench:pan-zoom` | Local preview of the bench app (`vite preview`) |

## How to read results

- Throughput and frame times are **machine- and GPU-dependent**.
- Use benchmarks as **regression detectors** on consistent hardware (CI runners or a dedicated bench box).
- Compare **branch vs main** rather than absolute marketing numbers.

## Node unit tests

`npm test` runs deterministic tests for `FeatureStore`, GeoJSON chunk builder, text layout, MSDF JSON parsing, and declutter logic — useful for CPU-side correctness, not GPU frame pacing.

## Future work

- Scripted cold-start and warm pan sessions with trace capture.
- Optional WebGPU timestamp queries where supported.
