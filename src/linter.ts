import { isIP } from 'node:net';
import { elementMap, normalizeEnumValue, type DocumentSpec, type ElementSpec, type ValueSpec } from './spec';
import { parseXml, type XmlNode } from './xml';

export type LintIssue = {
  rule: string;
  message: string;
  start: number;
  end: number;
  source?: string;
  severity?: 'error' | 'warning';
};

export type DocumentKind = DocumentSpec['kind'];

export function classifyDocument(filePath: string): DocumentKind | undefined {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (/\/apiproxy\/policies\/[^/]+\.xml$/.test(normalized)) return 'policy';
  if (/\/apiproxy\/proxies\/[^/]+\.xml$/.test(normalized)) return 'proxyEndpoint';
  if (/\/apiproxy\/targets\/[^/]+\.xml$/.test(normalized)) return 'targetEndpoint';
  if (/\/apiproxy\/integration-endpoints\/[^/]+\.xml$/.test(normalized)) return 'integrationEndpoint';
  if (/\/apiproxy\/[^/]+\.xml$/.test(normalized)) return 'apiProxy';
  return undefined;
}

export function chooseSpec(filePath: string, rootName: string, specs: DocumentSpec[]): DocumentSpec | undefined {
  const kind = classifyDocument(filePath);
  if (kind) return specs.find(spec => spec.kind === kind && spec.root === rootName);
  return specs.find(spec => spec.root === rootName);
}

function valueIssue(value: string, rule: ValueSpec, start: number, end: number, source: string): LintIssue | undefined {
  if (rule.allowTemplate && /\{[^{}]+\}/.test(value)) return undefined;
  if (rule.kind === 'enum' && rule.values && !rule.values.some(candidate => normalizeEnumValue(candidate, rule) === normalizeEnumValue(value, rule))) {
    return { rule: 'AX105', message: `Expected one of: ${rule.values.join(', ')}.`, start, end, source };
  }
  if (rule.kind === 'format' && rule.pattern && !new RegExp(rule.pattern).test(value)) {
    return { rule: 'AX106', message: rule.format || 'Value does not match the documented format.', start, end, source };
  }
  if (rule.kind === 'format' && rule.formatType === 'ip' && isIP(value) === 0) {
    return { rule: 'AX106', message: rule.format || 'Value is not a valid IP address.', start, end, source };
  }
  if (rule.warningValues?.[value]) {
    return { rule: 'AX110', message: rule.warningValues[value], start, end, source, severity: 'warning' };
  }
  return undefined;
}

function checkNode(node: XmlNode, rules: Map<string, ElementSpec>, knownNames: ReadonlySet<string>, path: string, xml: string, checkRequired: boolean, issues: LintIssue[]): void {
  const definition = rules.get(path);
  if (!definition) return;
  const attributes = definition.attributes || {};
  const presentAttributes = new Set(node.attributes.map(attribute => attribute.name));
  if (definition.warning) {
    issues.push({ rule: 'AX110', message: definition.warning, start: node.nameStart, end: node.nameEnd, source: definition.source, severity: 'warning' });
  }

  for (const attribute of node.attributes) {
    const attributeRule = attributes[attribute.name];
    if (!attributeRule) {
      if (definition.complete && !definition.allowAnyAttributes && attribute.name !== 'xmlns' && !attribute.name.startsWith('xmlns:')) {
        issues.push({ rule: 'AX103', message: `Unknown attribute "${attribute.name}" on <${node.name}>.`, start: attribute.start, end: attribute.end, source: definition.source });
      }
      continue;
    }
    if (attribute.value !== undefined && attribute.valueStart !== undefined && attribute.valueEnd !== undefined) {
      const issue = valueIssue(attribute.value, attributeRule, attribute.valueStart, attribute.valueEnd, attributeRule.source || definition.source);
      if (issue) issues.push(issue);
    }
  }

  if (checkRequired) {
    for (const [name, attribute] of Object.entries(attributes)) {
      if (attribute.required && !presentAttributes.has(name)) {
        issues.push({ rule: 'AX104', message: `Missing required attribute "${name}" on <${node.name}>.`, start: node.nameStart, end: node.nameEnd, source: attribute.source || definition.source });
      }
    }
    for (const child of definition.requiredChildren || []) {
      if (!node.children.some(item => item.name === child)) {
        issues.push({ rule: 'AX104', message: `Missing required <${child}> inside <${node.name}>.`, start: node.nameStart, end: node.nameEnd, source: definition.source });
      }
    }
    for (const group of definition.childGroups || []) {
      const matching = node.children.filter(child => group.children.includes(child.name));
      if (group.min !== undefined && matching.length < group.min) {
        issues.push({ rule: 'AX107', message: `Expected at least ${group.min} of: ${group.children.join(', ')}.`, start: node.nameStart, end: node.nameEnd, source: group.source });
      }
      if (group.max !== undefined && matching.length > group.max) {
        const excess = matching[group.max];
        issues.push({ rule: 'AX107', message: `Expected at most ${group.max} of: ${group.children.join(', ')}.`, start: excess.nameStart, end: excess.nameEnd, source: group.source });
      }
    }
    for (const group of definition.attributeGroups || []) {
      const matching = node.attributes.filter(attribute => group.attributes.includes(attribute.name));
      if (group.min !== undefined && matching.length < group.min) {
        issues.push({ rule: 'AX107', message: `Expected at least ${group.min} of attributes: ${group.attributes.join(', ')}.`, start: node.nameStart, end: node.nameEnd, source: group.source });
      }
      if (group.max !== undefined && matching.length > group.max) {
        const excess = matching[group.max];
        issues.push({ rule: 'AX107', message: `Expected at most ${group.max} of attributes: ${group.attributes.join(', ')}.`, start: excess.start, end: excess.end, source: group.source });
      }
    }
    for (const name of definition.singleChildren || []) {
      const matching = node.children.filter(child => child.name === name);
      if (matching.length > 1) {
        issues.push({ rule: 'AX107', message: `Only one <${name}> is allowed inside <${node.name}>.`, start: matching[1].nameStart, end: matching[1].nameEnd, source: definition.source });
      }
    }
    const unique = definition.uniqueChildAttribute;
    if (unique) {
      const seen = new Set<string>();
      for (const child of node.children.filter(item => item.name === unique.child)) {
        const value = child.attributes.find(attribute => attribute.name === unique.attribute);
        if (!value?.value) continue;
        if (seen.has(value.value)) {
          issues.push({ rule: 'AX107', message: `Duplicate ${unique.child} ${unique.attribute} "${value.value}".`, start: value.valueStart ?? child.nameStart, end: value.valueEnd ?? child.nameEnd, source: unique.source });
        }
        seen.add(value.value);
      }
    }
    const textLimit = definition.childTextLimit;
    if (textLimit) {
      let count = 0;
      for (const child of node.children.filter(item => item.name === textLimit.child)) {
        for (const nested of child.children.filter(item => item.name === textLimit.descendant)) {
          if (nested.startTagEnd === undefined || nested.endTagStart === undefined) continue;
          if (xml.slice(nested.startTagEnd, nested.endTagStart).trim() !== textLimit.value) continue;
          count++;
          if (count > textLimit.max) {
            issues.push({ rule: 'AX107', message: `At most ${textLimit.max} <${textLimit.child}> may have <${textLimit.descendant}>${textLimit.value}</${textLimit.descendant}>.`, start: nested.nameStart, end: nested.nameEnd, source: textLimit.source });
          }
        }
      }
    }
    for (const condition of definition.conditionalRequiredChildren || []) {
      let selected: XmlNode | undefined = node;
      for (const name of condition.selector) selected = selected?.children.find(child => child.name === name);
      if (!selected) continue;
      if (condition.values) {
        if (selected.startTagEnd === undefined || selected.endTagStart === undefined) continue;
        const value = xml.slice(selected.startTagEnd, selected.endTagStart).trim();
        if (!condition.values.includes(value)) continue;
      }
      if (!node.children.some(child => child.name === condition.required)) {
        issues.push({ rule: 'AX104', message: `<${condition.required}> is required when <${condition.selector.join('/')}> has this value.`, start: node.nameStart, end: node.nameEnd, source: condition.source });
      }
    }
    for (const conflict of definition.conflicts || []) {
      const first = conflict.attribute
        ? node.attributes.find(attribute => attribute.name === conflict.attribute)
        : node.children.find(child => child.name === conflict.child);
      const second = node.children.find(child => child.name === conflict.withChild);
      if (first && second) {
        const label = conflict.attribute ? `attribute "${conflict.attribute}"` : `<${conflict.child}>`;
        issues.push({ rule: 'AX107', message: `${label} cannot be combined with <${conflict.withChild}>.`, start: second.nameStart, end: second.nameEnd, source: conflict.source });
      }
    }
  }

  const selector = definition.textByAttribute;
  const selectorValue = node.attributes.find(attribute => attribute.name === selector?.attribute)?.value;
  const textRule = selectorValue ? selector?.values[selectorValue] || definition.text : definition.text;
  if (textRule && node.startTagEnd !== undefined && node.endTagStart !== undefined && !node.children.length) {
    const raw = xml.slice(node.startTagEnd, node.endTagStart);
    const value = raw.trim();
    if (value) {
      const relativeStart = raw.indexOf(value);
      const start = node.startTagEnd + relativeStart;
      const issue = valueIssue(value, textRule, start, start + value.length, definition.source);
      if (issue) issues.push(issue);
    }
  }

  for (const child of node.children) {
    const childPath = `${path}/${child.name}`;
    if (!rules.has(childPath) && definition.complete && !definition.allowAnyChildren && !(definition.children || []).includes(child.name)) {
      const misplaced = knownNames.has(child.name);
      issues.push({
        rule: misplaced ? 'AX102' : 'AX101',
        message: misplaced ? `<${child.name}> is not allowed inside <${node.name}>.` : `Unknown element <${child.name}> inside <${node.name}>.`,
        start: child.nameStart, end: child.nameEnd, source: definition.source,
      });
    } else {
      checkNode(child, rules, knownNames, childPath, xml, checkRequired, issues);
    }
  }
}

export function lint(xml: string, filePath: string, specs: DocumentSpec[], ignoredRules: ReadonlySet<string> = new Set()): LintIssue[] {
  const parsed = parseXml(xml);
  const issues: LintIssue[] = parsed.syntaxIssues.map(issue => ({ rule: 'AX001', ...issue }));
  const root = parsed.root;
  if (!root) return issues.filter(issue => !ignoredRules.has(issue.rule));
  const kind = classifyDocument(filePath);
  const spec = chooseSpec(filePath, root.name, specs);
  if (!spec) {
    const expectedRoot: Partial<Record<DocumentKind, string>> = {
      apiProxy: 'APIProxy', proxyEndpoint: 'ProxyEndpoint', targetEndpoint: 'TargetEndpoint', integrationEndpoint: 'IntegrationEndpoint',
    };
    if (kind && expectedRoot[kind]) {
      issues.push({ rule: 'AX101', message: `Expected <${expectedRoot[kind]}> as the document root.`, start: root.nameStart, end: root.nameEnd });
    }
    return issues.filter(issue => !ignoredRules.has(issue.rule));
  }
  const rules = elementMap(spec);
  const knownNames = new Set(spec.elements.map(element => element.path.slice(element.path.lastIndexOf('/') + 1)));
  checkNode(root, rules, knownNames, `/${root.name}`, xml, !parsed.syntaxIssues.length, issues);
  return issues.filter(issue => !ignoredRules.has(issue.rule));
}
