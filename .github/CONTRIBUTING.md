# Contributing to Apigee X Linter

Thanks for your interest in contributing!

## Development setup

Requires Node.js 22 or later.

```bash
git clone https://github.com/peterschwps/Apigee-X-Linter.git
cd Apigee-X-Linter
npm ci
npm run check
npm test
```

`npm run test:integration` runs the extension in a real VS Code host. Press F5 in VS Code to start an Extension Development Host. See the [development guide](../docs/development.md) for the code structure and documentation maintenance.

## Rules and documentation

Every rule is based on the Google Cloud Apigee X documentation. Link the exact documentation section in `data/reviewed`, and record contradictions or gaps in `data/sources.json` instead of guessing.

## Branch naming

Use `<type>/<short-kebab-description>`:

- `feat/target-completion`
- `fix/cdata-values`
- `docs/rule-reference`

Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`,
`perf`, `test`, `build`, `ci`, `revert`.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Format:

```
<type>(<optional-scope>): <subject>
```

Examples:

- `feat(completion): suggest target endpoint names`
- `fix(cli): classify relative bundle paths`
