# Apigee X Linter

Apigee X Linter provides XML diagnostics and context-aware completion in VS Code. The current alpha is for feedback; it does not replace deployment validation.

## Getting started

Install the local VSIX using **Extensions: Install from VSIX...**, then open a proxy or shared flow bundle. XML files under `apiproxy` or `sharedflowbundle` are recognized by their location; supported policy roots can also be recognized in standalone XML files. Use the Problems panel for diagnostics and Ctrl+Space for suggestions. Inside `<Step><Name>`, suggestions list the policies of the same bundle.

## Diagnostics

| ID | Meaning |
| --- | --- |
| AX001 | XML syntax error |
| AX101 | Unknown element or wrong document root in a reviewed context |
| AX102 | Misplaced element |
| AX103 | Unknown attribute |
| AX104 | Missing required attribute or child |
| AX105 | Invalid documented fixed value |
| AX106 | Invalid documented format |
| AX107 | Invalid cardinality, conflicting configuration, or duplicate flow name |
| AX108 | Missing bundle-local policy reference |
| AX109 | Resource absent locally; it may exist at environment scope (warning) |
| AX110 | Deprecated element or documented X compatibility concern (warning) |
| AX111 | RouteRule target endpoint missing from the proxy bundle |

Checks for unknown elements and attributes apply only to complete reviewed contexts. Some references are incomplete or contradictory. A clean result therefore does not prove that Apigee will accept or correctly execute the proxy.

## Settings

Use VS Code settings or a workspace settings file:

```json
{
  "apigeeXLinter.enabled": true,
  "apigeeXLinter.exclude": ["**/generated/**"],
  "apigeeXLinter.ignore": []
}
```

Add a diagnostic ID to `ignore` to suppress it everywhere. Source links on diagnostics point to the relevant Google documentation.

## Inline suppression

To suppress diagnostics at one location, put a comment on the line before the reported line:

```xml
<RaiseFault name="RF-Fault">
  <!-- apigee-x-linter disable=AX101 -->
  <Properties/>
</RaiseFault>
```

The comment lists one or more IDs separated by commas, such as `disable=AX101,AX103`. It applies only to the line after the comment ends; other rules on that line are still reported. For a diagnostic on the root element, place the comment before the root. The semantics match apigeelint's `<!-- apigeelint disable=... -->` directive, but each tool only reads its own directive and rule IDs.

## Scope and limitations

The extension covers proxy and shared flow manifests, endpoints, flows, shared flows, and policy XML for Apigee X. FlowCallout references to deployed shared flows are not checked. Edge, hybrid-only features, XSLT resource contents, and arbitrary XML payload contents are excluded. Local resource, policy, and target endpoint references use saved bundle files. A RouteRule target matches a target endpoint's name attribute or its file name. Runtime variables, environment resources, and deployment behavior cannot be fully validated statically.

The source inventory currently has 25 documented gaps. Fixtures checked only by this linter cannot establish the platform's actual behavior.
