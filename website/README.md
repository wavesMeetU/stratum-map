# stratum-map documentation site

Docusaurus project for **https://wavesmeetu.github.io/stratum-map/** (configure **GitHub Pages → GitHub Actions** in repository settings).

## Google Search Console

Use a **URL-prefix** property that matches the live site (not the `github.com` repo URL), for example **`https://wavesmeetu.github.io/stratum-map`**.

Submit the sitemap as the full URL (after a production build / deploy):

**`https://wavesmeetu.github.io/stratum-map/sitemap.xml`**

If the UI mis-reports the sitemap, confirm the property prefix matches the host and path above, then use **URL inspection** on that exact sitemap URL.

## Commands

```bash
npm install
npm run start      # dev server — http://localhost:3000/stratum-map/
npm run build      # runs flagship Vite bundle (prebuild) then Docusaurus → build/
npm run serve      # preview build locally
npm run deploy     # manual gh-pages deploy (optional; CI uses deploy-pages)
```

**Hosted demos:** `prebuild` runs `../npm run website:build:demos` (library `dist/` + Vite bundles into `static/demos/{flagship,picking,text}/`). Routes: **`/demo`** (points), **`/examples/picking`** (GPU pick + `FeatureStore`), **`/examples/text`** (labels). `static/demos/` is gitignored.

## Local path

The dev server uses `baseUrl: /stratum-map/`. Open the URL printed in the terminal (including the base path).

## Repository root shortcuts

From the monorepo root:

```bash
npm run website:install
npm run website:start
npm run website:build
```
