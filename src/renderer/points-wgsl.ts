export const POINTS_WGSL = /* wgsl */ `
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
  _pad_vp: vec2<f32>,
  style_meta: vec4<u32>,
  lod_stride: f32,
  _pad_lod: vec3<f32>,
}

/**
 * No trailing pad field: a trailing \`vec3<f32>\` has 16-byte ALIGNMENT (not just 12-byte
 * size) per the WGSL memory layout rules, which pushes it out to offset 32 and inflates
 * this struct to 48 bytes — silently mismatching the JS-side upload code's 32-byte stride
 * (\`webgpu-points-renderer.ts\`'s \`setStyleTable\`), corrupting every style entry beyond
 * index 0 (\`style_table[1]\` would read starting at byte 48, landing on style 0's padding
 * and style 1's own tail instead of style 1's actual color/size). Left bare, \`{color:
 * vec4<f32>, size_px: f32}\` already rounds up to exactly 32 bytes on its own (struct size
 * rounds up to its own 16-byte alignment), which is what the JS side assumes. Mirrors the
 * fix already applied to the analogous \`GpuLineStyle\` in \`lines-wgsl.ts\`.
 */
struct GpuStyle {
  color: vec4<f32>,
  size_px: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> style_table: array<GpuStyle>;

struct VsOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) size_px: f32,
}

@vertex
fn vs_main(
  @location(0) corner: vec2<f32>,
  @location(1) pos: vec2<f32>,
  @location(2) style_id: u32,
  @location(3) instance_index: u32,
) -> VsOut {
  // LOD: Skip instances based on stride
  let stride = u32(frame.lod_stride);
  if (stride > 1u && (instance_index % stride != 0u)) {
    // Move point outside clip space to cull it
    var o: VsOut;
    o.clip_pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    o.color = vec4<f32>(0.0);
    o.uv = vec2<f32>(0.0);
    o.size_px = 0.0;
    return o;
  }

  let n_styles = frame.style_meta.x;
  let sid = select(0u, min(style_id, n_styles - 1u), n_styles > 0u);
  let st = style_table[sid];

  let center = frame.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  let ndc = center.xy / center.w;
  let half_px = max(st.size_px * 0.5, 0.5);
  let vx = max(frame.viewport_px.x, 1.0);
  let vy = max(frame.viewport_px.y, 1.0);
  let ext_x = half_px * (2.0 / vx);
  let ext_y = half_px * (2.0 / vy);
  let ndc_out = ndc + vec2<f32>(corner.x * ext_x, -corner.y * ext_y);

  var o: VsOut;
  o.clip_pos = vec4<f32>(ndc_out * center.w, center.zw);
  o.color = st.color;
  o.uv = corner * 0.5 + vec2<f32>(0.5, 0.5);
  o.size_px = st.size_px;
  return o;
}

@fragment
fn fs_main(
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) size_px: f32,
) -> @location(0) vec4<f32> {
  let center = vec2<f32>(0.5, 0.5);
  let d = length(uv - center) * 2.0;

  // Soft circular falloff with glow
  // Core: bright center, smooth edge
  let core_radius = 0.6;
  let glow_radius = 1.0;

  if (d > glow_radius) {
    discard;
  }

  // Anti-aliased core
  let aa = clamp(fwidth(d), 0.02, 0.15);
  let core_alpha = 1.0 - smoothstep(core_radius - aa, core_radius, d);

  // Outer glow falloff
  let glow_falloff = smoothstep(glow_radius, core_radius, d);
  let glow_alpha = glow_falloff * glow_falloff;

  // Combine core and glow
  let combined_alpha = max(core_alpha, glow_alpha * 0.4);

  // Boost brightness in center for "hot" appearance
  let center_boost = 1.0 - smoothstep(0.0, 0.3, d);
  let brightness = 1.0 + center_boost * 0.3;

  return vec4<f32>(
    color.rgb * brightness,
    color.a * combined_alpha
  );
}
`;

export const FRAME_UNIFORM_BYTE_LENGTH = 128;
