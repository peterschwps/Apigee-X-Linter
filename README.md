# Apigee X Linter

A TypeScript VS Code extension for Apigee X proxy bundle XML. It provides diagnostics and context-aware completions from reviewed facts in the [Google Cloud Apigee documentation](https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/reference-overview-policy).

The project is under development and has no public release yet. All 70 inventoried Apigee X documentation pages have been assessed, including supplemental load-balancing and proxy-bundle examples; 23 retain explicit documentation or modeling gaps in `data/sources.json`. Rules apply only to reviewed contexts, so an unsupported element is not automatically treated as invalid.

## Intended scope

- Policy XML and proxy bundle base, proxy endpoint, target endpoint, and flow configuration.
- XML syntax, unknown or misplaced elements, unknown or required attributes and children, verified fixed values or formats, and documented child cardinality.
- Local policy references in flow steps are checked against policy XML names within the same proxy bundle.
- Suggestions for child elements, attributes, and documented fixed attribute or element-text values.

Apigee Edge, hybrid-only behavior, XSLT resources, and arbitrary XML payloads are outside the scope.

## Development

Run `npm install`, then `npm run check` and `npm run build`. Press F5 in VS Code to launch the Extension Development Host. Open an Apigee proxy bundle and edit an XML file under `apiproxy`.

Run `npm exec -- vsce package --no-dependencies` to create a local VSIX. The runtime is bundled into one file, so production dependencies are not copied into the package. This does not publish the extension. `npm run docs:status` shows review progress; `npm run release:check` verifies inventory status and reviewed-data integrity, but does not resolve documented gaps or replace final performance and editor checks. The extension never fetches documentation at runtime.

## Documentation maintenance

1. Run `npm run docs:refresh` to compare current Google documentation with the saved section hashes, then `npm run docs:discover` to add newly indexed pages.
2. Run `npm run docs:extract` and `npm run docs:propose`. The extractor captures sections, tables, XML example names, and possible value or format hints. Raw candidates are local-only; proposals in `data/proposals` are explicitly unreviewed and never shipped in the VSIX.
3. Review each proposal against its linked official page. Copy only confirmed Apigee X facts into `data/reviewed`, including element ancestry, attribute and child names, requiredness, fixed values or formats, and a source link. Set `complete` to `false` wherever that context is not exhaustively reviewed. Record page review status and gaps in `data/sources.json`.
4. Run `npm run check`; with candidates present, it also checks documentation anchors. The section-hash baseline in `data/source-hashes.json` changes only on extraction, not on refresh.

Official pages sometimes cover both Apigee and Apigee hybrid or link to Edge documentation. That does not imply a feature is valid for Apigee X. Archived policy schemas are supplementary, not authoritative.

Diagnostic IDs: `AX001` XML syntax, `AX101` unknown element or wrong root, `AX102` misplaced element, `AX103` unknown attribute, `AX104` missing required attribute or child, `AX105` invalid fixed value, `AX106` invalid documented format, `AX107` invalid child cardinality or duplicate flow name, and `AX108` missing local bundle reference.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `apigeeXLinter.enabled` | `true` | Turn diagnostics and completion on or off. |
| `apigeeXLinter.exclude` | `[]` | Exclude matching XML paths. |
| `apigeeXLinter.ignore` | `[]` | Suppress selected diagnostic rule IDs. |

## License

MIT. This is an independent community project and is not affiliated with Google.
