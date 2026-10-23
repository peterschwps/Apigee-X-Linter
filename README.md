# Apigee X Linter

Apigee X linter for VS Code and the terminal. It checks proxy and shared flow XML against Google's Apigee documentation and adds completion and quick fixes in the editor.

**Alpha:** validation is based on reviewed Google documentation and is intentionally incomplete where the documentation is ambiguous. A clean result does not prove that Apigee will deploy or correctly execute a proxy.

## Quick Start

1. Install **Apigee X Linter** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=peterschwps.apigee-x-linter) or, for VSCodium and other editors, from [Open VSX](https://open-vsx.org/extension/peterschwps/apigee-x-linter). VS Code 1.96 or later is required.
2. Open a proxy or shared flow bundle and an XML file under `apiproxy/` or `sharedflowbundle/`.
3. Check the **Problems** panel for diagnostics. Use **Ctrl+Space** for completion suggestions and **Ctrl+.** for quick fixes.

To build a VSIX from source, see the [development guide](docs/development.md).

## Settings

- `apigeeXLinter.enabled`: enable or disable the extension.
- `apigeeXLinter.exclude`: ignore matching file paths.
- `apigeeXLinter.ignore`: suppress selected diagnostic IDs, such as `AX110`.

To suppress a diagnostic at one location, add `<!-- apigee-x-linter disable=AX101 -->` on the line before it, or use the quick fix. AX105 typos also offer a fix to the closest documented value.

Apigee Edge, hybrid-only configuration, and validation of embedded payload content are outside scope. The extension reads local XML; it does not deploy proxies or fetch documentation at runtime. Current coverage includes 78 documentation sources, with 25 explicitly recorded gaps.

For CI, the same checks run from the command line: `npx @peterschwps/apigee-x-linter path/to/bundles` exits with 1 when errors are found. See the [command-line section](docs/index.md#command-line).

See the [user guide](docs/index.md), [development guide](docs/development.md), and [apigeelint comparison](docs/apigeelint-review.md).

Report problems through [GitHub Issues](https://github.com/peterschwps/Apigee-X-Linter/issues), including a minimal XML example without credentials or private data.

An independent community project, not affiliated with Google.
