import type { GeometryBufferView } from "../core/geometry-buffer.js";
import type { RenderFrame } from "./renderer.js";
import type { PointStyle } from "./point-style.js";
import { DEFAULT_POINT_STYLE, MAX_POINT_STYLES } from "./point-style.js";

const POINTS_WGSL = /* wgsl */ `
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  style_meta: vec4<u32>,
}

struct GpuStyle {
  color: vec4<f32>,
  size_px: f32,
  _pad: vec3<f32>,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> style_table: array<GpuStyle>;

struct VsOut {
  @builtin(position) clip_pos: vec4<f32>,
  @builtin(point_size) point_size: f32,
  @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(
  @location(0) pos: vec2<f32>,
  @location(1) style_id: u32,
) -> VsOut {
  let n_styles = frame.style_meta.x;
  let sid = select(0u, min(style_id, n_styles - 1u), n_styles > 0u);
  let st = style_table[sid];

  var o: VsOut;
  o.clip_pos = frame.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  o.point_size = max(st.size_px, 1.0);
  o.color = st.color;
  return o;
}

@fragment
fn fs_main(
  @builtin(point_coord) coord: vec2<f32>,
  @location(0) color: vec4<f32>,
) -> @location(0) vec4<f32> {
  let d = length(coord - vec2<f32>(0.5, 0.5)) * 2.0;
  if (d > 1.0) {
    discard;
  }
  let edge = fwidth(d);
  let a = 1.0 - smoothstep(1.0 - edge * 2.0, 1.0, d);
  return vec4<f32>(color.rgb, color.a * a);
}
`;

const FRAME_UNIFORM_BYTE_LENGTH = 80;

export interface WebGpuPointsRendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Premultiplied alpha works better with HTML canvas compositing. */
  readonly alphaMode?: GPUCanvasAlphaMode;
  /** Device for sharing; if omitted, one is requested. */
  readonly device?: GPUDevice;
  /** Initial style table (defaults to one blue style). */
  readonly styles?: readonly PointStyle[];
}

/**
 * WebGPU point renderer: `point-list`, circular sprites, small style table.
 * Pass a **column-major** 4×4 map→clip matrix each frame (typical OpenLayers WebGL-style frame).
 */
export class WebGpuPointsRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly frameUniformBuffer: GPUBuffer;
  private readonly styleStorageBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly frameUniformStaging = new ArrayBuffer(FRAME_UNIFORM_BYTE_LENGTH);
  private readonly frameF32 = new Float32Array(this.frameUniformStaging, 0, 16);
  private readonly frameU32 = new Uint32Array(this.frameUniformStaging, 64, 4);

  private positionBuffer: GPUBuffer | null = null;
  private styleIdBuffer: GPUBuffer | null = null;
  private capacityVertices = 0;
  private vertexCount = 0;

  private mapToClip = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  private styles: PointStyle[] = [];

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    pipeline: GPURenderPipeline,
    frameUniformBuffer: GPUBuffer,
    styleStorageBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
    initialStyles: readonly PointStyle[],
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.format = format;
    this.pipeline = pipeline;
    this.frameUniformBuffer = frameUniformBuffer;
    this.styleStorageBuffer = styleStorageBuffer;
    this.bindGroup = bindGroup;
    this.setStyleTable(initialStyles.length > 0 ? initialStyles : [DEFAULT_POINT_STYLE]);
  }

  static async create(options: WebGpuPointsRendererOptions): Promise<WebGpuPointsRenderer> {
    const { canvas, alphaMode = "premultiplied" } = options;
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("WebGPU not available (no GPUCanvasContext)");
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      throw new Error("WebGPU adapter not available");
    }

    const device =
      options.device ??
      (await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {},
      }));

    const format = navigator.gpu.getPreferredCanvasFormat();
    const pipeline = WebGpuPointsRenderer.createPipeline(device, format);

    const frameUniformBuffer = device.createBuffer({
      size: FRAME_UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const styleStorageBuffer = device.createBuffer({
      size: MAX_POINT_STYLES * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuffer } },
        { binding: 1, resource: { buffer: styleStorageBuffer } },
      ],
    });

    const renderer = new WebGpuPointsRenderer(
      canvas,
      context,
      device,
      format,
      pipeline,
      frameUniformBuffer,
      styleStorageBuffer,
      bindGroup,
      options.styles ?? [DEFAULT_POINT_STYLE],
    );

    renderer.configureContext(alphaMode);
    return renderer;
  }

  private static createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: POINTS_WGSL });
    return device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            arrayStride: 2,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 1, offset: 0, format: "uint16" }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "point-list",
      },
    });
  }

  private configureContext(alphaMode: GPUCanvasAlphaMode): void {
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  /**
   * Column-major 4×4: transforms `[mapX, mapY, 0, 1]` into clip space `[-1, 1]`.
   * Build from OpenLayers frame state (same convention as OL WebGL custom layers).
   */
  setMapToClipMatrix(columnMajor4x4: Float32Array): void {
    if (columnMajor4x4.length !== 16) {
      throw new Error("Expected 16 floats (column-major 4x4)");
    }
    this.mapToClip.set(columnMajor4x4);
  }

  setStyleTable(styles: readonly PointStyle[]): void {
    if (styles.length === 0) {
      throw new Error("At least one style is required");
    }
    if (styles.length > MAX_POINT_STYLES) {
      throw new Error(`At most ${MAX_POINT_STYLES} styles`);
    }
    this.styles = styles.map((s) => ({ ...s, color: [...s.color] as [number, number, number, number] }));

    const f32 = new Float32Array(MAX_POINT_STYLES * 8);
    for (let i = 0; i < this.styles.length; i++) {
      const s = this.styles[i];
      const o = i * 8;
      f32[o + 0] = s.color[0];
      f32[o + 1] = s.color[1];
      f32[o + 2] = s.color[2];
      f32[o + 3] = s.color[3];
      f32[o + 4] = s.sizePx;
    }
    this.device.queue.writeBuffer(this.styleStorageBuffer, 0, f32.buffer, 0, this.styles.length * 32);
  }

  /** @inheritdoc */
  setGeometry(view: GeometryBufferView): void {
    const { buffer, vertexCount } = view;
    if (vertexCount < 0) {
      throw new Error("vertexCount must be non-negative");
    }
    if (vertexCount === 0) {
      this.vertexCount = 0;
      return;
    }

    const posNeeded = vertexCount * 2;
    if (buffer.positions.length < posNeeded) {
      throw new Error("positions Float32Array shorter than vertexCount * 2");
    }
    if (buffer.featureIds.length < vertexCount) {
      throw new Error("featureIds shorter than vertexCount");
    }
    if (buffer.styleIds.length < vertexCount) {
      throw new Error("styleIds shorter than vertexCount");
    }

    this.ensureVertexCapacity(vertexCount);
    this.vertexCount = vertexCount;

    this.device.queue.writeBuffer(
      this.positionBuffer!,
      0,
      buffer.positions.buffer,
      buffer.positions.byteOffset,
      vertexCount * 8,
    );
    this.device.queue.writeBuffer(
      this.styleIdBuffer!,
      0,
      buffer.styleIds.buffer,
      buffer.styleIds.byteOffset,
      vertexCount * 2,
    );
  }

  private ensureVertexCapacity(n: number): void {
    if (n <= this.capacityVertices && this.positionBuffer && this.styleIdBuffer) {
      return;
    }
    this.positionBuffer?.destroy();
    this.styleIdBuffer?.destroy();

    const posSize = Math.max(n, 1024) * 8;
    const idSize = Math.max(n, 1024) * 2;

    this.positionBuffer = this.device.createBuffer({
      size: posSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.styleIdBuffer = this.device.createBuffer({
      size: idSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.capacityVertices = Math.max(n, 1024);
  }

  /** Call when canvas backing store size should change (DPR / resize). */
  resizeBackingStore(widthPx: number, heightPx: number): void {
    this.canvas.width = Math.max(1, Math.floor(widthPx));
    this.canvas.height = Math.max(1, Math.floor(heightPx));
    this.configureContext(this.context.configuration?.alphaMode ?? "premultiplied");
  }

  /** Convenience: `clientWidth/clientHeight * devicePixelRatio`. */
  resizeToDisplaySize(dpr = globalThis.devicePixelRatio ?? 1): void {
    const w = this.canvas.clientWidth * dpr;
    const h = this.canvas.clientHeight * dpr;
    this.resizeBackingStore(w, h);
  }

  render(frame: RenderFrame): void {
    this.frameF32.set(this.mapToClip);
    this.frameU32[0] = this.styles.length;
    this.frameU32[1] = 0;
    this.frameU32[2] = 0;
    this.frameU32[3] = 0;
    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.frameUniformStaging);

    const textureView = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    if (this.vertexCount > 0 && this.positionBuffer && this.styleIdBuffer) {
      pass.setVertexBuffer(0, this.positionBuffer, 0, this.vertexCount * 8);
      pass.setVertexBuffer(1, this.styleIdBuffer, 0, this.vertexCount * 2);
      pass.draw(this.vertexCount, 1, 0, 0);
    }
    pass.end();

    this.device.queue.submit([encoder.finish()]);

    void frame.timeMs;
  }

  release(): void {
    this.positionBuffer?.destroy();
    this.styleIdBuffer?.destroy();
    this.frameUniformBuffer.destroy();
    this.styleStorageBuffer.destroy();
    this.pipeline.destroy();
    this.context.unconfigure();
  }
}

export async function createWebGpuPointsRenderer(
  options: WebGpuPointsRendererOptions,
): Promise<WebGpuPointsRenderer> {
  return WebGpuPointsRenderer.create(options);
}
