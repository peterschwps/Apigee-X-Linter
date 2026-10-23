import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyDirectives } from './directives';
import type { LintIssue } from './linter';
import { parseXml, type XmlNode, type XmlText } from './xml';

const flowNameSource = 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/flow-configuration-reference#name';
const resourceSource = 'https://docs.cloud.google.com/apigee/docs/api-platform/develop/resource-files#where-resources-are-stored';
const routeTargetSource = 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/api-proxy-configuration-reference#proxyendpoint-howtoconfigurerouterules';
const referencePattern = /^[A-Za-z0-9._$ %\-]+$/;

function findBundleRoot(filePath: string): string | undefined {
  let directory = path.dirname(filePath);
  while (path.dirname(directory) !== directory) {
    if (['apiproxy', 'sharedflowbundle'].includes(path.basename(directory).toLowerCase())) return directory;
    directory = path.dirname(directory);
  }
  return undefined;
}

/** Reads the root name attribute of each XML file in a bundle directory, optionally adding the file names. */
async function bundleNames(directory: string, includeFileNames = false): Promise<Set<string> | undefined> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.xml'));
    const names = await Promise.all(files.map(async entry => {
      const fileNames = includeFileNames ? [entry.name.slice(0, -'.xml'.length)] : [];
      try {
        const root = parseXml(await readFile(path.join(directory, entry.name), 'utf8')).root;
        const name = root?.attributes.find(attribute => attribute.name === 'name')?.value;
        return name ? [name, ...fileNames] : fileNames;
      } catch { return fileNames; }
    }));
    return new Set(names.flat());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    return undefined;
  }
}

async function localResourceIssue(root: XmlNode, directory: string): Promise<LintIssue[]> {
  const element = root.name === 'OASValidation' ? 'OASResource'
    : root.name === 'MessageValidation' ? 'ResourceURL' : undefined;
  if (!element) return [];
  const reference = root.children.find(child => child.name === element);
  const text = reference?.text;
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
  return [{ rule: 'AX109', message: `Resource "${match[2]}" is not in this bundle; it may exist at environment scope.`,
    start: text.start, end: text.end, source: resourceSource, severity: 'warning' }];
}

/** Returns the sorted policy names of the bundle containing the file, or none outside a bundle. */
export async function bundlePolicyNames(filePath: string): Promise<string[]> {
  const rootDirectory = findBundleRoot(filePath);
  const names = rootDirectory && await bundleNames(path.join(rootDirectory, 'policies'));
  return names ? [...names].sort() : [];
}

export async function lintBundleReferences(xml: string, filePath: string): Promise<LintIssue[]> {
  const rootDirectory = findBundleRoot(filePath);
  if (!rootDirectory) return [];
  const document = parseXml(xml);
  if (document.syntaxIssues.length || !document.root) return [];
  if (document.root.name === 'OASValidation' || document.root.name === 'MessageValidation') {
    return applyDirectives(xml, document.comments, await localResourceIssue(document.root, rootDirectory));
  }
  if (!['ProxyEndpoint', 'TargetEndpoint', 'SharedFlow'].includes(document.root.name)) return [];

  // Collect static policy and target endpoint references; templates and other values are skipped.
  const steps: XmlText[] = [];
  const targets: XmlText[] = [];
  function visit(node: XmlNode, parent?: XmlNode): void {
    const reference = node.text;
    if (reference && referencePattern.test(reference.value)) {
      if (node.name === 'Name' && parent?.name === 'Step') steps.push(reference);
      if (node.name === 'TargetEndpoint' && parent?.name === 'RouteRule') targets.push(reference);
    }
    for (const child of node.children) visit(child, node);
  }
  visit(document.root);

  const issues: LintIssue[] = [];
  const policies = steps.length ? await bundleNames(path.join(rootDirectory, 'policies')) : undefined;
  for (const reference of steps.filter(step => policies && !policies.has(step.value))) {
    issues.push({ rule: 'AX108', message: `Policy "${reference.value}" was not found in this bundle.`,
      start: reference.start, end: reference.end, source: flowNameSource });
  }
  // Google references targets by name attribute and by file name, so either one satisfies a RouteRule.
  const endpoints = targets.length ? await bundleNames(path.join(rootDirectory, 'targets'), true) : undefined;
  for (const reference of targets.filter(target => endpoints && !endpoints.has(target.value))) {
    issues.push({ rule: 'AX111', message: `Target endpoint "${reference.value}" was not found in this proxy bundle.`,
      start: reference.start, end: reference.end, source: routeTargetSource });
  }
  return applyDirectives(xml, document.comments, issues);
}
