/**
 * Rounds byte length up to a power of two (minimum 4) so pooled GPU buffers
 * amortize allocations across similarly-sized chunks (reduces fragmentation churn).
 */
export function bucketByteSizeCeil(minBytes: number): number {
  if (!Number.isFinite(minBytes) || minBytes <= 4) {
    return 4;
  }
  const n = Math.ceil(minBytes);
  let p = 4;
  while (p < n) {
    p <<= 1;
  }
  return p;
}
