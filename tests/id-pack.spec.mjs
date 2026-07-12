/**
 * Feature-id RGBA8 packing (Stage 5.1.1).
 *
 * `pick-points-wgsl.ts`'s fragment shader encodes `packed = (featureId + 1) mod 2^32`
 * (WGSL `u32` arithmetic) into 4 little-endian bytes. `id-pack.ts` decodes those bytes back
 * into a FeatureId on the main thread. These tests simulate the shader's encoding in plain
 * JS (mirroring its exact bit operations) and verify the full round trip through the real
 * decode function — this is what actually caught the signed-reconstruction bug.
 *
 * Run: node --test tests/id-pack.spec.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { decodeFeatureIdFromRgba8Bytes } = await import(
  join(root, "dist/picking/id-pack.js")
);

const MAX_SAFE_GPU_FEATURE_ID = 0xfffffffe;

/**
 * Mirrors pick-points-wgsl.ts's fs_pick: `packed = (fid + 1) mod 2^32`, split little-endian.
 * Using `>>> 0` here reproduces WGSL's u32 wraparound, including the fid=0xFFFFFFFF case.
 */
function encodeFeatureIdToBytes(fid) {
  const packed = (fid + 1) >>> 0;
  return new Uint8Array([
    packed & 0xff,
    (packed >>> 8) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 24) & 0xff,
  ]);
}

describe("decodeFeatureIdFromRgba8Bytes — encode/decode round trip", () => {
  const roundTripCases = [
    ["0", 0],
    ["1", 1],
    ["byte boundary 254", 254],
    ["byte boundary 255", 255],
    ["byte boundary 256", 256],
    ["byte boundary 257", 257],
    ["16-bit boundary 65534", 65534],
    ["16-bit boundary 65535", 65535],
    ["16-bit boundary 65536", 65536],
    ["16-bit boundary 65537", 65537],
    ["24-bit boundary 16777214", 16777214],
    ["24-bit boundary 16777215", 16777215],
    ["24-bit boundary 16777216", 16777216],
    ["24-bit boundary 16777217", 16777217],
    ["0x7FFFFFFE (old artificial ceiling)", 0x7ffffffe],
    ["0x7FFFFFFF (first value the signed-decode bug broke)", 0x7fffffff],
    ["0x80000000 (high bit set)", 0x80000000],
    ["0xC0000000 (top two bits set)", 0xc0000000],
    ["0xFFFFFFFD", 0xfffffffd],
    ["0xFFFFFFFE (true max FeatureId)", 0xfffffffe],
  ];

  for (const [label, fid] of roundTripCases) {
    it(`round-trips FeatureId ${label}`, () => {
      const bytes = encodeFeatureIdToBytes(fid);
      const decoded = decodeFeatureIdFromRgba8Bytes(bytes);
      assert.equal(decoded, fid);
      assert.ok(decoded >= 0, `decoded value must never be negative, got ${decoded}`);
    });
  }

  it("MAX_SAFE_GPU_FEATURE_ID (0xFFFFFFFE) round-trips and matches the true maximum", () => {
    const bytes = encodeFeatureIdToBytes(MAX_SAFE_GPU_FEATURE_ID);
    assert.equal(decodeFeatureIdFromRgba8Bytes(bytes), MAX_SAFE_GPU_FEATURE_ID);
  });

  it("background/miss sentinel (all-zero bytes) decodes to null", () => {
    assert.equal(decodeFeatureIdFromRgba8Bytes(new Uint8Array([0, 0, 0, 0])), null);
  });

  it("FeatureId 0xFFFFFFFF is not a valid encoding — its +1 sentinel wraps to the miss value", () => {
    // This is the true structural ceiling (not a decode bug): the shader's u32 arithmetic
    // wraps 0xFFFFFFFF + 1 to 0, which is indistinguishable from a genuine miss.
    const bytes = encodeFeatureIdToBytes(0xffffffff);
    assert.deepEqual(bytes, new Uint8Array([0, 0, 0, 0]));
    assert.equal(decodeFeatureIdFromRgba8Bytes(bytes), null);
  });

  it("respects a non-zero byteOffset", () => {
    const fid = 0x7fffffff;
    const encoded = encodeFeatureIdToBytes(fid);
    const buf = new Uint8Array(6);
    buf.set(encoded, 2);
    assert.equal(decodeFeatureIdFromRgba8Bytes(buf, 2), fid);
  });

  it("returns null when fewer than 4 bytes are available", () => {
    assert.equal(decodeFeatureIdFromRgba8Bytes(new Uint8Array([1, 2, 3])), null);
    assert.equal(decodeFeatureIdFromRgba8Bytes(new Uint8Array([1, 2, 3, 4]), 1), null);
  });
});
