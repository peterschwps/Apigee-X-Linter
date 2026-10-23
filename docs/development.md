# Development

Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. Press F5 to launch an Extension Development Host. `npm run package:alpha` builds a local pre-release VSIX without publishing it.

## Code structure

- `src/xml.ts` converts parser output to a small position-aware XML model.
- `src/spec.ts` defines and loads reviewed rule data.
- `src/linter.ts` validates XML without depending on VS Code.
- `src/completion.ts` generates suggestions for incomplete XML.
- `src/bundle.ts` checks saved bundle-local references.
- `src/directives.ts` applies inline `apigee-x-linter disable` comments.
- `src/extension.ts` handles VS Code settings, events, and diagnostics.
- `test/` contains `node:test` suites; `test/fixtures/bundle` and `test/fixtures/sharedflow` are a proxy and a shared flow bundle that must lint without findings.

TypeScript strict mode is enabled. Rule data stays separate from behavior, and documentation tooling stays outside the runtime package. Keep code, comments, diagnostics, documentation, and commit messages in English.

## Documentation maintenance

1. Run `npm run docs:refresh` to compare Google documentation with saved section hashes, then `npm run docs:discover` to find new pages.
2. Run `npm run docs:extract` and `npm run docs:propose`. Raw candidates are local-only; proposals are explicitly unreviewed and excluded from the VSIX.
3. Review each proposal against current Google Apigee X documentation. Copy confirmed facts into `data/reviewed`, preserving ancestry, source links, and completeness flags. Record unresolved details in `data/sources.json`.
4. Run `npm run check`. With candidates present, this also checks documentation anchors. Extraction updates the hash baseline; refresh does not.

`npm run release:check` validates inventory status, reviewed data, and comparison coverage. Passing does not resolve documented gaps or replace editor/package checks.

The [apigeelint comparison](apigeelint-review.md) documents optional differential checks. apigeelint is not a runtime dependency.

## Documentation site

Build the pages locally with an isolated MkDocs 1.x environment:

```sh
uv tool run --with "mkdocs-material>=9,<10" "mkdocs>=1.6,<2" build --strict
```

## Tests

`npm test` runs the suites with Node's built-in test runner. Add a failing case before fixing a bug, and extend the fixture bundle only with XML that Apigee X accepts. CI runs `check`, `test`, and `build` on pushes to `main` and on pull requests. `src/extension.ts` is not covered because it needs a VS Code host.
