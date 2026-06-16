# WebGPU Skills - Reference Guidance

## Core Resources

### Official Documentation
- **WebGPU Specification**: https://www.w3.org/TR/webgpu/
- **WebGPU API**: https://developer.chrome.com/docs/web-platform/webgpu/
- **WGSL Specification**: https://www.w3.org/TR/WGSL/

### Implementation References
- **wgpu (Rust)**: https://github.com/gfx-rs/wgpu
- **dawn (Chromium)**: https://dawn.googlesource.com/dawn/
- **naga (WGSL)**: https://github.com/gfx-rs/naga

### Learning Resources
- **WebGPU Fundamentals**: https://webgpu.github.io/webgpu-samples/
- **WebGPU on MDN**: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

## Buffer Lifecycle

### Creation Pattern

```typescript
// Correct: Error handling with fallback
const device = await adapter.requestDevice({
  requiredFeatures: [],
  requiredLimits: {
    maxBufferSize: 512 * 1024 * 1024 // 512MB
  }
});

// Buffer creation
const buffer = device.createBuffer({
  size: byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  mappedAtCreation: false
});
```

### Memory Management

**Rules**:
1. Always destroy unused buffers
2. Use buffer pooling for frequent allocations
3. Respect `maxBufferSize` limit
4. Map buffers only when necessary

```typescript
// Cleanup
buffer.destroy();

// Pooling pattern
class BufferPool {
  private pool: GPUBuffer[] = [];
  acquire(size: number): GPUBuffer { /* ... */ }
  release(buffer: GPUBuffer): void { /* ... */ }
}
```

### Data Upload

```typescript
// Staging pattern for large uploads
const stagingBuffer = device.createBuffer({
  size: data.byteLength,
  usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
  mappedAtCreation: true
});

new Uint8Array(stagingBuffer.getMappedRange()).set(data);
stagingBuffer.unmap();

// Copy to device buffer
const encoder = device.createCommandEncoder();
encoder.copyBufferToBuffer(
  stagingBuffer, 0,
  vertexBuffer, 0,
  data.byteLength
);

device.queue.submit([encoder.finish()]);
stagingBuffer.destroy();
```

## WGSL Reference

### Vertex Shader Structure

```wgsl
struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) feature_id: u32,
}

struct Uniforms {
  transform: mat4x4<f32>,
  time: f32,
  lod_stride: u32,
}

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Apply LOD stride culling
  let stride = uniforms.lod_stride;
  let vertex_index = input.feature_id;
  let should_render = (vertex_index & (stride - 1u)) == 0u;

  if (!should_render) {
    // Cull this vertex
    output.clip_position = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return output;
  }

  // Transform to clip space
  output.clip_position = uniforms.transform * vec4<f32>(input.position, 0.0, 1.0);

  return output;
}
```

### Fragment Shader Structure

```wgsl
struct FragmentOutput {
  @location(0) color: vec4<f32>,
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> FragmentOutput {
  var output: FragmentOutput;
  output.color = color;
  return output;
}
```

### Built-in Functions

```wgsl
// Common operations
let x = abs(v);
let d = distance(a, b);
let l = length(v);
let n = normalize(v);

// Math operations
let s = sqrt(x);
let p = pow(x, y);
let m = mix(a, b, t); // Linear interpolation

// Vector operations
let dot = dot(a, b);
let cross = cross(a, b);
let reflect = reflect(I, N);
```

## Synchronization

### Command Encoding

```typescript
// Single submission pattern
const encoder = device.createCommandEncoder();

// All commands in one encoder
encoder.setPipeline(pipeline);
encoder.setVertexBuffer(0, vertexBuffer);
encoder.setIndexBuffer(indexBuffer, 'uint16');
encoder.drawIndexed(vertexCount);

device.queue.submit([encoder.finish()]);
```

### Fence-based Synchronization

```typescript
// For advanced use cases
const fence = device.createFence();

// Wait for completion
await device.queue.onSubmittedWorkDone();

// Or use fence
device.queue.submit([encoder.finish()]);
device.queue.signal(fence, 1);
await device.wait_for([
  { fence, value: 1, flags: GPU.FenceFlags.SYNC }
]);
```

## Rendering Architecture

### Pipeline Creation

```typescript
// Vertex state
const vertexState = {
  shaderModule: device.createShaderModule({ code: wgslCode }),
  buffers: [{
    arrayStride: 8, // 2x float32
    stepMode: 'vertex',
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x2' },
      { shaderLocation: 1, offset: 8, format: 'uint32' }
    ]
  }]
};

// Fragment state
const fragmentState = {
  shaderModule: device.createShaderModule({ code: wgslCode }),
  targets: [{
    format: 'bgra8unorm-srgb',
    blend: {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one',
        operation: 'add'
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one',
        operation: 'add'
      }
    }
  }]
};

// Pipeline
const pipeline = device.createRenderPipeline({
  vertex: vertexState,
  fragment: fragmentState,
  primitive: { topology: 'point-list' },
  layout: 'auto'
});
```

### Uniform Buffer Pattern

```typescript
// Create uniform buffer
const uniformBuffer = device.createBuffer({
  size: 64, // mat4x4 (16 floats) + padding
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

// Update uniforms
const encoder = device.createCommandEncoder();
encoder.writeBuffer(uniformBuffer, 0, transformMatrix);
device.queue.submit([encoder.finish()]);

// Bind group
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer }
  }]
});
```

## GPU Debugging

### Validation

```typescript
// Enable validation layer (browser-dependent)
// Chrome: chrome://flags/#enable-webgpu-developer-features

// Common validation checks
device.pushErrorScope('validation');
// ... code ...
const error = await device.popErrorScope();
if (error) {
  console.error('WebGPU validation error:', error.message);
}
```

### Common Issues

**Problem**: Nothing renders
**Check**:
1. Pipeline format matches canvas format
2. Viewport is set correctly
3. Buffers are not destroyed
4. Draw calls have valid vertex count

**Problem**: Corrupted geometry
**Check**:
1. Buffer stride matches shader layout
2. Attribute offsets are correct
3. Data types match (f32 vs u32)
4. Byte alignment (4-byte boundary)

**Problem**: Performance issues
**Check**:
1. Too many draw calls (batch them)
2. Buffer thrashing (pool them)
3. Expensive operations in shader
4. Unnecessary data copies

## Performance Patterns

### Instancing

```wgsl
struct InstanceInput {
  @location(0) offset: vec2<f32>,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32
) -> VertexOutput {
  // Read per-instance data
  let offset = instance_offsets[instance_index];
  // ...
}
```

### Buffer Pooling

```typescript
class BufferPool {
  private buffers: Map<number, GPUBuffer> = new Map();

  acquire(size: number): GPUBuffer {
    const rounded = Math.ceil(size / 1024) * 1024;
    if (!this.buffers.has(rounded)) {
      this.buffers.set(rounded, device.createBuffer({
        size: rounded,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      }));
    }
    return this.buffers.get(rounded)!;
  }
}
```

## Stratum Map Specific

### Current Implementation

- **Renderer**: `src/renderer/webgpu-points-renderer.ts`
- **WGSL**: `src/renderer/points-wgsl.ts`
- **Pipeline**: Single-buffer interleaved layout
- **LOD**: WGSL stride-based culling
- **Picking**: Separate RGBA8 pass

### Key Patterns

1. **Chunked Upload**: Geometry in 64KB chunks
2. **LRU Eviction**: Automatic GPU memory management
3. **Dirty Flag**: Render only on state change
4. **Coordinate System**: Explicit backing-store pixel space for picking

### Related Issues

- LOD-001: WGSL stride culling for 5M+ instances
- PICK-001: Coordinate system validation
- FPS-001: Frame timing measurement

---

**Reference WebGPU implementation in Stratum Map**:
- Primary: `examples/global-cell-towers/main.ts`
- Test: `tests/visual-regression/render-correctness.spec.ts`
