/** WebGPU `writeBuffer` requires a size multiple of 4. */
export function alignTo4Bytes(byteLength: number): number {
  return (byteLength + 3) & ~3;
}
