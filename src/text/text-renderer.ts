import type { IGlyphAtlas, TextViewState } from "./text-types.js";
import {
  TEXT_FRAME_UNIFORM_BYTE_LENGTH,
  TEXT_INSTANCE_FLOAT_STRIDE,
} from "./text-types.js";
import { TEXT_WGSL } from "./shaders/text-wgsl.js";

export interface TextRendererOptions {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly atlas: IGlyphAtlas;
}

function packRgba8U32(c: readonly [number, number, number, number]): number {
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  const a = Math.round(Math.max(0, Math.min(1, c[3])) * 255);
  return (r << 24) | (g << 16) | (b << 8) | a;
}

const INSTANCE_BYTE_STRIDE = TEXT_INSTANCE_FLOAT_STRIDE * 4;

/**
 * GPU-only glyph draw: pipeline, uniforms, unit quad, instance buffer, atlas bind group.
 * Atlas is **owned by the host** (`TextLayer`); call `rebindAtlas` when swapping implementations (e.g. DPR rebuild).
 */
export class TextRenderer {
  private readonly device: GPUDevice;
  private atlas: IGlyphAtlas;
  private atlasSampler: GPUSampler;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly quadVertexBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer | null = null;
  private instanceCapacityGlyphs = 0;
  private instanceCount = 0;
  private readonly frameUniformBuffer: GPUBuffer;
  private readonly frameStaging = new ArrayBuffer(TEXT_FRAME_UNIFORM_BYTE_LENGTH);
  private readonly frameF32 = new Float32Array(this.frameStaging, 0, 16);
  private readonly frameViewport = new Float32Array(this.frameStaging, 64, 2);
  private readonly frameTail = new DataView(this.frameStaging, 72, 24);
  private bindGroup: GPUBindGroup;

  private constructor(
    device: GPUDevice,
    atlas: IGlyphAtlas,
    atlasSampler: GPUSampler,
    bindGroupLayout: GPUBindGroupLayout,
    pipeline: GPURenderPipeline,
    quadVertexBuffer: GPUBuffer,
    frameUniformBuffer: GPUBuffer,
    bindGroup: GPUBindGroup,
  ) {
    this.device = device;
    this.atlas = atlas;
    this.atlasSampler = atlasSampler;
    this.bindGroupLayout = bindGroupLayout;
    this.pipeline = pipeline;
    this.quadVertexBuffer = quadVertexBuffer;
    this.frameUniformBuffer = frameUniformBuffer;
    this.bindGroup = bindGroup;
  }

  static create(options: TextRendererOptions): TextRenderer {
    const { device, format, atlas } = options;
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const module = device.createShaderModule({ code: TEXT_WGSL });
    const pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
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
            arrayStride: INSTANCE_BYTE_STRIDE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, offset: 0, format: "float32x2" },
              { shaderLocation: 2, offset: 8, format: "float32x2" },
              { shaderLocation: 3, offset: 16, format: "float32x4" },
              { shaderLocation: 4, offset: 32, format: "float32x2" },
              { shaderLocation: 5, offset: 40, format: "float32x2" },
              { shaderLocation: 6, offset: 48, format: "float32x4" },
              { shaderLocation: 7, offset: 64, format: "float32" },
              { shaderLocation: 8, offset: 68, format: "float32" },
            ],
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
      primitive: { topology: "triangle-list" },
    });

    const frameUniformBuffer = device.createBuffer({
      size: TEXT_FRAME_UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const quadCorners = new Float32Array([
      -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1,
    ]);
    const quadVertexBuffer = device.createBuffer({
      size: quadCorners.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(quadVertexBuffer, 0, quadCorners);

    const modes = atlas.atlasSampleModes();
    const atlasSampler = device.createSampler({
      magFilter: modes.magFilter,
      minFilter: modes.minFilter,
      mipmapFilter: "nearest",
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuffer } },
        { binding: 1, resource: atlas.getTextureView() },
        { binding: 2, resource: atlasSampler },
      ],
    });

    return new TextRenderer(
      device,
      atlas,
      atlasSampler,
      bindGroupLayout,
      pipeline,
      quadVertexBuffer,
      frameUniformBuffer,
      bindGroup,
    );
  }

  /** Swap atlas (e.g. new bitmap after DPR change); recreates sampler + bind group. */
  rebindAtlas(atlas: IGlyphAtlas): void {
    this.atlas = atlas;
    const modes = atlas.atlasSampleModes();
    this.atlasSampler = this.device.createSampler({
      magFilter: modes.magFilter,
      minFilter: modes.minFilter,
      mipmapFilter: "nearest",
    });
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUniformBuffer } },
        { binding: 1, resource: atlas.getTextureView() },
        { binding: 2, resource: this.atlasSampler },
      ],
    });
  }

  getAtlas(): IGlyphAtlas {
    return this.atlas;
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  /**
   * Upload glyph instances (interleaved `TEXT_INSTANCE_FLOAT_STRIDE` floats per glyph).
   */
  setGlyphInstances(instanceData: Float32Array, glyphCount: number): void {
    this.instanceCount = glyphCount;
    if (glyphCount <= 0) {
      return;
    }
    const needBytes = glyphCount * INSTANCE_BYTE_STRIDE;
    if (this.instanceBuffer === null || needBytes > this.instanceCapacityGlyphs * INSTANCE_BYTE_STRIDE) {
      this.instanceBuffer?.destroy();
      const cap = Math.max(glyphCount, Math.ceil(glyphCount * 1.25), 1024);
      this.instanceCapacityGlyphs = cap;
      this.instanceBuffer = this.device.createBuffer({
        size: cap * INSTANCE_BYTE_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      instanceData,
      0,
      glyphCount * TEXT_INSTANCE_FLOAT_STRIDE,
    );
  }

  render(pass: GPURenderPassEncoder, viewState: TextViewState): void {
    this.frameF32.set(viewState.mapToClipColumnMajor);
    this.frameViewport[0] = Math.max(viewState.viewportWidthPx, 1);
    this.frameViewport[1] = Math.max(viewState.viewportHeightPx, 1);

    const atlasMode = this.atlas.family === "msdf" ? 1 : 0;
    const pxRange =
      viewState.msdfPixelRange ?? this.atlas.sdfPixelRange ?? (atlasMode === 1 ? 4 : 1);
    const oc = viewState.globalOutlineColor ?? [0, 0, 0, 0];
    const ow = viewState.globalOutlineWidthPx ?? 0;

    this.frameTail.setUint32(0, atlasMode, true);
    this.frameTail.setFloat32(4, pxRange, true);
    this.frameTail.setUint32(8, packRgba8U32(oc as [number, number, number, number]), true);
    this.frameTail.setFloat32(12, ow, true);
    this.frameTail.setUint32(16, 0, true);
    this.frameTail.setUint32(20, 0, true);

    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, this.frameStaging);

    if (this.instanceCount <= 0 || this.instanceBuffer === null) {
      return;
    }

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.quadVertexBuffer, 0, 6 * 8);
    pass.setVertexBuffer(1, this.instanceBuffer, 0, this.instanceCount * INSTANCE_BYTE_STRIDE);
    pass.draw(6, this.instanceCount, 0, 0);
  }

  destroy(): void {
    this.quadVertexBuffer.destroy();
    this.instanceBuffer?.destroy();
    this.frameUniformBuffer.destroy();
  }
}
