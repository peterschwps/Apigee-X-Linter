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
