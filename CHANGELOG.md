# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-23

First public release on the [npm registry](https://www.npmjs.com/package/stratum-map) as **`stratum-map`**.

### Added

- Public repository scaffolding: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue and PR templates, `.editorconfig`, `.gitattributes`.
- Maintainer documentation consolidated under `docs/internal/`.
- Root `npm test` script running Node-based unit tests after `npm run build`.
- Package metadata for discovery: `keywords`, `homepage`, `author`; `package.json` is publishable (`private: false`) at version **0.1.0**.
- GitHub Actions workflow `.github/workflows/publish-npm.yml` to publish tagged releases using the `NPM_TOKEN` secret.

### Changed

- Documentation index and cross-links updated for the new internal doc paths.
- Demo `main.ts` file header comments aligned with neutral OSS tone (no behavior change).
- Maintainer notes in `docs/PUBLISHING.md` updated for npm publish steps and CI.
