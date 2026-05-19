/**
 * Visual regression baseline policy for WebGPU canvas screenshots.
 *
 * ## Tolerance (GPU + fwidth AA)
 * Point sprites use analytic coverage with `fwidth()` in WGSL (`points-wgsl.ts`), so
 * edge pixels can differ slightly by GPU/driver. Prefer `maxDiffPixels` + `threshold`
 * over pixel-perfect equality.
 *
 * ## Per-OS baselines (recommended for CI)
 * Snapshots live under `render-correctness.spec.ts-snapshots/{platform}/` (e.g. `linux/`,
 * `darwin/`). **CI (`ubuntu-latest`) compares against `linux/`.** Regenerate Linux PNGs
 * after intentional visual changes:
 *
 * ```bash
 * # On Linux (or Docker — see scripts/regen-visual-snapshots-linux-docker.sh)
 * npm ci && npm run build:bench
 * npx playwright install-deps chrome
 * npx playwright test tests/visual-regression/render-correctness.spec.ts --update-snapshots
 * ```
 *
 * On macOS, `--update-snapshots` refreshes `darwin/` only; commit both when they change.
 *
 * ## Updating baselines (local)
 * ```bash
 * npm run build:bench
 * npx playwright test tests/visual-regression/render-correctness.spec.ts --update-snapshots
 * ```
 */
export const WEBGPU_CANVAS_SCREENSHOT = {
  maxDiffPixels: 3500,
  threshold: 0.3,
  animations: "disabled" as const,
};

/** Narrower tolerance for scenes with less edge-heavy content (optional overrides). */
export const WEBGPU_CANVAS_SCREENSHOT_STRICT = {
  maxDiffPixels: 1800,
  threshold: 0.24,
  animations: "disabled" as const,
} as const;

/**
 * For custom scripts only. Playwright refreshes PNGs via CLI:
 * `playwright test … --update-snapshots`
 */
export function shouldRefreshVisualBaselinesFromEnv(): boolean {
  return process.env.UPDATE_VISUAL_SNAPSHOTS === "1";
}
