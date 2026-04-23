export const POINTS_WGSL = /* wgsl */ `
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

export const FRAME_UNIFORM_BYTE_LENGTH = 80;
