# Linux Playwright baselines (`ubuntu-latest` + Google Chrome)

CI (`pr-tests.yml`) compares the WebGPU harness against the six PNG files in **this directory**.

## First-time or refresh

1. **GitHub (no Docker):** Actions → **Update visual snapshots (linux)** → Run workflow (pick your branch) → download artifact **`visual-snapshots-linux`** → copy the PNGs here → commit.
2. **Local Docker:** from repo root, with Docker running: `npm run test:visual:update:linux:docker` → commit the generated `linux/*.png`.

Then open a PR; `npm run test:visual` on macOS still uses `../darwin/`.
