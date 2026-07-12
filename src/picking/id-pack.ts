/**
 * Pack `featureId + 1` into RGBA8 (little-endian u32 in readback order).
 * `0` after readback means background / miss (reserved).
 *
 * The reconstruction uses `>>> 0` to force an **unsigned** 32-bit result: JS's `|`/`<<`
 * operators return a *signed* 32-bit integer, so without this, any packed value with bit
 * 31 set (i.e. `featureId >= 0x7FFFFFFF`) would decode as a negative number instead of the
 * intended id in `[0x7FFFFFFF, 0xFFFFFFFF]`. `0xFFFFFFFF` itself is not a valid encoded
 * value (see `MAX_SAFE_GPU_FEATURE_ID` in `parser/geojson-chunk-build.ts`): it would require
 * `featureId = 0xFFFFFFFF`, whose `+1` sentinel wraps to `0` in the shader's `u32`
 * arithmetic, colliding with the background/miss sentinel — so the true maximum valid
 * `FeatureId` is `0xFFFFFFFE`.
 */
export function decodeFeatureIdFromRgba8Bytes(bytes: Uint8Array, byteOffset = 0): number | null {
  if (bytes.length - byteOffset < 4) return null;
  const packed =
    (bytes[byteOffset] |
      (bytes[byteOffset + 1] << 8) |
      (bytes[byteOffset + 2] << 16) |
      (bytes[byteOffset + 3] << 24)) >>>
    0;
  if (packed === 0) return null;
  return packed - 1;
}
