# Apigee X Linter

A small VS Code extension that checks Apigee X proxy XML and suggests elements, attributes, and documented values.

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

Apigee Edge, hybrid-only configuration, and validation of embedded payload content are outside scope. The extension reads local XML; it does not deploy proxies or fetch documentation at runtime. Current coverage includes 78 documentation sources, with 25 explicitly recorded gaps.

See the [user guide](docs/index.md), [development guide](docs/development.md), and [apigeelint comparison](docs/apigeelint-review.md).

Report problems through [GitHub Issues](https://github.com/peterschwps/apigee-x-linter/issues), including a minimal XML example without credentials or private data.

An independent community project, not affiliated with Google.
