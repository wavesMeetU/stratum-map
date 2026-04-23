---
sidebar_position: 7
---

# PointHitTester

Thin adapter: **`WebGpuPointsRenderer.pickFeatureIdAtCanvasPixel`** → **`FeatureStore.getById`**, plus optional **extent scan** via the store.

## Import

```ts
import { PointHitTester, type GetFeatureAtPixelOptions } from "stratum-map";
```

## Constructor

```ts
new PointHitTester(renderer: WebGpuPointsRenderer, store: FeatureStore)
```

## Methods

### `getFeatureAtPixel(options): Promise<StoredFeatureRecord | null>`

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | `number` | **Backing-store** canvas pixels |

Returns `null` on miss or unknown id.

### `getFeaturesInExtent(extent): StoredFeatureRecord[]`

Uses bbox metadata from `FeatureStore.ingestRecordsWithPositions`.

## Performance notes

- GPU pick has **fixed cost** per query — throttle hover probes.
- Extent query cost grows with **indexed record count**.

## See also

- [GPU picking](../gpu-picking.md)
- [Points renderer](./points-renderer.md)
