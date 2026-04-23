# Contributing to stratum-map

Thank you for improving the project. This document is the single entry point for contributions.

## Principles

- Preserve **working behavior** unless a change is explicitly agreed as breaking.
- Prefer **small, reviewable** pull requests with a clear motivation.
- Match existing **TypeScript style** (strict mode, explicit types at public boundaries).
- Keep the **renderer unaware of parser formats**; cross-layer shortcuts need strong justification.

## Development setup

```bash
npm install
npm run build
npm test
```

Playwright-based checks (optional locally if browsers are installed):

```bash
npm run test:geojson-worker
npm run verify:pan-zoom
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes where practical, for example:

- `feat(renderer): …`
- `fix(picking): …`
- `docs: …`
- `chore: …`
- `test: …`

## Pull requests

1. Fork and branch from `main`.
2. Describe **what** changed and **why** (motivation, trade-offs, risk).
3. Note **breaking changes** and migration steps if any.
4. Ensure `npm run build` and `npm test` pass.
5. Link related issues when applicable.

Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) as a checklist.

## License

By contributing, you agree that your contributions will be licensed under the **Apache License 2.0**, the same license as the project. See [LICENSE](LICENSE).

## Questions

Open a [GitHub Discussion](https://github.com/wavesMeetU/stratum-map/discussions) or issue for design questions before large refactors.
