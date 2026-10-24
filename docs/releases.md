# Releases

## Versions and changelog

release-please owns changelog entries and version updates. Configuration uses the Node strategy, numeric versions compatible with VS Code, and regular GitHub releases. Before 1.0, features and fixes both bump the patch version, so releases stay at 0.1.x; a breaking change would bump to 1.0.0. The VS Code stores mark the alpha separately through the pre-release package flag and the manifest's `preview` flag. Do not append release entries manually.

The `release-please` workflow runs on every push to `main` and keeps a release pull request up to date. It uses the `RELEASE_PLEASE_TOKEN` secret, a personal access token, so release commits and tags carry the owner's identity and the created tag can start the release workflow. Merging the release pull request creates the tag `v<version>` and the GitHub release.

## Release workflow

The `Release` workflow runs for every `v*` tag. It can also be started manually on an existing tag; started on a branch, it stops before building. One workflow file with separate jobs keeps a single workflow name for every store's trusted-publishing configuration.

1. `build` checks that the tag matches `package.json`, runs `check`, `release:check`, the unit tests, and the integration tests, then packages the pre-release VSIX and the npm tarball once. Every later job uses these exact files.
2. `publish-marketplace`, `publish-openvsx`, and `publish-npm` each run only when their repository variable is `true`: `MARKETPLACE_PUBLISH_ENABLED`, `OPENVSX_PUBLISH_ENABLED`, and `NPM_PUBLISH_ENABLED`. They use the `release` environment, whose required reviewer approves publication, and authenticate through trusted publishing with the GitHub OIDC token. No store token is stored in the repository. Versions that already exist are skipped, so a failed job can be repeated.
3. `github-assets` attaches the VSIX to the GitHub release.

Each store needs a trusted-publisher entry for repository `peterschwps/Apigee-X-Linter`, workflow `release.yml`, and environment `release` before its variable is enabled. npm only allows this for an existing package, and its provenance attestation requires a public repository. After configuring npm, set the package's publishing access to require two-factor authentication and disallow tokens.

## Local packaging

```sh
npm ci
npm run check
npm run release:check
npm run package:alpha
```

VS Code pre-releases use numeric versions and the `--pre-release` packaging flag, rather than a version suffix such as `-alpha.1`. A locally built VSIX can be uploaded manually under publisher `peterschwps` if a store's trusted publishing is not available.

## npm package

The CLI is published as `@peterschwps/apigee-x-linter`. VS Code rejects scoped extension names, so `npm run package:npm` builds the extension and CLI, then stages a separate manifest, `dist/cli.js`, `data/reviewed`, `npm/README.md`, and the license in `.cache/npm-package`. It packs the stage, rejects unexpected files, installs the tarball into a temporary project, and checks the installed command's exit codes. CI runs this check on every push. The npm version follows the root `package.json` version managed by release-please.
