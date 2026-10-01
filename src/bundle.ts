import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { LintIssue } from './linter';
import { parseXml, type XmlNode } from './xml';

const flowNameSource = 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/flow-configuration-reference#name';

function findBundleRoot(filePath: string): string | undefined {
  let directory = path.dirname(filePath);
  while (path.dirname(directory) !== directory) {
    if (path.basename(directory).toLowerCase() === 'apiproxy') return directory;
    directory = path.dirname(directory);
  }
  return undefined;
}

function childText(node: XmlNode, xml: string): { value: string; start: number; end: number } | undefined {
  if (node.startTagEnd === undefined || node.endTagStart === undefined || node.children.length) return undefined;
  const raw = xml.slice(node.startTagEnd, node.endTagStart);
  const value = raw.trim();
  if (!value) return undefined;
  const start = node.startTagEnd + raw.indexOf(value);
  return { value, start, end: start + value.length };
}

async function policyNames(directory: string): Promise<Set<string> | undefined> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.xml'));
    const names = await Promise.all(files.map(async entry => {
      try {
        const policy = parseXml(await readFile(path.join(directory, entry.name), 'utf8')).root;
        return policy?.attributes.find(attribute => attribute.name === 'name')?.value;
      } catch { return undefined; }
    }));
    return new Set(names.filter((name): name is string => Boolean(name)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    return undefined;
  }
}

export async function lintBundleReferences(xml: string, filePath: string): Promise<LintIssue[]> {
  const rootDirectory = findBundleRoot(filePath);
  if (!rootDirectory) return [];
  const document = parseXml(xml);
  if (document.syntaxIssues.length || !document.root || !['ProxyEndpoint', 'TargetEndpoint'].includes(document.root.name)) return [];

  const references: { value: string; start: number; end: number }[] = [];
  function visit(node: XmlNode, parent?: XmlNode): void {
    if (node.name === 'Name' && parent?.name === 'Step') {
      const reference = childText(node, xml);
      if (reference && /^[A-Za-z0-9._$ %\-]+$/.test(reference.value)) references.push(reference);
    }
    for (const child of node.children) visit(child, node);
  }
  visit(document.root);

  if (!references.length) return [];
  const names = await policyNames(path.join(rootDirectory, 'policies'));
  if (!names) return [];
  return references.filter(reference => !names.has(reference.value)).map(reference => ({
    rule: 'AX108', message: `Policy "${reference.value}" was not found in this proxy bundle.`,
    start: reference.start, end: reference.end, source: flowNameSource,
  }));
}
