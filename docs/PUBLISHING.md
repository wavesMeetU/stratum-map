# Publishing and git history

## Tags

Use semantic versioning once the API stabilizes, for example `v0.1.0` for the first public API snapshot, or `v1.0.0` when you are ready to commit to backward compatibility under semver rules.

```bash
git tag -a v0.1.0 -m "First public release"
git push origin v0.1.0
```

## History rewrite (optional)

The `main` branch may contain many incremental commits from internal development. For a **pristine public history**, maintainers can:

1. Create a new orphan branch with squashed milestone commits (see suggested sequence in project handoff docs), **or**
2. Keep linear `main` as-is for traceability and rely on **tags** and **CHANGELOG.md** for user-facing milestones.

Rewriting published `main` **force-pushes** and disrupts forks; only do it before collaborators depend on the old SHAs, or use a new default branch name (for example `release`) for the cleaned history.

## npm

The package name on npm is **`stratum-map`**. The package is **`private: false`** as of **v0.1.0** and can be published by maintainers with registry access and **2FA** enabled on their npm account.

First-time publish (local):

```bash
npm run build && npm test
npm publish --dry-run
npm login
npm publish
```

Optional CI: add an npm **automation** or **granular access token** as the `NPM_TOKEN` repository secret, then either push a semver tag (`v*.*.*`) or run **Actions → Publish to npm → Run workflow** manually. The workflow at `.github/workflows/publish-npm.yml` runs `npm ci`, `npm test`, and `npm publish` with `NODE_AUTH_TOKEN`.

If the tag `v0.1.0` was pushed before `NPM_TOKEN` existed, add the secret and use **Run workflow** (or delete and recreate the tag) so publish runs once.
