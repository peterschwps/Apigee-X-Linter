import { chooseSpec, classifyDocument } from './linter';
import { elementMap, normalizeEnumValue, type DocumentSpec } from './spec';

export type Suggestion = {
  label: string;
  kind: 'element' | 'attribute' | 'value';
  replaceStart: number;
  replaceEnd: number;
  insertText: string;
  source?: string;
};

type CursorContext = { stack: string[]; partialTag?: string };

function scanToCursor(xml: string, offset: number): CursorContext {
  const stack: string[] = [];
  for (let index = 0; index < offset;) {
    if (xml[index] !== '<') { index++; continue; }
    const special = xml.startsWith('<!--', index) ? '-->'
      : xml.startsWith('<![CDATA[', index) ? ']]>'
      : xml.startsWith('<?', index) ? '?>'
      : xml.startsWith('<!', index) ? '>' : undefined;
    if (special) {
      const end = xml.indexOf(special, index + 2);
      if (end < 0 || end + special.length > offset) return { stack };
      index = end + special.length;
      continue;
    }
    let end = index + 1;
    let quote: string | undefined;
    while (end < offset) {
      const char = xml[end];
      if (quote) {
        if (char === quote) quote = undefined;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
      end++;
    }
    if (end >= offset) return { stack, partialTag: xml.slice(index, offset) };
    const tag = xml.slice(index, end + 1);
    const match = tag.match(/^<\s*(\/?)\s*([A-Za-z_][\w:.-]*)/);
    if (match) {
      if (match[1]) {
        const matching = stack.lastIndexOf(match[2]);
        if (matching >= 0) stack.splice(matching);
      } else if (!/\/\s*>$/.test(tag)) {
        stack.push(match[2]);
      }
    }
    index = end + 1;
  }
  return { stack };
}

function candidateSpec(filePath: string, stack: string[], specs: DocumentSpec[]): DocumentSpec | undefined {
  if (!stack.length) return undefined;
  return chooseSpec(filePath, stack[0], specs);
}

export function complete(xml: string, offset: number, filePath: string, specs: DocumentSpec[]): Suggestion[] {
  const before = xml.slice(0, offset);
  const context = scanToCursor(xml, offset);
  const partial = context.partialTag;
  if (partial) {
    if (/^<\s*\//.test(partial) || /^<!|^<\?/.test(partial)) return [];
    const elementPrefix = partial.match(/^<\s*([A-Za-z_][\w:.-]*)?$/);
    if (elementPrefix) {
      const typed = elementPrefix[1] || '';
      const parent = candidateSpec(filePath, context.stack, specs);
      let choices: { name: string; source?: string }[] = [];
      if (parent) {
        const path = `/${context.stack.join('/')}`;
        const parentRule = elementMap(parent).get(path);
        choices = (parentRule?.children || []).map(name => ({ name, source: parentRule?.source }));
      } else if (!context.stack.length) {
        const kind = classifyDocument(filePath);
        choices = specs.filter(spec => !kind || spec.kind === kind).map(spec => ({ name: spec.root, source: spec.source }));
      }
      return choices.filter(choice => choice.name.startsWith(typed)).map(choice => ({
        label: choice.name, kind: 'element', replaceStart: offset - typed.length, replaceEnd: offset,
        insertText: choice.name, source: choice.source,
      }));
    }

    const tagName = partial.match(/^<\s*([A-Za-z_][\w:.-]*)\b/);
    if (!tagName) return [];
    const spec = candidateSpec(filePath, [...context.stack, tagName[1]], specs);
    const path = `/${[...context.stack, tagName[1]].join('/')}`;
    const element = spec && elementMap(spec).get(path);
    if (!element) return [];
    const valueMatch = partial.match(/([A-Za-z_][\w:.-]*)\s*=\s*(["'])([^"']*)$/);
    if (valueMatch) {
      const rule = element.attributes?.[valueMatch[1]];
      if (rule?.kind !== 'enum' || !rule.values) return [];
      const typed = valueMatch[3];
      return rule.values.filter(value => normalizeEnumValue(value, rule).startsWith(normalizeEnumValue(typed, rule))).map(value => ({
        label: value, kind: 'value', replaceStart: offset - typed.length, replaceEnd: offset,
        insertText: value, source: rule.source || element.source,
      }));
    }
    const typed = partial.match(/([A-Za-z_][\w:.-]*)$/)?.[1] || '';
    const used = new Set([...partial.matchAll(/\b([A-Za-z_][\w:.-]*)\s*=/g)].map(match => match[1]));
    return Object.keys(element.attributes || {})
      .filter(name => name.startsWith(typed) && !used.has(name))
      .map(name => ({
        label: name, kind: 'attribute', replaceStart: offset - typed.length, replaceEnd: offset,
        insertText: `${name}=""`, source: element.attributes?.[name].source || element.source,
      }));
  }

  const spec = candidateSpec(filePath, context.stack, specs);
  if (!spec) return [];
  const path = `/${context.stack.join('/')}`;
  const element = elementMap(spec).get(path);
  if (element?.text?.kind !== 'enum' || !element.text.values) return [];
  const typed = before.match(/([A-Za-z0-9_-]*)$/)?.[1] || '';
  return element.text.values.filter(value => normalizeEnumValue(value, element.text!).startsWith(normalizeEnumValue(typed, element.text!))).map(value => ({
    label: value, kind: 'value', replaceStart: offset - typed.length, replaceEnd: offset,
    insertText: value, source: element.source,
  }));
}
