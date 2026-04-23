/** Offscreen pick pass: encodes `(featureId + 1)` into `rgba8unorm` with no blending. */
export const PICK_POINTS_WGSL = /* wgsl */ `
struct PickUniforms {
  view_proj: mat4x4<f32>,
  params: vec4<f32>,
}

@group(0) @binding(0) var<uniform> pick_u: PickUniforms;

struct VsPickOut {
  @builtin(position) clip: vec4<f32>,
  @builtin(point_size) ps: f32,
  @location(0) fid: u32,
}

@vertex
fn vs_pick(@location(0) pos: vec2<f32>, @location(1) fid: u32) -> VsPickOut {
  var o: VsPickOut;
  o.clip = pick_u.view_proj * vec4<f32>(pos.x, pos.y, 0.0, 1.0);
  o.ps = max(pick_u.params.x, 1.0);
  o.fid = fid;
  return o;
}

@fragment
fn fs_pick(@location(0) fid: u32) -> @location(0) vec4<f32> {
  let packed = fid + 1u;
  let r = f32(packed & 255u) / 255.0;
  let g = f32((packed >> 8u) & 255u) / 255.0;
  let b = f32((packed >> 16u) & 255u) / 255.0;
  let a = f32((packed >> 24u) & 255u) / 255.0;
  return vec4<f32>(r, g, b, a);
}
`;

export const PICK_UNIFORM_BYTE_LENGTH = 80;
