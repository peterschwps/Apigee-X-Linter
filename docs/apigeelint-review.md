# apigeelint comparison review

Reviewed on 2026-10-20. Google Cloud Apigee documentation remains authoritative; upstream behavior is supplementary evidence, not a replacement schema.

## Decision

Use apigeelint as an isolated, optional development/CI comparison tool. Do not add it to the VS Code runtime or run it automatically on save.

The published `apigeelint@2.85.1` package exposes `bundleLinter.lint(config, callback)` and a filesystem-oriented CLI. It reads saved whole bundles rather than incomplete editor buffers and does not provide our context-aware completion model. Its `apigeex` profile covers both X and hybrid; the default `apigee` profile targets Edge. Profile-sensitive module state also favors separate CLI processes. Its JavaScript linters and other transitive dependencies are unnecessary for live XML editing. Lifecycle scripts are disabled in the isolated installation.

The upstream project uses Apache-2.0 and describes itself as not an officially supported Google product. No upstream implementation is copied or distributed in this extension. The local extension remains MIT. See the [upstream repository](https://github.com/apigee/apigeelint) for its API, license, and support statement.

## Pinned evidence and coverage

[`data/comparison/apigeelint.json`](https://github.com/peterschwps/apigee-x-linter/blob/main/data/comparison/apigeelint.json) records the published package version and npm integrity, SHA-256 hashes of every plugin source, the separately observed main commit, all rule dispositions, all current source-gap assessments, and the Google sample commit. The published package differs from the checked-out main version; the executable comparison uses the published package only.

| Disposition | Plugins | Treatment |
| --- | ---: | --- |
| Existing overlap | 14 | Retain local position-aware diagnostics; compare behavior. |
| Bundle-rule candidates | 24 | Candidates for individual X documentation review, not approved implementations. |
| Best-practice advice | 39 | Do not silently promote recommendations into errors. |
| Verified divergence or incomplete coverage | 9 | Follow Google documentation and preserve limitations. |
| Out of scope | 4 | JavaScript source linting and legacy-policy deprecation checks. |
| Disabled upstream | 1 | Do not enable implicitly. |

All 91 plugins received catalogue triage. This does **not** mean every candidate's implementation has been exhaustively verified. The original 20 source gaps are mapped to relevant plugins or explicit absence; four newly inventoried guides add Properties-contract gaps, bringing the total to 24. The shared flow bundle reference adds a 25th gap for its manifest and step requiredness. apigeelint does not resolve these documentation gaps. For example, it has no dedicated complete VerifyJWT, SAML, or TraceCapture contract.

## Confirmed differences and corrections

- `PO030` warns about multiple cache-expiry children, while Google documents precedence. Keep the current conservative choice model rather than adding an exclusivity error.
- `PO038` warns about omitted KVM map names, while Google's [KVM reference](https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/key-value-map-operations-policy) defines the `kvmap` default. The same reference deprecates ExclusiveCache: add an AX110 warning, not an invented nested contract.
- `PO044` has an incomplete GenerateJWT child allowlist, and the upstream policy catalogue omits ParsePayload. Neither is suitable as the extension's source of truth.
- `PO034` omits AssignMessage authentication from one allowlist; `PO043` omits documented CommonName TLS configuration. Keep our source-backed contexts.
- Google's [Model Armor tutorial](https://docs.cloud.google.com/apigee/docs/api-platform/tutorials/using-model-armor-policies) supplies ReasonPhrase in FaultResponse/Set; the [RaiseFault reference](https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/raise-fault-policy) delegates those settings to AssignMessage. Add free-text ReasonPhrase to these delegated contexts, including MonetizationLimitsCheck.
- Corrected [ResponseCache troubleshooting examples](https://docs.cloud.google.com/apigee/docs/api-platform/troubleshoot/policies/deployment/responsecache-deployment-errors) retain KeyFragment's `type` attribute. Google's [shared cache-key guide](https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/working-cachekeys) establishes the common structure across all four cache policies. Accept the attribute but do not invent a value enum.
- Current [OAuth examples](https://docs.cloud.google.com/apigee/docs/api-platform/security/oauth/using-access-tokens), [flow basics](https://docs.cloud.google.com/apigee/docs/api-platform/fundamentals/what-are-flows), and [ExtractVariables](https://docs.cloud.google.com/apigee/docs/api-platform/troubleshoot/policies/deployment/extract-variables-deployment-errors)/[Quota troubleshooting](https://docs.cloud.google.com/apigee/docs/api-platform/troubleshoot/policies/deployment/quota-deployment-errors) establish Properties stubs for four more policies. Accept known stubs with `complete: false`; their internal contracts remain gaps.
- Google's [SpikeArrest](https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/spike-arrest-policy#useeffectivecount) and [PromptTokenLimit](https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/prompt-token-limit-policy#useeffectivecount) references contradict their false defaults/examples with unsupported smoothing guidance. Accept both booleans, warn for explicit false, and still reject invalid values. The warning can be ignored using AX110.

## Representative comparison

Eight bundles from [GoogleCloudPlatform/apigee-samples](https://github.com/GoogleCloudPlatform/apigee-samples), pinned at `2b1a9f00fabb4e837c39d80570ff50ebc3b1349e`, cover caching, quotas, OAuth, JWT, Cloud Run, and LLM policies. These are shared X/hybrid examples; selected XML is checked only against our X documentation model. No deployment was attempted, and sample provenance alone does not prove X validity.

| Bundle | XML files | Local before | Local after | apigeelint |
| --- | ---: | ---: | ---: | ---: |
| deploy-apigee-proxy | 3 | 0 | 0 | 2 |
| basic-caching | 8 | 3 | 0 | 2 |
| basic-quota | 6 | 2 | 0 | 0 |
| oauth-client-credentials | 5 | 2 | 0 | 0 |
| authorize-idp-access-tokens | 4 | 0 | 0 | 2 |
| json-web-tokens | 15 | 7 | 1 | 0 |
| cloud-run | 3 | 0 | 0 | 1 |
| llm-token-limits | 9 | 4 | 0 | 2 |
| Total | 53 | 18 | 1 | 9 |

Seventeen compatibility findings were eliminated by source-backed additions. The remaining AX106 is the JWT example's Flow name `unknown request`: Google's flow reference forbids spaces. Do not weaken a documented rule merely to match a sample. The nine upstream findings are TD002/TD012 deployment advice, not additional confirmed XML errors.

Initial measurements on this machine were approximately 1–12 ms of local lint/reference work per bundle and 254–364 ms per cold upstream CLI process. These are different workloads and include different startup/IO costs; they are **not** a comparable speed ratio or a production performance guarantee. The generated report records current timings, slowest documents, and every finding. An isolated VS Code 1.141.0 host loaded the installed VSIX and passed warning severity/suppression, invalid-value error, ReasonPhrase/boolean completion, and valid-XML checks. One edit-to-diagnostic measurement was 325 ms including the configured 250 ms debounce and polling overhead. Large enterprise bundles and deployment behavior remain outside this sample's coverage.

## Reproduce

Run from the repository root with Node.js and Git available:

```powershell
npm install
npm run check
npm install --prefix .cache/apigeelint-runner --no-save --package-lock=false --ignore-scripts --registry=https://registry.npmjs.org apigeelint@2.85.1
git clone https://github.com/GoogleCloudPlatform/apigee-samples.git .cache/apigee-samples
git -C .cache/apigee-samples checkout --detach 2b1a9f00fabb4e837c39d80570ff50ebc3b1349e
npm run compare:apigeelint
```

If the sample directory already exists, reuse it and select the pinned commit only after preserving unrelated local work. Alternate preinstalled package and sample directories can be supplied as positional arguments. The command verifies package version, plugin hashes, and sample HEAD; package integrity is recorded as provenance, not recalculated from installed files. Use an unmodified sample checkout. It performs no downloads or installation itself, runs upstream with `--profile apigeex --norc`, excludes JavaScript resource rules PO013/PO025, and writes `.cache/apigeelint-comparison.json`. It does not execute proxy resources. Installation and comparison do not alter root dependencies.

`npm run comparison:validate` checks complete rule dispositions and current source-gap coverage without the optional upstream installation or samples. It also runs as part of `check` and `release:check`. Neither command treats advisory-count equality as a correctness assertion. The comparison script and audit artefacts are excluded from the VSIX.
