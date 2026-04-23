---
sidebar_position: 11
---

# Contributing

## Repository workflow

Full policy lives in the repository root: **[CONTRIBUTING.md](https://github.com/wavesMeetU/stratum-map/blob/main/CONTRIBUTING.md)** (license grant, Conventional Commits, PR checklist).

## Website (this folder)

```bash
cd website
npm install
npm run start
```

Preview production build:

```bash
npm run build && npm run serve
```

Deploy to GitHub Pages is handled by **`.github/workflows/deploy-docs.yml`** on push to `main` (requires Pages source = **GitHub Actions** in repo settings).

## Code of conduct

[CODE_OF_CONDUCT.md](https://github.com/wavesMeetU/stratum-map/blob/main/CODE_OF_CONDUCT.md)

## Security

[SECURITY.md](https://github.com/wavesMeetU/stratum-map/blob/main/SECURITY.md)
