/** WGSL source — mirror of `text.wgsl` for `tsc` bundling. */
export const TEXT_WGSL = /* wgsl */ `
struct FrameUniforms {
  view_proj: mat4x4<f32>,
  viewport_px: vec2<f32>,
  atlas_mode: u32,
  screen_px_range: f32,
  outline_color_pack: u32,
  outline_width_px: f32,
  _pad: vec2<u32>,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlas_sampler: sampler;

struct VsOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) fill_rgba: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) halo_rgba: vec4<f32>,
  @location(3) halo_w_px: f32,
  @location(4) size_px: f32,
}

fn median3(a: f32, b: f32, c: f32) -> f32 {
  return a + b + c - min(a, min(b, c)) - max(a, max(b, c));
}

fn unpack_rgba8(p: u32) -> vec4<f32> {
  let r = f32((p >> 24u) & 255u) / 255.0;
  let g = f32((p >> 16u) & 255u) / 255.0;
  let b = f32((p >> 8u) & 255u) / 255.0;
  let a = f32(p & 255u) / 255.0;
  return vec4<f32>(r, g, b, a);
}

@vertex
fn vs_main(
  @location(0) corner: vec2<f32>,
  @location(1) anchor_map: vec2<f32>,
  @location(2) glyph_px: vec2<f32>,
  @location(3) fill_rgba: vec4<f32>,
  @location(4) uv0: vec2<f32>,
  @location(5) uv1: vec2<f32>,
  @location(6) halo_rgba: vec4<f32>,
  @location(7) size_px: f32,
  @location(8) halo_w_px: f32,
) -> VsOut {
  let center = frame.view_proj * vec4<f32>(anchor_map.x, anchor_map.y, 0.0, 1.0);
  let ndc = center.xy / center.w;
  let vx = max(frame.viewport_px.x, 1.0);
  let vy = max(frame.viewport_px.y, 1.0);
  let half = max(size_px * 0.5, 0.5);
  let ext_x = half * (2.0 / vx);
  let ext_y = half * (2.0 / vy);
  let px_x = glyph_px.x * (2.0 / vx);
  let px_y = glyph_px.y * (2.0 / vy);
  let ndc_out = ndc + vec2<f32>(px_x + corner.x * ext_x, px_y - corner.y * ext_y);

  let u = mix(uv0.x, uv1.x, corner.x * 0.5 + 0.5);
  let v = mix(uv0.y, uv1.y, corner.y * 0.5 + 0.5);

  var o: VsOut;
  o.clip_pos = vec4<f32>(ndc_out * center.w, center.zw);
  o.fill_rgba = fill_rgba;
  o.uv = vec2<f32>(u, v);
  o.halo_rgba = halo_rgba;
  o.halo_w_px = halo_w_px;
  o.size_px = size_px;
  return o;
}

@fragment
fn fs_main(
  @location(0) fill_rgba: vec4<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) halo_rgba: vec4<f32>,
  @location(3) halo_w_px: f32,
  @location(4) size_px: f32,
) -> @location(0) vec4<f32> {
  let t = textureSample(atlas, atlas_sampler, uv);

  if (frame.atlas_mode == 0u) {
    let a = t.a * fill_rgba.a;
    if (a < 0.001) {
      discard;
    }
    return vec4<f32>(fill_rgba.rgb * t.rgb, a);
  }

  let m = median3(t.r, t.g, t.b);
  let sigDist = m - 0.5;
  let pxRange = max(frame.screen_px_range, 0.25);
  let w = max(fwidth(m), 1e-5) * pxRange;
  let fillA = clamp(sigDist / w + 0.5, 0.0, 1.0) * fill_rgba.a;

  let gOutline = unpack_rgba8(frame.outline_color_pack);
  let hc = select(halo_rgba, gOutline, frame.outline_width_px > 0.001);
  let hw = max(halo_w_px, 0.0) + max(frame.outline_width_px, 0.0);
  let extra = hw * 0.035 / max(size_px, 1.0);
  let w2 = w + extra;
  let outerA = clamp(sigDist / w2 + 0.5, 0.0, 1.0) * max(hc.a, fill_rgba.a) * step(0.001, hw + frame.outline_width_px);
  let haloPortion = max(0.0, outerA - fillA);

  let rgb = fill_rgba.rgb * fillA + hc.rgb * haloPortion;
  let alpha = min(1.0, fillA + haloPortion);
  if (alpha < 0.001) {
    discard;
  }
  return vec4<f32>(rgb, alpha);
}
`;
