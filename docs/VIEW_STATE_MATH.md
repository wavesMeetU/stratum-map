# ViewState System: Mathematical Foundation

## Overview

The ViewState system provides a complete, self-contained solution for managing map view state and computing transformation matrices for WebGPU rendering. It removes all OpenLayers dependencies while maintaining compatibility with standard web mapping conventions.

## Core Concepts

### 1. Coordinate Spaces

```
World Space (mercator meters)
    ↓ Translate by -center, Scale by resolution
View Space (relative to center, pre-rotation)
    ↓ Rotate by -rotation
Screen Space (pixels, axis-aligned)
    ↓ Scale by 2/viewportSize, Translate by -1
Clip Space (normalized device coordinates [-1,1])
```

### 2. Zoom and Resolution

**Zoom Level** is an integer or float that represents discrete zoom steps:
- Zoom 0: Entire world visible (lowest detail)
- Zoom 1: World at 50% scale
- Zoom 2: World at 25% scale
- ...
- Zoom 20: Street-level detail

**Resolution** is the continuous equivalent:
- Resolution = map units per pixel
- Lower resolution = more zoomed in
- Higher resolution = more zoomed out

**The Relationship:**
```
resolution = baseResolution / (2^zoom)
```

Where `baseResolution` is the resolution at zoom 0.

For Web Mercator (EPSG:3857):
- World width: 40,075,016.686 meters
- Tile size at zoom 0: 256×256 pixels
- Base resolution: 40,075,016.686 / 256 ≈ 156,543.034 m/pixel

**Why this matters:**
- Zoom provides user-friendly discrete levels
- Resolution provides precise mathematical calculations
- Converting between them is deterministic and reversible

### 3. Rotation

Rotation is specified in **radians**, counter-clockwise:
- 0: North up
- π/2: East up
- π: South up
- -π/2: West up

**Important:** We apply the **negative** rotation when transforming world to screen space. This is because:
- If the view is rotated +90° (clockwise), the world appears rotated -90°
- To render correctly, we counter-rotate the world coordinates

## Matrix Mathematics

### The Transformation Chain

The clip matrix is the product of 5 transformations:

```
M_clip = T_clip × S_viewport × R_rot × S_res × T_center
```

Where:
- `T_center`: Translate world coordinates to view center
- `S_res`: Scale by resolution (world → screen)
- `R_rot`: Rotate counter-clockwise
- `S_viewport`: Scale to viewport dimensions
- `T_clip`: Translate to clip space origin

### Individual Matrices (Column-Major)

#### 1. Translation to Center
```
T_center = | 1  0  0  -cx |
           | 0  1  0  -cy |
           | 0  0  1   0  |
           | 0  0  0   1  |
```

#### 2. Scale by Resolution
```
S_res = | 1/res  0      0  0 |
        | 0      1/res  0  0 |
        | 0      0      1  0 |
        | 0      0      0  1 |
```

#### 3. Rotation (Counter-Clockwise)
```
R_rot = | cos(-θ)  -sin(-θ)  0  0 |
        | sin(-θ)   cos(-θ)  0  0 |
        | 0         0       1  0 |
        | 0         0       0  1 |
```

#### 4. Scale to Viewport
```
S_viewport = | 2/width  0        0  0 |
             | 0        2/height 0  0 |
             | 0        0        1  0 |
             | 0        0        0  1 |
```

#### 5. Translation to Clip Space
```
T_clip = | 1  0  0  -1 |
         | 0  1  0  -1 |
         | 0  0  1   0 |
         | 0  0  0   1 |
```

### Combined Matrix

Multiplying these together and simplifying (column-major):

```
M_clip = |  cos/(res*w)   -sin/(res*h)   0  Tx |
         |  sin/(res*w)    cos/(res*h)   0  Ty |
         |  0              0             1   0 |
         |  0              0             0   1 |
```

Where:
```
Tx = (-cx*cos + cy*sin)/(res*w) - 1
Ty = (-cx*sin - cy*cos)/(res*h) - 1
```

## WebGPU Clip Space Convention

WebGPU uses a **right-handed** coordinate system with:
- **X**: [-1, 1] from left to right
- **Y**: [-1, 1] from bottom to top (⚠️ NOTE: bottom is -1, top is +1)
- **Z**: [0, 1] from near to far (for 2D, typically 0.5)

**Important:** This Y-axis direction is **opposite** to many 2D graphics systems where Y increases downward.

Our matrix correctly handles this by:
1. Scaling Y by `2/height` (positive, since height is positive)
2. Translating by `-1` (shifts [0, height] to [-1, 1])
3. The result: screen Y=0 becomes clip Y=-1, screen Y=height becomes clip Y=+1

## Usage Examples

### Basic Usage
```typescript
const view = new ViewState(
  [0, 0],        // Center at origin
  10,            // Zoom level 10
  0,             // No rotation
  [800, 600]     // 800×600 viewport
);

const matrix = view.getClipMatrix();
// Upload matrix to GPU shader
device.queue.writeBuffer(matrixBuffer, 0, matrix);
```

### Pan Operation
```typescript
const panned = view.pan(1000, 500); // Pan 1000m east, 500m north
```

### Pan by Screen Pixels
```typescript
// Pan 50 pixels right, 30 pixels down
const panned = panByPixels(view, 50, 30);
```

### Zoom Operation
```typescript
const zoomedIn = view.zoomBy(1); // Zoom in one level
const zoomedOut = view.zoomBy(-0.5); // Zoom out half a level
```

### Zoom Toward Point
```typescript
// Zoom 2x toward mouse position in world coordinates
const [worldX, worldY] = screenToWorld(mouseX, mouseY, view);
const zoomed = zoomToward(view, 2.0, worldX, worldY);
```

### Rotation
```typescript
const rotated = view.rotateBy(Math.PI / 4); // Rotate 45° counter-clockwise
```

### Resize
```typescript
const resized = view.resize(1024, 768); // New viewport size
```

## Deterministic and Testable

The system is designed to be **fully deterministic**:

1. **No hidden state**: All parameters are explicit
2. **No side effects**: All methods return new instances
3. **Pure functions**: Same inputs always produce same outputs
4. **Floating-point tolerance**: `equals()` method handles precision issues

### Testing Strategy

```typescript
// Test 1: Matrix computation is deterministic
const view1 = new ViewState([0, 0], 10, 0, [800, 600]);
const view2 = new ViewState([0, 0], 10, 0, [800, 600]);
const matrix1 = view1.getClipMatrix();
const matrix2 = view2.getClipMatrix();
assert(matrixEquals(matrix1, matrix2));

// Test 2: Pan operations compose correctly
const panned = view.pan(100, 0).pan(0, 50);
const direct = view.pan(100, 50);
assert(panned.equals(direct));

// Test 3: Zoom affects resolution correctly
const view1 = new ViewState([0, 0], 10, 0, [800, 600]);
const view2 = new ViewState([0, 0], 11, 0, [800, 600]);
assert(view2.getResolution() === view1.getResolution() / 2);
```

## Integration with WebGPU Shaders

### Vertex Shader Example
```wgsl
struct Uniforms {
  clipMatrix: mat4x4<f32>,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec2<f32>,  // World coordinates
};

struct VertexOutput {
  @builtin(position) clipPos: vec4<f32>,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.clipPos = uniforms.clipMatrix * vec4<f32>(input.position, 0.0, 1.0);
  return output;
}
```

### Fragment Shader Example
```wgsl
@fragment
fn fsMain(@builtin(position) clipPos: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red
}
```

## Performance Considerations

1. **Matrix computation is O(1)**: Fixed cost, independent of dataset size
2. **Immutable by design**: Enables caching and comparison
3. **No GC pressure**: Float32Array is reusable
4. **Batch-friendly**: Same matrix for all vertices in a frame

## Migration from OpenLayers

If you're migrating from OpenLayers `frameState`:

```typescript
// Old (OpenLayers-dependent)
const matrix = frameState.coordinateToPixelTransform;

// New (Standalone)
const view = new ViewState(
  frameState.viewState.center,
  frameState.viewState.zoom,
  frameState.viewState.rotation,
  [frameState.size[0], frameState.size[1]]
);
const matrix = view.getClipMatrix();
```

## Common Pitfalls

1. **Y-axis direction**: Remember WebGPU clip space has Y=-1 at bottom, Y=+1 at top
2. **Rotation direction**: We counter-rotate the world, not rotate the view
3. **Resolution vs zoom**: Resolution is what matters for math; zoom is for UX
4. **Viewport size**: Always update on resize, or coordinates will be distorted
5. **Floating point**: Use `equals()` with epsilon for comparisons

## Future Extensions

Potential enhancements:
1. **Tilt/pitch**: Add 3D perspective transformation
2. **Animation**: Interpolate between ViewStates
3. **Constraints**: Clamp zoom/pan to valid ranges
4. **Projections**: Support coordinate reference systems beyond Web Mercator
5. **Occlusion**: Add depth buffer handling for 3D features

## Conclusion

The ViewState system provides a clean, mathematical foundation for map rendering that:
- Removes OpenLayers dependency
- Maintains web mapping standards
- Is fully deterministic and testable
- Integrates seamlessly with WebGPU
- Supports pan, zoom, and rotation
- Has clear, documented math

The matrix computation is efficient, correct, and follows established graphics programming conventions.
