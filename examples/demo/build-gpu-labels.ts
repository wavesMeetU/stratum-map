/**
 * Demo-only: build `TextLabel[]` for coordinate readout (keeps `main.ts` wiring thin).
 */
import type { TextLabel } from "../../src/text/text-types.js";

export interface InViewPoint {
  readonly id: number;
  readonly mx: number;
  readonly my: number;
  readonly lon: number;
  readonly lat: number;
}

export function buildCoordinateTextLabels(
  items: readonly InViewPoint[],
  maxLabels: number,
  formatNum: (n: number, digits: number) => string,
): TextLabel[] {
  const slice = items.slice(0, maxLabels);
  const out: TextLabel[] = new Array(slice.length);
  for (let i = 0; i < slice.length; i++) {
    const it = slice[i]!;
    out[i] = {
      id: it.id,
      x: it.mx,
      y: it.my,
      text: `#${it.id} ${formatNum(it.lon, 3)} ${formatNum(it.lat, 3)}`,
      color: [1, 0.9, 0.75, 0.95] as const,
      sizePx: 20,
      priority: it.id % 9,
      anchor: "left",
    };
  }
  return out;
}
