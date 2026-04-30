/**
 * Visual regression baseline policy for WebGPU canvas screenshots.
 *
 * ## Tolerance (GPU + fwidth AA)
 * Point sprites use analytic coverage with `fwidth()` in WGSL (`points-wgsl.ts`), so
 * edge pixels can differ slightly by GPU/driver. Prefer `maxDiffPixels` + `threshold`
 * over pixel-perfect equality.
 *
 * ## Updating baselines (local)
 * ```bash
 * npm run build:bench
 * npx playwright test tests/visual-regression/render-correctness.spec.ts --update-snapshots
 * ```
 *
 * ## CI stability
 * - Use `deviceScaleFactor: 1` (set in `playwright.config.ts` for the Chrome project).
 * - Commit snapshot PNGs generated on the **same OS as CI** (e.g. `ubuntu-latest`) when
 *   possible; macOS vs Linux can differ even with tolerance.
 * - Optional: set `UPDATE_VISUAL_SNAPSHOTS=1` in a dedicated workflow job that commits
 *   artifacts — never on the default PR gate. (Playwright itself uses `--update-snapshots`;
 *   this env name is for your own automation wrappers only.)
 */
export const WEBGPU_CANVAS_SCREENSHOT = {
  maxDiffPixels: 2500,
  threshold: 0.32,
  animations: "disabled" as const,
};

/** Narrower tolerance for scenes with less edge-heavy content (optional overrides). */
export const WEBGPU_CANVAS_SCREENSHOT_STRICT = {
  maxDiffPixels: 1200,
  threshold: 0.26,
  animations: "disabled" as const,
} as const;

/**
 * For custom scripts only. Playwright refreshes PNGs via CLI:
 * `playwright test … --update-snapshots`
 */
export function shouldRefreshVisualBaselinesFromEnv(): boolean {
  return process.env.UPDATE_VISUAL_SNAPSHOTS === "1";
}
