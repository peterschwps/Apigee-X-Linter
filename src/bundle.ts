import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { LintIssue } from './linter';
import { parseXml, type XmlNode } from './xml';

const flowNameSource = 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/flow-configuration-reference#name';
const resourceSource = 'https://docs.cloud.google.com/apigee/docs/api-platform/develop/resource-files#where-resources-are-stored';

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

async function localResourceIssue(root: XmlNode, xml: string, directory: string): Promise<LintIssue[]> {
  const element = root.name === 'OASValidation' ? 'OASResource'
    : root.name === 'MessageValidation' ? 'ResourceURL' : undefined;
  if (!element) return [];
  const reference = root.children.find(child => child.name === element);
  const text = reference && childText(reference, xml);
  if (!text || /\{[^{}]+\}/.test(text.value)) return [];
  const match = /^(oas|xsd|wsdl):\/\/([^/\\]+)$/.exec(text.value);
  if (!match || root.name === 'OASValidation' && match[1] !== 'oas'
    || root.name === 'MessageValidation' && match[1] === 'oas') return [];
  try {
    const files = await readdir(path.join(directory, 'resources', match[1]));
    if (files.includes(match[2])) return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return [];
  }
  return [{ rule: 'AX109', message: `Resource "${match[2]}" is not in this proxy bundle; it may exist at environment scope.`,
    start: text.start, end: text.end, source: resourceSource, severity: 'warning' }];
}

export async function lintBundleReferences(xml: string, filePath: string): Promise<LintIssue[]> {
  const rootDirectory = findBundleRoot(filePath);
  if (!rootDirectory) return [];
  const document = parseXml(xml);
  if (document.syntaxIssues.length || !document.root) return [];
  if (document.root.name === 'OASValidation' || document.root.name === 'MessageValidation') {
    return localResourceIssue(document.root, xml, rootDirectory);
  }
  if (!['ProxyEndpoint', 'TargetEndpoint'].includes(document.root.name)) return [];

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
