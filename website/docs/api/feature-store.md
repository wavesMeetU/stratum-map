---
sidebar_position: 6
---

# FeatureStore

CPU-side **index** from `FeatureId` to `StoredFeatureRecord` with geometry references (`vertexStart`, `vertexCount`, buffer handles) and optional **axis-aligned bbox** for extent queries.

## Import

```ts
import { FeatureStore, type StoredFeatureRecord, type MapExtent } from "stratum-map";
```

## Construction

`new FeatureStore()` — empty store.

## Ingest / mutation

| Method | Summary |
|--------|---------|
| `ingestRecordsWithPositions(...)` | Upsert records + compute bbox from positions view |
| `remove(id)` / `clear()` | Delete one or all |
| `retainIds(ids)` | Tombstone anything not in the set |

## Queries

| Method | Summary |
|--------|---------|
| `getById(id)` | O(1) average lookup |
| `getRecordsInExtent(extent)` | Linear scan using bbox metadata |

## Performance notes

- `getRecordsInExtent` is **O(n)** over records — acceptable for moderate feature counts; spatial indexing is an application concern if you need millions of extent hits per frame.

## See also

- [Point hit tester](./point-hit-tester.md)
