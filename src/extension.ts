import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { complete } from './completion';
import { classifyDocument, lint } from './linter';
import { loadSpecifications, type DocumentSpec } from './spec';

const setting = 'apigeeXLinter';
const delayMs = 250;

function applicable(document: vscode.TextDocument, specs: DocumentSpec[]): boolean {
  if (document.languageId !== 'xml' || document.uri.scheme !== 'file') return false;
  const config = vscode.workspace.getConfiguration(setting, document.uri);
  if (!config.get<boolean>('enabled', true)) return false;
  const relative = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
  if (config.get<string[]>('exclude', []).some(pattern => minimatch(relative, pattern, { dot: true }))) return false;
  if (classifyDocument(document.uri.fsPath)) return true;
  const root = document.getText().match(/^\s*(?:<\?xml[^>]*>\s*)?<([A-Za-z_][\w:.-]*)/)?.[1];
  return Boolean(root && specs.some(spec => spec.root === root));
}

export function activate(context: vscode.ExtensionContext): void {
  const specs = loadSpecifications(context.extensionPath);
  const diagnostics = vscode.languages.createDiagnosticCollection('apigee-x');
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  context.subscriptions.push(diagnostics);

  function update(document: vscode.TextDocument): void {
    if (!applicable(document, specs)) {
      diagnostics.delete(document.uri);
      return;
    }
    const ignored = new Set(vscode.workspace.getConfiguration(setting, document.uri).get<string[]>('ignore', []));
    const results = lint(document.getText(), document.uri.fsPath, specs, ignored);
    diagnostics.set(document.uri, results.map(issue => {
      const range = new vscode.Range(document.positionAt(issue.start), document.positionAt(issue.end));
      const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Apigee X Linter';
      diagnostic.code = issue.source
        ? { value: issue.rule, target: vscode.Uri.parse(issue.source) }
        : issue.rule;
      return diagnostic;
    }));
  }

  function schedule(document: vscode.TextDocument, delay = delayMs): void {
    const key = document.uri.toString();
    const previous = timers.get(key);
    if (previous) clearTimeout(previous);
    const version = document.version;
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      if (document.version === version) update(document);
    }, delay));
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => schedule(document, 0)),
    vscode.workspace.onDidChangeTextDocument(event => schedule(event.document)),
    vscode.workspace.onDidSaveTextDocument(document => schedule(document, 0)),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString();
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.delete(key);
      diagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(setting)) {
        for (const document of vscode.workspace.textDocuments) schedule(document, 0);
      }
    }),
    vscode.languages.registerCompletionItemProvider({ language: 'xml', scheme: 'file' }, {
      provideCompletionItems(document, position) {
        if (!applicable(document, specs)) return [];
        return complete(document.getText(), document.offsetAt(position), document.uri.fsPath, specs).map(suggestion => {
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
    { dispose: () => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); } },
  );

  for (const document of vscode.workspace.textDocuments) schedule(document, 0);
}

export function deactivate(): void {
  // Resources are disposed through the extension context.
}
