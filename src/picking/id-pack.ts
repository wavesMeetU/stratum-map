/**
 * Pack `featureId + 1` into RGBA8 (little-endian u32 in readback order).
 * `0` after readback means background / miss (reserved).
 */
export function decodeFeatureIdFromRgba8Bytes(bytes: Uint8Array, byteOffset = 0): number | null {
  if (bytes.length - byteOffset < 4) return null;
  const packed =
    bytes[byteOffset] |
    (bytes[byteOffset + 1] << 8) |
    (bytes[byteOffset + 2] << 16) |
    (bytes[byteOffset + 3] << 24);
  if (packed === 0) return null;
  return packed - 1;
}
