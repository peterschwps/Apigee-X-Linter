import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const source = 'Apigee X Linter';

function workspaceFile(...segments: string[]): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'expected an open workspace folder');
  return vscode.Uri.joinPath(folder.uri, ...segments);
}

function ruleOf(diagnostic: vscode.Diagnostic): string {
  return typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code);
}

function linterDiagnostic(uri: vscode.Uri, rule: string): vscode.Diagnostic | undefined {
  return vscode.languages.getDiagnostics(uri).find(diagnostic => diagnostic.source === source && ruleOf(diagnostic) === rule);
}

async function waitFor<T>(label: string, probe: () => T | undefined | false): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = probe();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function open(...segments: string[]): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(workspaceFile(...segments));
  await vscode.window.showTextDocument(document);
  return document;
}

async function quickFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, title: string): Promise<vscode.CodeAction> {
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', document.uri, diagnostic.range);
  const action = actions.find(item => item.title === title);
  assert.ok(action?.edit, `expected quick fix "${title}" among: ${actions.map(item => item.title).join(', ')}`);
  return action;
}

const tests: [string, () => Promise<void>][] = [
  ['reports AX105 as an error with a documentation link', async () => {
    const document = await open('apiproxy', 'policies', 'FC-Typo.xml');
    const diagnostic = await waitFor('AX105', () => linterDiagnostic(document.uri, 'AX105'));
    assert.equal(diagnostic.severity, vscode.DiagnosticSeverity.Error);
    assert.equal(document.getText(diagnostic.range), 'flase');
    assert.match(diagnostic.message, /Did you mean "false"\?/);
    const target = typeof diagnostic.code === 'object' ? diagnostic.code.target.toString() : '';
    assert.match(target, /^https:\/\/docs\.cloud\.google\.com\/apigee\//);
  }],
  ['quick fix replaces a mistyped enum value', async () => {
    const document = await open('apiproxy', 'policies', 'FC-Typo.xml');
    const diagnostic = await waitFor('AX105', () => linterDiagnostic(document.uri, 'AX105'));
    const action = await quickFix(document, diagnostic, 'Change to "false"');
    assert.ok(await vscode.workspace.applyEdit(action.edit!));
    assert.match(document.getText(), /enabled="false"/);
    await waitFor('AX105 to clear', () => !linterDiagnostic(document.uri, 'AX105') && true);
  }],
  ['quick fix inserts a disable comment that suppresses the diagnostic', async () => {
    const document = await open('apiproxy', 'policies', 'FC-Disable.xml');
    const diagnostic = await waitFor('AX101', () => linterDiagnostic(document.uri, 'AX101'));
    const action = await quickFix(document, diagnostic, 'Disable AX101 for this line');
    assert.ok(await vscode.workspace.applyEdit(action.edit!));
    assert.match(document.getText(), /\n {2}<!-- apigee-x-linter disable=AX101 -->\n {2}<Bogus\/>/);
    await waitFor('AX101 to clear', () => !linterDiagnostic(document.uri, 'AX101') && true);
  }],
  ['completes bundle policy names inside Step/Name', async () => {
    const document = await open('apiproxy', 'proxies', 'default.xml');
    const position = document.positionAt(document.getText().indexOf('<Name>') + '<Name>'.length);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', document.uri, position);
    const labels = list.items.map(item => typeof item.label === 'string' ? item.label : item.label.label);
    assert.ok(labels.includes('FC-Typo') && labels.includes('FC-Disable'), `unexpected completions: ${labels.join(', ')}`);
  }],
];

export async function run(): Promise<void> {
  const failures: string[] = [];
  for (const [name, body] of tests) {
    try {
      await body();
      console.log(`✔ ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`✖ ${name}\n`, error);
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${tests.length} integration tests failed.`);
}
