# Releases

## Changelog automation

release-please owns future changelog entries and version updates. Configuration uses the Node strategy, an initial version of `0.1.0`, numeric versions compatible with VS Code, and GitHub pre-release marking. Do not append release entries manually.

The workflow is manual and gated by `RELEASE_PLEASE_ENABLED`. It requires a dedicated `RELEASE_PLEASE_TOKEN`; there is no fallback to the GitHub Actions bot token.

Once configured, run the workflow to propose the release PR. Review and merge release changes deliberately, preserving the commit convention. Run it again to create the GitHub pre-release after the release PR has been merged. This workflow does not publish to the Marketplace or deploy the documentation.

## Alpha packaging

```sh
npm ci
npm run check
npm run release:check
npm run package:alpha
```

VS Code pre-releases use numeric versions and the `--pre-release` packaging flag, rather than a version suffix such as `-alpha.1`. Inspect and install the final VSIX before uploading it under publisher `peterschwps`.

## Extension release

The manual `Publish VS Code extension` workflow is gated by the `EXTENSION_PUBLISH_ENABLED` repository variable. It runs all checks and the integration tests, packages one pre-release VSIX, and publishes that same file to the Visual Studio Marketplace with the `VSCE_PAT` secret and to Open VSX with the `OVSX_PAT` secret. Versions that already exist are skipped, so a failed run can be repeated. The manifest's `preview` flag marks the alpha in both stores.

## npm package

The CLI is published as `@peterschwps/apigee-x-linter`. VS Code rejects scoped extension names, so `npm run package:npm` builds the extension and CLI, then stages a separate manifest, `dist/cli.js`, `data/reviewed`, `npm/README.md`, and the license in `.cache/npm-package`. It packs the stage, rejects unexpected files, installs the tarball into a temporary project, and checks the installed command's exit codes. CI runs this check on every push. The npm version follows the root `package.json` version managed by release-please.

The first version must be published manually because npm trusted publishing can only be configured for an existing package:

```sh
npm ci
npm run package:npm
npm publish .cache/npm-package
```

Later versions use the manual `Publish npm package` workflow. It is gated by the `NPM_PUBLISH_ENABLED` repository variable, needs no npm token, and authenticates through npm trusted publishing with the GitHub OIDC token. npm then attaches a provenance attestation, which requires the repository and package to be public. After the trusted publisher is configured, set the package's publishing access to require two-factor authentication and disallow tokens.
