# Apigee X Linter CLI

Command-line linter for Apigee X proxy and shared flow bundle XML. It runs the same checks as the [Apigee X Linter VS Code extension](https://github.com/peterschwps/Apigee-X-Linter): structure, documented values and formats, cardinality, and bundle-local policy, target endpoint, and resource references. Every rule is based on reviewed Google Cloud Apigee documentation.

**Alpha:** validation is intentionally incomplete where the documentation is ambiguous. A clean result does not prove that Apigee will deploy or correctly execute a proxy.

## Usage

Node.js 20.1 or later is required.

```sh
npx @peterschwps/apigee-x-linter path/to/apiproxy path/to/sharedflowbundle
```

Directories are searched recursively for XML under `apiproxy` and `sharedflowbundle`, skipping `node_modules` and `.git`; files given explicitly are always linted. Without a path, the current directory is checked.

Each finding is printed as `file:line:column: severity rule message`, followed by a summary on standard error:

```text
apiproxy/policies/FC.xml:2:12: error AX105 Expected one of: true, false. Did you mean "false"?
1 file checked: 1 error, 0 warnings.
```

| Exit code | Meaning |
| --- | --- |
| 0 | No errors; warnings may have been reported |
| 1 | At least one error |
| 2 | Invalid option or unreadable path |

Use `--ignore AX110,AX101` to skip rules and `--version` to print the installed version. To suppress a finding at one location, put `<!-- apigee-x-linter disable=AX101 -->` on the line before it.

## GitHub Actions

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 24
- run: npx --yes @peterschwps/apigee-x-linter apiproxy
```

## More information

See the [rule reference and user guide](https://github.com/peterschwps/Apigee-X-Linter/blob/main/docs/index.md) and report problems through [GitHub Issues](https://github.com/peterschwps/Apigee-X-Linter/issues), including a minimal XML example without credentials or private data.

An independent community project, not affiliated with Google. Licensed under MIT.
