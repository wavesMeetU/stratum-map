export const POINTS_WGSL = /* wgsl */ `
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
  _pad_vp: vec2<f32>,
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
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
}

@vertex
fn vs_main(
  @location(0) corner: vec2<f32>,
  @location(1) pos: vec2<f32>,
  @location(2) style_id: u32,
) -> VsOut {
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
  return o;
}

@fragment
fn fs_main(
  @location(0) color: vec4<f32>,
  @location(1) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let d = length(uv - vec2<f32>(0.5, 0.5)) * 2.0;
  if (d > 1.0) {
    discard;
  }
  // Cap derivative-based AA: on 1–3 px splats, fwidth(d) can be huge and smoothstep erases all alpha.
  let edge = clamp(fwidth(d), 0.02, 0.4);
  let inner = max(1.0 - edge * 2.0, 0.0);
  let a = 1.0 - smoothstep(inner, 1.0, d);
  return vec4<f32>(color.rgb, color.a * a);
}
`;

export const FRAME_UNIFORM_BYTE_LENGTH = 96;
