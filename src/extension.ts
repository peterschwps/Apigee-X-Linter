import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { complete } from './completion';
import { bundlePolicyNames, lintBundleReferences } from './bundle';
import { disableDirectiveEdit } from './fixes';
import { classifyDocument, lint, type DocumentKind, type LintIssue } from './linter';
import { loadSpecifications, type DocumentSpec } from './spec';
import { rootElementName } from './xml';

const setting = 'apigeeXLinter';
const diagnosticSource = 'Apigee X Linter';
const delayMs = 250;
const stepDocuments: ReadonlySet<DocumentKind | undefined> = new Set(['proxyEndpoint', 'targetEndpoint', 'sharedFlow']);

function applicable(document: vscode.TextDocument, specs: DocumentSpec[]): boolean {
  if (document.languageId !== 'xml' || document.uri.scheme !== 'file') return false;
  const config = vscode.workspace.getConfiguration(setting, document.uri);
  if (!config.get<boolean>('enabled', true)) return false;
  const relative = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
  if (config.get<string[]>('exclude', []).some(pattern => minimatch(relative, pattern, { dot: true }))) return false;
  if (classifyDocument(document.uri.fsPath)) return true;
  const root = rootElementName(document.getText());
  return Boolean(root && specs.some(spec => spec.root === root));
}

export function activate(context: vscode.ExtensionContext): void {
  const specs = loadSpecifications(context.extensionPath);
  const diagnostics = vscode.languages.createDiagnosticCollection('apigee-x');
  const log = vscode.window.createOutputChannel('Apigee X Linter', { log: true });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Published issues keep fix data that VS Code diagnostics cannot carry.
  const published = new Map<string, { version: number; issues: LintIssue[] }>();
  context.subscriptions.push(diagnostics, log);

  function clear(uri: vscode.Uri): void {
    diagnostics.delete(uri);
    published.delete(uri.toString());
  }

  async function update(document: vscode.TextDocument): Promise<void> {
    if (!applicable(document, specs)) {
      clear(document.uri);
      return;
    }
    const ignored = new Set(vscode.workspace.getConfiguration(setting, document.uri).get<string[]>('ignore', []));
    const version = document.version;
    const xml = document.getText();
    const results = lint(xml, document.uri.fsPath, specs, ignored);
    const bundleResults = await lintBundleReferences(xml, document.uri.fsPath);
    // The document may have changed, closed, or become excluded while bundle files were read.
    if (document.isClosed || document.version !== version || !applicable(document, specs)) return;
    results.push(...bundleResults.filter(issue => !ignored.has(issue.rule)));
    diagnostics.set(document.uri, results.map(issue => {
      const range = new vscode.Range(document.positionAt(issue.start), document.positionAt(issue.end));
      const severity = issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
      diagnostic.source = diagnosticSource;
      diagnostic.code = issue.source
        ? { value: issue.rule, target: vscode.Uri.parse(issue.source) }
        : issue.rule;
      return diagnostic;
    }));
    published.set(document.uri.toString(), { version, issues: results });
  }

  function quickFixes(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, issues: LintIssue[]): vscode.CodeAction[] {
    const rule = typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code);
    const issue = issues.find(item => item.rule === rule && item.start === document.offsetAt(diagnostic.range.start));
    if (!issue) return [];
    const actions: vscode.CodeAction[] = [];
    if (issue.replacement) {
      const action = new vscode.CodeAction(`Change to "${issue.replacement}"`, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, diagnostic.range, issue.replacement);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      actions.push(action);
    }
    const directive = disableDirectiveEdit(document.getText(), issue.start, issue.rule);
    if (directive) {
      const action = new vscode.CodeAction(`Disable ${issue.rule} for this line`, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, new vscode.Range(document.positionAt(directive.start), document.positionAt(directive.end)), directive.text);
      action.diagnostics = [diagnostic];
      actions.push(action);
    }
    return actions;
  }

  function schedule(document: vscode.TextDocument, delay = delayMs): void {
    const key = document.uri.toString();
    const previous = timers.get(key);
    if (previous) clearTimeout(previous);
    const version = document.version;
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      if (document.version !== version) return;
      update(document).catch((error: unknown) => log.error(`Linting ${document.uri.fsPath} failed:`, error));
    }, delay));
  }

  const referenceWatcher = vscode.workspace.createFileSystemWatcher('**/{apiproxy,sharedflowbundle}/{policies,targets}/*.xml');
  const resourceWatcher = vscode.workspace.createFileSystemWatcher('**/{apiproxy,sharedflowbundle}/resources/{oas,xsd,wsdl}/*');
  const refreshEndpoints = () => {
    for (const document of vscode.workspace.textDocuments) {
      if (stepDocuments.has(classifyDocument(document.uri.fsPath))) schedule(document);
    }
  };
  const refreshResourcePolicies = () => {
    for (const document of vscode.workspace.textDocuments) {
      if (classifyDocument(document.uri.fsPath) === 'policy') schedule(document);
    }
  };

  context.subscriptions.push(
    referenceWatcher,
    resourceWatcher,
    referenceWatcher.onDidCreate(refreshEndpoints),
    referenceWatcher.onDidChange(refreshEndpoints),
    referenceWatcher.onDidDelete(refreshEndpoints),
    resourceWatcher.onDidCreate(refreshResourcePolicies),
    resourceWatcher.onDidChange(refreshResourcePolicies),
    resourceWatcher.onDidDelete(refreshResourcePolicies),
    vscode.workspace.onDidOpenTextDocument(document => schedule(document, 0)),
    vscode.workspace.onDidChangeTextDocument(event => schedule(event.document)),
    vscode.workspace.onDidSaveTextDocument(document => schedule(document, 0)),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString();
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.delete(key);
      clear(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(setting)) {
        for (const document of vscode.workspace.textDocuments) schedule(document, 0);
      }
    }),
    vscode.languages.registerCompletionItemProvider({ language: 'xml', scheme: 'file' }, {
      async provideCompletionItems(document, position) {
        if (!applicable(document, specs)) return [];
        const xml = document.getText();
        const offset = document.offsetAt(position);
        // ponytail: reads the policies directory per request; cache per bundle if large bundles feel slow.
        const policyNames = stepDocuments.has(classifyDocument(document.uri.fsPath)) ? await bundlePolicyNames(document.uri.fsPath) : [];
        return complete(xml, offset, document.uri.fsPath, specs, policyNames).map(suggestion => {
          const kind = suggestion.kind === 'element' ? vscode.CompletionItemKind.Class
            : suggestion.kind === 'attribute' ? vscode.CompletionItemKind.Property
              : vscode.CompletionItemKind.Value;
          const item = new vscode.CompletionItem(suggestion.label, kind);
          item.range = new vscode.Range(document.positionAt(suggestion.replaceStart), document.positionAt(suggestion.replaceEnd));
          item.insertText = suggestion.kind === 'attribute'
            ? new vscode.SnippetString(`${suggestion.label}="$1"`)
            : suggestion.insertText;
          if (suggestion.source) item.documentation = new vscode.MarkdownString(`[Google Apigee reference](${suggestion.source})`);
          return item;
        });
      },
    }, '<', ' ', '=', '"', "'", '>'),
    vscode.languages.registerCodeActionsProvider({ language: 'xml', scheme: 'file' }, {
      provideCodeActions(document, _range, codeActionContext) {
        const current = published.get(document.uri.toString());
        if (!current || current.version !== document.version) return [];
        return codeActionContext.diagnostics
          .filter(diagnostic => diagnostic.source === diagnosticSource)
          .flatMap(diagnostic => quickFixes(document, diagnostic, current.issues));
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    { dispose: () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } },
  );

  for (const document of vscode.workspace.textDocuments) schedule(document, 0);
}

export function deactivate(): void {
  // Resources are disposed through the extension context.
}
