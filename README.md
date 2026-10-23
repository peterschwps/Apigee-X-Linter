# Apigee X Linter

A linter for Apigee X proxy and shared flow XML, based on Google's Apigee documentation. It runs as a VS Code extension with diagnostics, completion, and quick fixes, and as a command-line tool for CI.

**Alpha development:** no Marketplace release is available yet. Validation is based on reviewed Google documentation and is intentionally incomplete where the documentation is ambiguous.

## Quick Start

1. Install a locally built VSIX using **Extensions: Install from VSIX...** in VS Code.
2. Open a proxy or shared flow bundle and an XML file under `apiproxy/` or `sharedflowbundle/`.
3. Check the **Problems** panel for diagnostics. Use **Ctrl+Space** for completion suggestions.

To build the alpha package from source:

```sh
npm ci
npm run check
npm run release:check
npm run package:alpha
```

The package is written to `apigee-x-linter-0.1.0.vsix`. VS Code 1.96 or later is required.

## Settings

- `apigeeXLinter.enabled`: enable or disable the extension.
- `apigeeXLinter.exclude`: ignore matching file paths.
- `apigeeXLinter.ignore`: suppress selected diagnostic IDs, such as `AX110`.

To suppress a diagnostic at one location, add `<!-- apigee-x-linter disable=AX101 -->` on the line before it, or use the quick fix. AX105 typos also offer a fix to the closest documented value.

Apigee Edge, hybrid-only configuration, and validation of embedded payload content are outside scope. The extension reads local XML; it does not deploy proxies or fetch documentation at runtime. Current coverage includes 78 documentation sources, with 25 explicitly recorded gaps.

For CI, the same checks run from the command line: `npx @peterschwps/apigee-x-linter path/to/bundles` exits with 1 when errors are found. See the [command-line section](docs/index.md#command-line).

See the [user guide](docs/index.md), [development guide](docs/development.md), and [apigeelint comparison](docs/apigeelint-review.md).

Report problems through [GitHub Issues](https://github.com/peterschwps/apigee-x-linter/issues), including a minimal XML example without credentials or private data.

An independent community project, not affiliated with Google.
