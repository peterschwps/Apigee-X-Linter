import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { normalizeEnumValue, type DocumentSpec, type ValueSpec } from '../src/spec';

type SourceKind = 'policy' | 'core';
type Source = {
  id: string;
  kind: SourceKind;
  title: string;
  url: string;
  reviewStatus?: 'pending' | 'in-progress' | 'reviewed' | 'gap';
  reviewNotes?: string;
};
type CandidateSection = {
  heading: string;
  contextHeading?: string;
  anchor?: string;
  elements: string[];
  exampleElements: string[];
  exampleAttributes: string[];
  syntaxAttributeValues: Record<string, string[]>;
  attributeRows: Record<string, string>[];
  otherTables: { headers: string[]; rows: string[][] }[];
  valueHints: string[];
  formatHints: string[];
  hash: string;
};

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const candidateDir = path.join(dataDir, 'candidates');
const proposalDir = path.join(dataDir, 'proposals');
const sourceFile = path.join(dataDir, 'sources.json');
const baselineFile = path.join(dataDir, 'source-hashes.json');
const policyIndex = 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/reference-overview-policy';
const coreSources: Source[] = [
  { id: 'api-proxy-configuration-reference', kind: 'core', title: 'API proxy configuration reference', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/api-proxy-configuration-reference' },
  { id: 'flow-configuration-reference', kind: 'core', title: 'Flow configuration reference', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/flow-configuration-reference' },
  { id: 'endpoint-properties-reference', kind: 'core', title: 'Endpoint properties reference', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/endpoint-properties-reference' },
  { id: 'load-balancing-across-backend-servers', kind: 'core', title: 'Load balancing across backend servers', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/deploy/load-balancing-across-backend-servers' },
  { id: 'semantic-caching-psc-tutorial', kind: 'core', title: 'Semantic caching with a private endpoint', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/tutorials/using-semantic-caching-policies-psc' },
];
const supplementalPolicies: Source[] = [
  { id: 'generate-saml-assertion-policy', kind: 'policy', title: 'generate saml assertion policy', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/generate-saml-assertion-policy' },
  { id: 'validate-saml-assertion-policy', kind: 'policy', title: 'validate saml assertion policy', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/validate-saml-assertion-policy' },
  { id: 'llm-token-quota-policy', kind: 'policy', title: 'llm token quota policy', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/llm-token-quota-policy' },
  { id: 'parse-payload-policy', kind: 'policy', title: 'parse payload policy', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/parse-payload-policy' },
  { id: 'prompt-token-limit-policy', kind: 'policy', title: 'prompt token limit policy', url: 'https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies/prompt-token-limit-policy' },
];

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fetchHtml(url: string): Promise<string> {
  let lastError: unknown;
  const englishUrl = new URL(url);
  englishUrl.searchParams.set('hl', 'en');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(englishUrl, {
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': 'apigee-x-linter-docs-inventory/0.1 (public documentation review)',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function readSources(): Promise<Source[]> {
  return JSON.parse(await readFile(sourceFile, 'utf8')) as Source[];
}

async function readBaseline(): Promise<Record<string, Record<string, string>>> {
  try {
    return JSON.parse(await readFile(baselineFile, 'utf8')) as Record<string, Record<string, string>>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function discover(): Promise<void> {
  const $ = load(await fetchHtml(policyIndex));
  const body = $('.devsite-article-body').first().length ? $('.devsite-article-body').first() : $('article').first();
  if (!body.length) throw new Error('Policy index article was not found; inspect the current Google Docs layout.');
  const found = new Map<string, Source>();
  body.find('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const url = new URL(href, policyIndex);
    const match = url.pathname.match(/^\/apigee\/docs\/api-platform\/reference\/policies\/([a-z0-9-]+)$/);
    if (!match || ['reference-overview-policy', 'saml-assertion-policy'].includes(match[1])) return;
    const title = match[1].replace(/-/g, ' ');
    url.search = '';
    url.hash = '';
    found.set(match[1], { id: match[1], kind: 'policy', title, url: url.toString() });
  });
  for (const source of supplementalPolicies) found.set(source.id, source);
  let previous: Source[] = [];
  try {
    previous = await readSources();
    for (const source of previous) {
      if (source.kind === 'policy' && source.id !== 'saml-assertion-policy' && !found.has(source.id)) {
        found.set(source.id, source);
        console.warn(`Retained previously discovered page missing from current index: ${source.id}`);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (found.size < 20) throw new Error(`Only ${found.size} policy pages found; inspect index extraction before saving.`);
  const old = new Map(previous.map(source => [source.id, source]));
  const sources = [...coreSources, ...[...found.values()].sort((a, b) => a.id.localeCompare(b.id))]
    .map(source => ({
      ...source,
      reviewStatus: old.get(source.id)?.reviewStatus || 'pending',
      ...(old.get(source.id)?.reviewNotes ? { reviewNotes: old.get(source.id)?.reviewNotes } : {}),
    }));
  const newPages = sources.filter(source => !old.has(source.id));
  await mkdir(dataDir, { recursive: true });
  await writeFile(sourceFile, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`Discovered ${found.size} policy pages and ${coreSources.length} core references; ${newPages.length} new since previous inventory.`);
}

function extractSections(html: string): CandidateSection[] {
  const $ = load(html);
  const body = $('.devsite-article-body').first().length ? $('.devsite-article-body').first() : $('article').first();
  if (!body.length) throw new Error('Documentation article was not found.');
  // Some pages contain malformed HTML that pushes most headings outside the article node.
  const fallback = $('h1,h2,h3,h4').length > body.find('h1,h2,h3,h4').length + 10;
  if (!fallback) body.find('nav, aside, script, style').remove();
  const sections: CandidateSection[] = [];
  let current: CandidateSection | undefined;
  let sectionText: string[] = [];
  let contextHeading: string | undefined;
  let started = !fallback;
  const finish = () => {
    if (!current) return;
    current.valueHints = [...new Set(sectionText.flatMap(text =>
      text.match(/(?:Valid values|Allowed values|Possible values|Select from|One of)[^.]*(?:\.|$)/gi) || []
    ).map(text => text.slice(0, 350)))];
    current.formatHints = [...new Set(sectionText.flatMap(text =>
      text.match(/\b(?:format|pattern|characters? (?:allowed|restricted))\b[^.]*(?:\.|$)/gi) || []
    ).map(text => text.slice(0, 350)))];
    current.hash = digest(`${current.heading}\n${sectionText.join('\n')}\n${JSON.stringify(current.attributeRows)}\n${JSON.stringify(current.otherTables)}`);
    current.exampleElements.sort();
    current.exampleAttributes.sort();
    sections.push(current);
  };
  const blocks = fallback ? $.root().find('h1,h2,h3,h4,p,ul,ol,pre,table') : body.find('h1,h2,h3,h4,p,ul,ol,pre,table');
  blocks.each((_, block) => {
    if ($(block).closest('table').length && block.tagName !== 'table') return;
    const tag = block.tagName.toLowerCase();
    if (fallback && !started) {
      if (tag !== 'h1') return;
      started = true;
    }
    if (fallback && /^h[1-4]$/.test(tag) && normalize($(block).text()) === 'Products and pricing') return false;
    if (/^h[1-4]$/.test(tag)) {
      finish();
      const heading = normalize($(block).text());
      if (!heading) { current = undefined; return; }
      if (/<[A-Za-z][\w.-]*>/.test(heading)) contextHeading = heading;
      current = {
        heading,
        contextHeading,
        anchor: $(block).attr('id') || undefined,
        elements: [...new Set([...heading.matchAll(/<([A-Za-z][\w.-]*)>/g)].map(match => match[1]))],
        exampleElements: [], exampleAttributes: [], syntaxAttributeValues: {},
        attributeRows: [], otherTables: [], valueHints: [], formatHints: [], hash: '',
      };
      sectionText = [];
      return;
    }
    if (!current) return;
    if (tag !== 'table') {
      if (tag === 'pre') {
        const code = $(block).text();
        for (const match of code.matchAll(/<([A-Za-z_][\w:.-]*)(?=[\s/>])([^>]*)>/g)) {
          if (!current.exampleElements.includes(match[1])) current.exampleElements.push(match[1]);
          for (const attribute of match[2].matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g)) {
            if (!current.exampleAttributes.includes(attribute[1])) current.exampleAttributes.push(attribute[1]);
            const values = attribute[3].match(/^\[([^\]]+)\]$/)?.[1].split('|').map(value => value.trim()).filter(Boolean);
            if (values && values.length > 1 && values.length < 20) current.syntaxAttributeValues[attribute[1]] = values;
          }
        }
      }
      const text = normalize($(block).text());
      if (text) sectionText.push(text);
      return;
    }
    const tableRows = $(block).children('tr').add($(block).children('thead,tbody').children('tr'));
    const headers = tableRows.first().children('th,td').toArray().map(cell => normalize($(cell).text()));
    const rows = tableRows.slice(1).toArray().map(row =>
      $(row).children('th,td').toArray().map(cell => normalize($(cell).text()))
    ).filter(row => row.some(Boolean));
    const attributeColumn = headers.findIndex(header => /^attribute(s| name)?$/i.test(header));
    if (attributeColumn >= 0) {
      for (const row of rows) {
        const entry = Object.fromEntries(headers.map((header, index) => [header || `column${index}`, row[index] || '']));
        if (row[attributeColumn]) current.attributeRows.push(entry);
      }
    } else if (rows.length) {
      current.otherTables.push({ headers, rows });
    }
  });
  finish();
  return sections;
}

function sectionHashes(sections: CandidateSection[]): Record<string, string> {
  const occurrences = new Map<string, number>();
  return Object.fromEntries(sections.map(section => {
    const base = section.anchor || section.heading;
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    return [occurrence === 1 ? base : `${base}~${occurrence}`, section.hash];
  }));
}

async function extract(ids: string[]): Promise<void> {
  const sources = await readSources();
  const selected = ids.length ? sources.filter(source => ids.includes(source.id)) : sources;
  if (!selected.length || (ids.length && selected.length !== ids.length)) throw new Error('One or more requested source IDs are missing from data/sources.json.');
  const baseline = await readBaseline();
  await mkdir(candidateDir, { recursive: true });
  const failed: string[] = [];
  for (const [index, source] of selected.entries()) {
    try {
      const sections = extractSections(await fetchHtml(source.url));
      if (!sections.length) throw new Error('No sections found; this might be a moved or deprecated page.');
      baseline[source.id] = sectionHashes(sections);
      await writeFile(path.join(candidateDir, `${source.id}.json`), `${JSON.stringify({ source, sections }, null, 2)}\n`);
      console.log(`${index + 1}/${selected.length} ${source.id}: ${sections.length} sections`);
    } catch (error) {
      failed.push(source.id);
      console.error(`${index + 1}/${selected.length} ${source.id}: ${String(error)}`);
    }
  }
  await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  if (failed.length) throw new Error(`Extraction failed for: ${failed.join(', ')}`);
}

async function refresh(): Promise<void> {
  const sources = await readSources();
  const baseline = await readBaseline();
  let changes = 0;
  for (const [index, source] of sources.entries()) {
    const current = sectionHashes(extractSections(await fetchHtml(source.url)));
    const previous = baseline[source.id];
    const changedSections = [...new Set([...Object.keys(current), ...Object.keys(previous || {})])]
      .filter(key => current[key] !== previous?.[key]);
    if (changedSections.length) {
      changes++;
      console.log(`${source.id}: ${changedSections.length} new, removed, or changed sections`);
    }
    if ((index + 1) % 10 === 0) console.log(`Checked ${index + 1}/${sources.length} pages.`);
  }
  console.log(`${changes} of ${sources.length} sources differ from the extraction baseline.`);
}

function simpleValues(text: string): string[] | undefined {
  const match = text.match(/(?:Valid values?|Allowed values?|Select from|One of)(?:\s+(?:are|include))?\s*:?\s*([A-Za-z0-9_-]+(?:\s*(?:,|or|and)\s*[A-Za-z0-9_-]+)+)/i);
  if (!match) return undefined;
  const values = match[1].split(/\s*(?:,|\bor\b|\band\b)\s*/i).filter(Boolean);
  return values.length > 1 && values.length < 20 ? values : undefined;
}

async function propose(ids: string[]): Promise<void> {
  const sources = await readSources();
  const selected = ids.length ? sources.filter(source => ids.includes(source.id)) : sources;
  if (!selected.length || (ids.length && selected.length !== ids.length)) throw new Error('One or more requested source IDs are missing.');
  await mkdir(proposalDir, { recursive: true });
  for (const source of selected) {
    const input = JSON.parse(await readFile(path.join(candidateDir, `${source.id}.json`), 'utf8')) as { sections: CandidateSection[] };
    const sections = input.sections.map(section => {
      const attributes = section.attributeRows.filter(row => /^[A-Za-z_][\w:.-]*$/.test(row.Attribute || '')).map(row => {
        const description = row.Description || '';
        return {
          name: row.Attribute,
          required: /^(required|yes)$/i.test(row.Presence || row['Required?'] || ''),
          type: row.Type || undefined,
          possibleValues: simpleValues(description),
          formatHint: description.match(/\b(?:format|characters? (?:allowed|restricted))\b[^.]*(?:\.|$)/i)?.[0]?.slice(0, 200),
        };
      });
      const namedRows = section.otherTables
        .filter(table => /^(?:Name|Field Name|Element)$/i.test(table.headers[0] || ''))
        .flatMap(table => table.rows.filter(row => /^[A-Za-z][\w.-]*$/.test(row[0] || '')).map(row => ({
          name: row[0], required: /^(yes|required)$/i.test(row[table.headers.findIndex(header => /^(?:required\??|presence)$/i.test(header))] || ''),
          possibleValues: simpleValues(row.slice(1).join(' ')),
        })));
      return {
        heading: section.heading,
        contextHeading: section.contextHeading,
        source: `${source.url}${section.anchor ? `#${section.anchor}` : ''}`,
        elements: section.elements,
        exampleElements: section.exampleElements,
        exampleAttributes: section.exampleAttributes,
        syntaxAttributeValues: section.syntaxAttributeValues,
        attributes,
        namedRows,
        possibleValues: section.valueHints.flatMap(hint => simpleValues(hint) || []),
        valueHints: section.valueHints,
        formatHints: section.formatHints,
      };
    }).filter(section => section.elements.length || section.exampleElements.length || section.exampleAttributes.length || section.attributes.length || section.namedRows.length || section.valueHints.length || section.formatHints.length);
    await writeFile(path.join(proposalDir, `${source.id}.json`), `${JSON.stringify({ source, reviewStatus: 'unreviewed', sections }, null, 2)}\n`);
    console.log(`${source.id}: ${sections.length} candidate fact sections`);
  }
}

function validateValue(value: ValueSpec, label: string): void {
  if (!['free', 'enum', 'format', 'unknown'].includes(value.kind)) throw new Error(`${label}: invalid value kind.`);
  if (value.kind === 'enum' && (!value.values?.length || new Set(value.values).size !== value.values.length)) {
    throw new Error(`${label}: enum values must be present and unique.`);
  }
  if (value.caseInsensitive !== undefined && typeof value.caseInsensitive !== 'boolean') throw new Error(`${label}: caseInsensitive must be boolean.`);
  if (value.ignoreHyphens !== undefined && typeof value.ignoreHyphens !== 'boolean') throw new Error(`${label}: ignoreHyphens must be boolean.`);
  if ((value.caseInsensitive || value.ignoreHyphens) && value.kind !== 'enum') throw new Error(`${label}: enum normalization requires kind enum.`);
  if (value.kind === 'enum' && value.values && new Set(value.values.map(item => normalizeEnumValue(item, value))).size !== value.values.length) {
    throw new Error(`${label}: enum values must be unique after normalization.`);
  }
  if (value.formatType !== undefined && (value.kind !== 'format' || value.formatType !== 'ip')) {
    throw new Error(`${label}: invalid format type.`);
  }
  if (value.pattern) {
    try { new RegExp(value.pattern); } catch { throw new Error(`${label}: invalid format pattern.`); }
  }
}

async function validate(): Promise<Map<string, boolean>> {
  const sources = await readSources();
  const canonical = (value: string) => { const url = new URL(value); return `${url.origin}${url.pathname}`; };
  const sourceUrls = new Set(sources.map(source => canonical(source.url)));
  if (sourceUrls.size !== sources.length || new Set(sources.map(source => source.id)).size !== sources.length) {
    throw new Error('Source inventory contains duplicate IDs or URLs.');
  }
  const candidateAnchors = new Map<string, Set<string>>();
  for (const source of sources) {
    try {
      const candidate = JSON.parse(await readFile(path.join(candidateDir, `${source.id}.json`), 'utf8')) as { sections: CandidateSection[] };
      candidateAnchors.set(canonical(source.url), new Set(candidate.sections.map(section => section.anchor).filter((anchor): anchor is string => Boolean(anchor))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const validateLink = (value: string, label: string) => {
    const link = new URL(value);
    const page = canonical(value);
    if (!sourceUrls.has(page)) throw new Error(`${label}: source is not in the inventory.`);
    if (link.hash && candidateAnchors.has(page) && !candidateAnchors.get(page)?.has(decodeURIComponent(link.hash.slice(1)))) {
      throw new Error(`${label}: stale documentation anchor ${link.hash}.`);
    }
  };
  const reviewedDir = path.join(dataDir, 'reviewed');
  const files = (await readdir(reviewedDir)).filter(name => name.endsWith('.json'));
  if (!files.length) throw new Error('No reviewed rule files found.');
  let elements = 0;
  const coverage = new Map<string, boolean>();
  const documentRoots = new Set<string>();
  for (const file of files) {
    const document = JSON.parse(await readFile(path.join(reviewedDir, file), 'utf8')) as DocumentSpec;
    validateLink(document.source, file);
    if (!/^[A-Za-z_][\w.-]*$/.test(document.root || '') || !document.elements?.length) throw new Error(`${file}: missing or invalid root or elements.`);
    if (!['policy', 'apiProxy', 'proxyEndpoint', 'targetEndpoint', 'integrationEndpoint'].includes(document.kind)) throw new Error(`${file}: invalid document kind.`);
    const rootKey = `${document.kind}:${document.root}`;
    if (documentRoots.has(rootKey)) throw new Error(`${file}: duplicate document root ${rootKey}.`);
    documentRoots.add(rootKey);
    const paths = new Set<string>();
    for (const element of document.elements) {
      if (!(element.path === `/${document.root}` || element.path.startsWith(`/${document.root}/`)) || paths.has(element.path)) throw new Error(`${file}: invalid or duplicate path ${element.path}.`);
      validateLink(element.source, `${file}: ${element.path}`);
      if (typeof element.complete !== 'boolean') throw new Error(`${file}: ${element.path} has no review completeness flag.`);
      if (element.allowAnyChildren !== undefined && (element.allowAnyChildren !== true || !element.complete)) {
        throw new Error(`${file}: ${element.path} has invalid arbitrary-child coverage.`);
      }
      if (element.allowAnyAttributes !== undefined && (element.allowAnyAttributes !== true || !element.complete)) {
        throw new Error(`${file}: ${element.path} has invalid arbitrary-attribute coverage.`);
      }
      const source = canonical(element.source);
      coverage.set(source, (coverage.get(source) ?? true) && element.complete);
      const children = element.children || [];
      if (new Set(children).size !== children.length || children.some(child => !/^[A-Za-z_][\w.-]*$/.test(child))) throw new Error(`${file}: ${element.path} has invalid or duplicate children.`);
      if (element.requiredChildren?.some(child => !children.includes(child))) throw new Error(`${file}: ${element.path} has a required child absent from children.`);
      if (element.singleChildren && (new Set(element.singleChildren).size !== element.singleChildren.length || element.singleChildren.some(child => !children.includes(child)))) {
        throw new Error(`${file}: ${element.path} has invalid singleton children.`);
      }
      if (element.uniqueChildAttribute) {
        const unique = element.uniqueChildAttribute;
        const childPath = `${element.path}/${unique.child}`;
        if (!children.includes(unique.child) || !document.elements.some(item => item.path === childPath && item.attributes?.[unique.attribute])) {
          throw new Error(`${file}: ${element.path} has an invalid unique child attribute.`);
        }
        validateLink(unique.source, `${file}: ${element.path} unique child attribute`);
      }
      if (element.childTextLimit) {
        const limit = element.childTextLimit;
        const childPath = `${element.path}/${limit.child}`;
        if (!children.includes(limit.child)
          || !document.elements.find(item => item.path === childPath)?.children?.includes(limit.descendant)
          || !limit.value || !Number.isInteger(limit.max) || limit.max < 0) {
          throw new Error(`${file}: ${element.path} has an invalid child text limit.`);
        }
        validateLink(limit.source, `${file}: ${element.path} child text limit`);
      }
      for (const condition of element.conditionalRequiredChildren || []) {
        if (!condition.selector.length || !children.includes(condition.selector[0]) || !children.includes(condition.required)
          || condition.values?.length === 0 || condition.values && new Set(condition.values).size !== condition.values.length) {
          throw new Error(`${file}: ${element.path} has an invalid conditional child rule.`);
        }
        let selectedPath = element.path;
        for (const name of condition.selector) {
          const selected = document.elements.find(item => item.path === selectedPath);
          if (!selected?.children?.includes(name)) throw new Error(`${file}: ${element.path} has an invalid conditional selector.`);
          selectedPath += `/${name}`;
        }
        if (!document.elements.some(item => item.path === selectedPath)) throw new Error(`${file}: ${element.path} has an undefined conditional selector.`);
        validateLink(condition.source, `${file}: ${element.path} conditional child rule`);
      }
      for (const group of element.childGroups || []) {
        if (!group.children.length || new Set(group.children).size !== group.children.length || group.children.some(child => !children.includes(child))) {
          throw new Error(`${file}: ${element.path} has an invalid child group.`);
        }
        if ((group.min === undefined && group.max === undefined)
          || [group.min, group.max].some(limit => limit !== undefined && (!Number.isInteger(limit) || limit < 0))
          || (group.min !== undefined && group.max !== undefined && group.min > group.max)) {
          throw new Error(`${file}: ${element.path} has invalid child group bounds.`);
        }
        validateLink(group.source, `${file}: ${element.path} child group`);
      }
      for (const [name, value] of Object.entries(element.attributes || {})) {
        if (!/^[A-Za-z_][\w:.-]*$/.test(name)) throw new Error(`${file}: ${element.path} has invalid attribute ${name}.`);
        validateValue(value, `${file}: ${element.path}@${name}`);
        if (value.source) validateLink(value.source, `${file}: ${element.path}@${name}`);
      }
      if (element.text) validateValue(element.text, `${file}: ${element.path} text`);
      if (element.textByAttribute) {
        const { attribute, values } = element.textByAttribute;
        if (!element.attributes?.[attribute]) throw new Error(`${file}: ${element.path} has an unknown text selector attribute.`);
        for (const [name, value] of Object.entries(values)) validateValue(value, `${file}: ${element.path} text for ${attribute}=${name}`);
      }
      paths.add(element.path);
      elements++;
    }
    if (!paths.has(`/${document.root}`)) throw new Error(`${file}: root element definition is missing.`);
  }
  console.log(`Validated ${elements} element contexts in ${files.length} reviewed files.`);
  return coverage;
}

async function status(release: boolean, coverage?: Map<string, boolean>): Promise<void> {
  const sources = await readSources();
  const counts = Object.fromEntries(['pending', 'in-progress', 'reviewed', 'gap'].map(state => [state, sources.filter(source => (source.reviewStatus || 'pending') === state).length]));
  console.log(`Documentation review: ${JSON.stringify(counts)} (total ${sources.length}).`);
  if (release) {
    if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== sources.length) throw new Error('Source inventory contains an unknown review status.');
    if (counts.pending + counts['in-progress'] > 0) throw new Error('Release gate failed: all Apigee X sources must be reviewed or have a recorded documentation gap.');
    for (const source of sources) {
      const key = new URL(source.url);
      const canonical = `${key.origin}${key.pathname}`;
      if (source.reviewStatus === 'gap' && !source.reviewNotes?.trim()) throw new Error(`${source.id}: documentation gap needs a note.`);
      if (source.reviewStatus === 'reviewed' && coverage?.get(canonical) !== true) throw new Error(`${source.id}: reviewed source lacks complete rule coverage.`);
    }
  }
}

async function main(): Promise<void> {
  const [command, ...ids] = process.argv.slice(2);
  switch (command) {
    case 'discover': await discover(); break;
    case 'extract': await extract(ids); break;
    case 'refresh': await refresh(); break;
    case 'propose': await propose(ids); break;
    case 'validate': await validate(); break;
    case 'status': await status(false); break;
    case 'release-check': await status(true, await validate()); break;
    default: throw new Error('Usage: docs.ts <discover|extract [source IDs...]|propose [source IDs...]|refresh|validate|status|release-check>');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
