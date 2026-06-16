# Geospatial Skills - Mapping & Coordinates

## Coordinate Systems

### EPSG:4326 (WGS84)

**Geographic coordinates**: Latitude/longitude

```
latitude:  -90° to +90°  (North-South)
longitude: -180° to +180° (East-West)
```

**Use for**:
- User input/display
- GPS coordinates
- Web map APIs (Leaflet, OpenLayers)

### EPSG:3857 (Web Mercator)

**Projected coordinates**: Meters

```
X: -20,000,000 to +20,000,000 (East-West)
Y: -20,000,000 to +20,000,000 (North-South)
```

**Use for**:
- Web map rendering
- Vector tiles
- Most web mapping libraries

**Conversions**:
```typescript
// EPSG:4326 → EPSG:3857
function mercatorFromLonLat(lon: number, lat: number): [number, number] {
  const x = lon * 20037508.34 / 180;
  let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return [x, y];
}

// EPSG:3857 → EPSG:4326
function lonLatFromMercator(x: number, y: number): [number, number] {
  const lon = x * 180 / 20037508.34;
  let lat = y * 180 / 20037508.34;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lon, lat];
}
```

## ViewState Implementation

### Stratum Map ViewState

**Location**: `src/core/view-state.ts`

**Core State**:
```typescript
class ViewState {
  center: [number, number];    // EPSG:3857 world coordinates
  zoom: number;                 // log2 scale (0 = world view)
  rotation: number;             // radians (0 = north up)
  viewportSize: [number, number]; // CSS pixels
}
```

### Zoom Scale

```
zoom = log2(resolution_ratio)

zoom 0: World view (resolution = 156543 units/pixel at equator)
zoom 1: 1/2 world
zoom 10: ~city scale (1:1000 at equator)
zoom 18: ~building scale
```

**Resolution calculation**:
```typescript
const resolution = 156543.033928 / Math.pow(2, zoom) / Math.cos(lat * Math.PI / 180);
```

### Coordinate Transformations

#### World → Screen

```typescript
function worldToScreen(
  worldX: number,
  worldY: number,
  viewState: ViewState
): [number, number] {
  const resolution = viewState.getResolution();
  const centerX = viewState.viewportSize[0] / 2;
  const centerY = viewState.viewportSize[1] / 2;

  const screenX = centerX + (worldX - viewState.center[0]) / resolution;
  const screenY = centerY - (worldY - viewState.center[1]) / resolution; // Y flip

  return [screenX, screenY];
}
```

#### Screen → World

```typescript
function screenToWorld(
  screenX: number,
  screenY: number,
  viewState: ViewState
): [number, number] {
  const resolution = viewState.getResolution();
  const centerX = viewState.viewportSize[0] / 2;
  const centerY = viewState.viewportSize[1] / 2;

  const worldX = viewState.center[0] + (screenX - centerX) * resolution;
  const worldY = viewState.center[1] - (screenY - centerY) * resolution; // Y flip

  return [worldX, worldY];
}
```

#### World → Clip Space

```typescript
function worldToClip(
  worldX: number,
  worldY: number,
  viewState: ViewState
): [number, number] {
  const resolution = viewState.getResolution();
  const centerX = viewState.viewportSize[0] / 2;
  const centerY = viewState.viewportSize[1] / 2;

  // Normalize to [0, 1]
  const nx = (worldX - viewState.center[0]) / resolution / centerX + 0.5;
  const ny = (worldY - viewState.center[1]) / resolution / centerY + 0.5;

  // Convert to clip space [-1, 1]
  const clipX = nx * 2 - 1;
  const clipY = 1 - ny * 2; // Y flip

  return [clipX, clipY];
}
```

## Map Interactions

### Pan

```typescript
function panByPixels(
  viewState: ViewState,
  pixelDeltaX: number,
  pixelDeltaY: number
): ViewState {
  const resolution = viewState.getResolution();
  const deltaX = pixelDeltaX * resolution;
  const deltaY = pixelDeltaY * resolution;

  return new ViewState(
    [viewState.center[0] - deltaX, viewState.center[1] + deltaY],
    viewState.zoom,
    viewState.rotation,
    viewState.viewportSize
  );
}
```

### Zoom

```typescript
function zoomBy(
  viewState: ViewState,
  factor: number
): ViewState {
  const newZoom = viewState.zoom + Math.log2(factor);
  return new ViewState(
    viewState.center,
    newZoom,
    viewState.rotation,
    viewState.viewportSize
  );
}
```

### Zoom Toward Point

```typescript
function zoomToward(
  viewState: ViewState,
  factor: number,
  anchorX: number,  // World X coordinate
  anchorY: number   // World Y coordinate
): ViewState {
  const newZoom = viewState.zoom + Math.log2(factor);
  const newResolution = Math.pow(2, -newZoom);

  // Calculate new center to keep anchor at same screen position
  const screenX = viewState.viewportSize[0] / 2 + (anchorX - viewState.center[0]) / viewState.getResolution();
  const screenY = viewState.viewportSize[1] / 2 - (anchorY - viewState.center[1]) / viewState.getResolution();

  const newCenterX = anchorX - (screenX - viewState.viewportSize[0] / 2) * newResolution;
  const newCenterY = anchorY + (screenY - viewState.viewportSize[1] / 2) * newResolution;

  return new ViewState(
    [newCenterX, newCenterY],
    newZoom,
    viewState.rotation,
    viewState.viewportSize
  );
}
```

### Rotate

```typescript
function rotateBy(
  viewState: ViewState,
  deltaRotation: number
): ViewState {
  return new ViewState(
    viewState.center,
    viewState.zoom,
    viewState.rotation + deltaRotation,
    viewState.viewportSize
  );
}
```

## Projections

### Common Projections

1. **Web Mercator (EPSG:3857)**
   - Default for web maps
   - Preserves angles (conformal)
   - Distorts area at high latitudes

2. **WGS84 (EPSG:4326)**
   - Geographic coordinates
   - Used for data storage
   - Not for rendering

3. **UTM Zones**
   - Local accuracy
   - Zone-based (60 zones)
   - Limited to zone extent

### Projection Mismatch

**Problem**: Mixing EPSG:4326 and EPSG:3857

```typescript
// WRONG: Treating lat/lon as mercator
const point = { x: -122.4, y: 37.7 }; // San Francisco lat/lon
renderer.addPoint(point); // ❌ Incorrect: uses as mercator meters

// RIGHT: Convert first
const [x, y] = mercatorFromLonLat(-122.4, 37.7);
renderer.addPoint({ x, y }); // ✅ Correct: mercator meters
```

## Spatial Indexing

### Quadtree

**Purpose**: Fast spatial queries for large datasets

```typescript
class QuadTree {
  private bounds: { minX: number, minY: number, maxX: number, maxY: number };
  private points: Point[] = [];
  private children: QuadTree[] = [];

  insert(point: Point): void {
    if (this.points.length < 4) {
      this.points.push(point);
    } else {
      this.split();
      this.children.forEach(child => child.insert(point));
    }
  }

  query(bounds: BBox): Point[] {
    // Return points within bounds
  }
}
```

### R-Tree

**Purpose**: Efficient bounding box queries

```typescript
class RTree {
  private root: RTreeNode;

  insert(feature: Feature, bbox: BBox): void {
    // Insert with R-tree heuristics
  }

  query(bbox: BBox): Feature[] {
    // Return features intersecting bbox
  }
}
```

### Spatial Hash

**Purpose**: Fast point-in-grid queries

```typescript
class SpatialHash {
  private cellSize: number;
  private grid: Map<string, Feature[]> = new Map();

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(feature: Feature, x: number, y: number): void {
    const key = this.getKey(x, y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(feature);
  }

  query(x: number, y: number, radius: number): Feature[] {
    // Check surrounding cells
  }
}
```

## Picking Coordinates

### Critical Rule

**Picking ALWAYS operates in backing-store pixel space.**

```typescript
function cssToBacking(
  e: MouseEvent,
  canvas: HTMLCanvasElement
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return [
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY
  ];
}
```

**Why**:
- Canvas backing store uses device pixel ratio
- CSS pixels are layout units
- Mixing produces offset errors
- Picking requires exact pixel correspondence

### Coordinate Space Declaration

Always declare coordinate space explicitly:

```typescript
// GOOD: Explicit
function worldToScreen(worldX: number, worldY: number): [number, number] {
  // world (EPSG:3857) → screen (CSS pixels)
}

// BAD: Implicit
function transform(x: number, y: number): [number, number] {
  // What coordinate system? Who knows.
}
```

## GeoJSON Integration

### GeoJSON Coordinate System

**All GeoJSON coordinates are EPSG:4326 (lon, lat)**

```json
{
  "type": "Point",
  "coordinates": [-122.4, 37.7]  // [longitude, latitude]
}
```

### Conversion Pattern

```typescript
import { mercatorFromLonLat } from './projections';

function loadGeoJSON(geojson: GeoJSON.FeatureCollection): void {
  geojson.features.forEach(feature => {
    if (feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      const [x, y] = mercatorFromLonLat(lon, lat);
      renderer.addPoint({ x, y });
    }
  });
}
```

## Tile Systems

### XYZ Tile Scheme

```typescript
function tileToBBox(z: number, x: number, y: number): BBox {
  const n = Math.pow(2, z);
  const minX = x / n * 360 - 180;
  const maxX = (x + 1) / n * 360 - 180;

  const lat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const lat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;

  return { minX, minY: lat2, maxX, maxY: lat1 };
}
```

### Tile Coordinates to Pixels

```typescript
function lonLatToTilePixel(lon: number, lat: number, z: number): [number, number] {
  const n = Math.pow(2, z);
  const x = (lon + 180) / 360 * n * 256;
  const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n * 256;
  return [x, y];
}
```

## Stratum Map Patterns

### Current Implementation

- **ViewState**: `src/core/view-state.ts`
- **Projections**: Not implemented (assumes EPSG:3857)
- **Picking**: Explicit backing-store conversion
- **Interactions**: MapController API

### Helper Functions

```typescript
import { panByPixels, zoomToward } from './src/index.js';

// Pan by pixel delta
const newState = panByPixels(viewState, dx, dy);

// Zoom toward point
const newState = zoomToward(viewState, factor, anchorX, anchorY);
```

### Coordinate Space Discipline

**Required declaration pattern**:
- `world` - EPSG:3857 meters
- `geographic` - EPSG:4326 degrees
- `screen` - CSS pixels
- `backing-store` - Canvas pixels
- `clip` - Normalized device coordinates [-1, 1]

**Example**:
```typescript
/**
 * Convert world (EPSG:3857) to screen (CSS pixels)
 */
function worldToScreen(worldX: number, worldY: number): [number, number] {
  // ...
}
```

## Common Pitfalls

### 1. Y-Axis Direction

```typescript
// WRONG: Forgetting Y flip
const screenY = centerY + (worldY - centerY) / resolution; // ❌

// RIGHT: Explicit Y flip
const screenY = centerY - (worldY - centerY) / resolution; // ✅
```

### 2. Coordinate System Confusion

```typescript
// WRONG: Treating lat/lon as mercator
renderer.addPoint({ x: -122.4, y: 37.7 }); // ❌

// RIGHT: Convert to mercator
const [x, y] = mercatorFromLonLat(-122.4, 37.7);
renderer.addPoint({ x, y }); // ✅
```

### 3. Device Pixel Ratio

```typescript
// WRONG: Ignoring device pixel ratio
const pixelX = e.clientX; // ❌

// RIGHT: Scale to backing store
const scaleX = canvas.width / canvas.clientWidth;
const pixelX = (e.clientX - rect.left) * scaleX; // ✅
```

---

**For ViewState API**, see: `src/core/view-state.ts`
**For projection utilities**, see: GeoJSON worker examples
