#!/usr/bin/env bash
# Regenerate Playwright visual baselines under linux/ (same stack as GitHub Actions).
# Requires Docker. From repo root:
#   ./scripts/regen-visual-snapshots-linux-docker.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

docker run --platform linux/amd64 --rm \
  -v "$ROOT:/work" \
  -w /work \
  node:22-bookworm \
  bash -eux -c '
    apt-get update -qq
    apt-get install -y -qq wget ca-certificates gnupg >/dev/null
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    apt-get install -y -qq ./google-chrome-stable_current_amd64.deb || apt-get -f install -y -qq
    rm -f ./google-chrome-stable_current_amd64.deb
    rm -rf node_modules
    npm ci
    npm run build:bench
    npx playwright install-deps chrome
    npx playwright test tests/visual-regression/render-correctness.spec.ts --update-snapshots
  '

echo "Done. Commit tests/visual-regression/render-correctness.spec.ts-snapshots/linux/*.png"
