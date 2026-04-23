# Open-source cleanup report

Audit performed as part of preparing the repository for public release. Items marked **fixed** were addressed in the same cleanup pass.

## Naming

- **Observation:** The working directory may still be named `wgpu-ol-renderer` while the npm package is **`stratum-map`**. **Mitigation:** README and docs consistently use **stratum-map**; folder rename is a local developer choice.
- **Observation:** Mixed prefixes (`WebGpu` vs `GPU`) match TypeScript DOM (`WebGPU`) and are kept for DOM alignment. **Action:** none (breaking rename avoided).

## Dead / duplicate / stale files

- **fixed:** Root `PHASES.md`, `EXECUTION_GUIDELINES.md`, and `SYSTEM_OVERVIEW.md` were maintainer-only and emoji-heavy; moved to **`docs/internal/`** with neutral tone and updated cross-links in `HLD.md`, `LLD.md`, and `DOCUMENTATION_INDEX.md`.
- **Observation:** No duplicate `src` modules found; `dist-demo/` remains gitignored build output.

## Temporary demo hacks

- **Observation:** `examples/demo/main.ts` contains performance-oriented caps (e.g. label limits); documented in-file as integration choices, not library defects. **Action:** no removal (feature preservation).

## Commented-out code / TODO noise

- **Observation:** `grep` over `src/**/*.ts` found no `TODO`/`FIXME`/`HACK` markers and no large commented-out code blocks matching common patterns. JSDoc on public types is substantive rather than noisy.

## Stale docs / internal notes

- **fixed:** `.cursor/skills` reference removed from public documentation index (local IDE artifact).
- **fixed:** Internal execution docs relocated under `docs/internal/` with a short `README.md` explaining audience.

## Folder organization

- **Observation:** Existing `src/{core,client,gpu,parser,picking,renderer,text,types,worker,geoarrow}/` layout is coherent. **Action:** no large-scale moves (preserves imports and git blame).

## Build artifacts

- **Observation:** `dist/`, `dist-bench/`, `dist-demo/`, `playwright-report/`, `test-results/` are ignored; none were tracked in git at audit time.

## Tests

- **fixed:** Added root **`npm test`** running `npm run build` plus Node’s test runner on `tests/*.spec.mjs` (Playwright `.ts` specs remain separate npm scripts).

## Broken links

- **fixed:** Links to moved root markdown files updated in `docs/DOCUMENTATION_INDEX.md`, `docs/HLD.md`, and `docs/LLD.md`.

## Scripts / tooling

- **Observation:** No ESLint config in repo; quality gate is **TypeScript `strict`** + tests. **Mitigation:** documented in `CONTRIBUTING.md`.

## OSS standards

- **fixed:** Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `.editorconfig`, `.gitattributes`, and GitHub issue/PR templates.
- **License:** Project remains **Apache-2.0** (see `LICENSE`); not switched to MIT.

## Follow-ups (optional)

- Add real screenshots under `docs/images/` and link from README.
- Enable GitHub **private vulnerability reporting** for the org/repo.
- Consider ESLint + Prettier in a follow-up if the maintainer team wants uniform formatting beyond EditorConfig.
