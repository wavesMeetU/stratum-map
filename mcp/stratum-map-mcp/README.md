# stratum-map-mcp

Local **Model Context Protocol** (stdio) server for this monorepo: read-only helpers so agents can inspect npm scripts and a few documentation files without shell access.

## Run (Cursor)

[`.cursor/mcp.json`](../../.cursor/mcp.json) starts this server with **`npx -y tsx …/src/index.ts`** so you do not need a local `npm run build` for day-to-day use.

## Build (optional)

To typecheck / emit `dist/`:

```bash
npm ci
npm run build
```

## Tools

| Tool | Purpose |
|------|---------|
| `list_npm_scripts` | Returns `scripts` from root and `website/package.json`. |
| `read_repo_doc` | Sliced contents of allowlisted paths: `docs/USAGE.md`, `docs/DOCUMENTATION_INDEX.md`, `README.md`, `website/README.md`. |

## Other MCPs in this repo

See [`.cursor/mcp.json`](../../.cursor/mcp.json): **fetch**, **git** (requires [uv](https://docs.astral.sh/uv/) for `uvx`), **github** (set `GITHUB_PERSONAL_ACCESS_TOKEN` in Cursor’s MCP server environment for that entry—do not commit secrets).
