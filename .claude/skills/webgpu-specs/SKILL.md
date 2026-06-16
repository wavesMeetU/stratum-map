# WebGPU Specifications - Reference

## Official Specifications

### Primary Documents

- **WebGPU API**: https://www.w3.org/TR/webgpu/
  - Core API surface
  - Device, queue, buffer interfaces
  - Rendering and compute passes

- **WGSL**: https://www.w3.org/TR/WGSL/
  - Shader language specification
  - Type system
  - Built-in functions
  - Standard library

### Living Standards

- **Editor's Draft**: https://gpuweb.github.io/Win32GPU/
  - Latest changes (pre-publication)
  - Working group discussions
  - Draft proposals

## API Reference

### Core Interfaces

#### GPUAdapter

```typescript
interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  features: GPUSupportedFeatures;
  limits: GPUSupportedLimits;
}
```

**Key limits to check**:
- `maxBufferSize`: Maximum buffer size (typically 512MB-1GB)
- `maxVertexBuffers`: Maximum vertex buffer bindings
- `maxBindGroups`: Maximum bind group count

#### GPUDevice

```typescript
interface GPUDevice {
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  queue: GPUQueue;
}
```

#### GPUBuffer

```typescript
interface GPUBuffer {
  destroy(): void;
  mapAsync(mode: GPUMapModeFlags, offset?: number, size?: number): Promise<undefined>;
  unmap(): void;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
}
```

**Usage flags**:
- `VERTEX`: Vertex attribute data
- `INDEX`: Index data
- `UNIFORM`: Uniform data
- `STORAGE`: Storage buffer
- `COPY_SRC`: Copy source
- `COPY_DST`: Copy destination
- `MAP_READ`: Mappable for reading
- `MAP_WRITE`: Mappable for writing

## WGSL Specification

### Type System

#### Scalar Types

```wgsl
bool                    // Boolean
i32, u32               // 32-bit signed/unsigned integers
f32, f16, f64          // 32/16/64-bit floating point
```

#### Vector Types

```wgsl
vec2<T>, vec3<T>, vec4<T>    // Vectors of 2/3/4 elements
// T can be: bool, i32, u32, f32, f32
```

#### Matrix Types

```wgsl
mat2x2<T>, mat2x3<T>, mat2x4<T>
mat3x2<T>, mat3x3<T>, mat3x4<T>
mat4x2<T>, mat4x3<T>, mat4x4<T>
// Typically T is f32
```

### Storage Classes

```wgsl
// Function scope
var<function> x: T;        // Default

// Private scope (shader-private)
var<private> x: T;

// Storage buffer
var<storage, read> x: T;
var<storage, read_write> x: T;

// Uniform buffer
var<uniform> x: T;

// Texture
var<storage_texture> x: texture_storage_2d<T>;

// Sampler
var s: sampler;
```

### Built-in Functions

#### Math Functions

```wgsl
// Trigonometry
let a = acos(x);
let a = asin(x);
let a = atan(x);
let a = atan2(y, x);
let c = cos(x);
let s = sin(x);
let t = tan(x);

// Exponential
let e = exp(x);
let l = log(x);
let p = pow(x, y);
let r = sqrt(x);

// Common
let a = abs(x);
let m = max(x, y);
let n = min(x, y);
let c = clamp(x, min_val, max_val);
let l = mix(x, y, t);  // Linear interpolation

// Geometry
let d = distance(p1, p2);
let l = length(v);
let n = normalize(v);
let d = dot(x, y);
let c = cross(x, y);
let r = reflect(I, N);
```

#### Data Packing

```wgsl
// Pack 4x uint8 into uint32
let packed = pack4xU8unorm(a);
// Unpack
let unpacked = unpack4xU8unorm(packed);

// Pack into floats
let packed = pack4xI8(a);
let unpacked = unpack4xI8(a);
```

### Attribute Decorators

```wgsl
// Vertex shader
@builtin(vertex_index)      // Built-in vertex ID
@builtin(instance_index)    // Built-in instance ID
@location(N)                // Vertex attribute location

// Fragment shader
@builtin(front_facing)      // Front-facing test
@builtin(sample_index)      // MSAA sample index
@location(N)                // Output color location
```

### Entry Point Attributes

```wgsl
@vertex
fn vs_main(...) -> VertexOutput { }

@fragment
fn fs_main(...) -> FragmentOutput { }

@compute
@workgroup_size(x, y, z)
fn compute_main(...) { }
```

## Buffer Layout

### Alignment Requirements

- **Scalars**: Naturally aligned (4 bytes for most)
- **Vec2**: 8-byte alignment
- **Vec3**: 16-byte alignment (padded)
- **Vec4**: 16-byte alignment
- **Mat4**: 16-byte alignment per column

### Std140 Layout

```wgsl
struct UniformData {
  transform: mat4x4<f32>,    // 0-63 (16 bytes per column)
  time: f32,                  // 64
  lod_stride: u32,            // 68
  padding: vec2<f32>          // 72-79 (alignment padding)
}
// Total: 80 bytes (multiple of 16)
```

## Resource Bindings

### Binding Model

```typescript
// Bind group layout
const bindGroupLayout = device.createBindGroupLayout({
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX,
    buffer: { type: 'uniform' }
  }]
});

// Bind group
const bindGroup = device.createBindGroup({
  layout: bindGroupLayout,
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer }
  }]
});

// Pipeline layout
const pipelineLayout = device.createPipelineLayout({
  bindGroupLayouts: [bindGroupLayout]
});
```

### Binding Types

- **uniform**: Uniform buffer (read-only)
- **storage**: Storage buffer (read/write)
- **read-only-storage**: Read-only storage buffer
- **sampler**: Texture sampler
- **texture**: Sampled texture
- **storage-texture**: Storage texture

## Limits and Requirements

### Minimum Required Limits

Per WebGPU spec, all implementations must support:

- `maxTextureDimension2D`: 8192
- `maxTextureArrayLayers`: 256
- `maxBindGroups`: 4
- `maxDynamicUniformBuffersPerPipelineLayout`: 8
- `maxDynamicStorageBuffersPerPipelineLayout`: 4
- `maxSampledTexturesPerShaderStage`: 16
- `maxSamplersPerShaderStage`: 16
- `maxStorageBuffersPerShaderStage`: 8
- `maxStorageTexturesPerShaderStage`: 4
- `maxUniformBuffersPerShaderStage`: 12

### Adapter-Specific Limits

```typescript
const adapter = await navigator.gpu.requestAdapter();
console.log(adapter.limits);
```

Check before using:
- `maxBufferSize`: For large vertex buffers
- `maxVertexAttributes`: For complex vertex formats
- `maxVertexBufferArrayStride`: For interleaved layouts

## Validation Rules

### Shader Validation

1. **Type matching**: Vertex output must match fragment input
2. **Location uniqueness**: No duplicate @location values
3. **Binding uniqueness**: No duplicate @binding values in group
4. **Struct alignment**: Members must satisfy alignment requirements

### Pipeline Validation

1. **Format compatibility**: Target format must match canvas
2. **Primitive topology**: Must match draw call type
3. **Buffer strides**: Must match shader expectations
4. **Bind group compatibility**: Layout must match pipeline

## Stratum Map Compliance

### Current Specifications

- **WGSL Version**: Compatible with WebGPU 1.0
- **Pipeline Layout**: Single bind group @group(0)
- **Vertex Format**: Interleaved positions + feature IDs
- **Uniform Buffer**: 64-byte aligned (mat4x4 + padding)

### Spec Deviations

None currently. Implementation follows WebGPU 1.0 spec.

### Testing Against Spec

- Validation: Browser dev tools + error scopes
- Correctness: Visual regression tests
- Performance: Global Cell Towers benchmark (5.1M points)

---

**For implementation guidance**, see: `.claude/skills/webgpu/SKILL.md`
