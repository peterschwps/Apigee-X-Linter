import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { lintBundleReferences } from '../src/bundle';
import { classifyDocument, lint } from '../src/linter';
import { loadSpecifications } from '../src/spec';

type UpstreamMessage = { ruleId: string; severity: number; message: string; line?: number; column?: number };
type UpstreamFile = { filePath: string; messages: UpstreamMessage[] };
type RuleSnapshot = { id: string; file: string; sha256: string; severity: string; enabled: boolean };
type Review = {
  upstream: { version: string; integrity: string };
  inventory: RuleSnapshot[];
  ruleGroups: { id: string; rules: string[]; decision: string }[];
  sourceGaps: { sourceId: string; rules: string[]; assessment: string }[];
  samples: { commit: string; bundles: string[] };
  decision: { mode: string; profile: string; excludedRules: string[] };
};
const root = process.cwd();
const engine = path.resolve(process.argv[2] || '.cache/apigeelint-runner/node_modules/apigeelint');
const samples = path.resolve(process.argv[3] || '.cache/apigee-samples');

async function readReview(): Promise<Review> {
  const review = JSON.parse(await readFile(path.join(root, 'data', 'comparison', 'apigeelint.json'), 'utf8')) as Review;
  const ids = review.inventory.map(rule => rule.id);
  if (!ids.length || new Set(ids).size !== ids.length || review.inventory.some(rule =>
    !/^[A-Z]{2}[0-9]{3}$/.test(rule.id) || !rule.file.startsWith(`${rule.id}-`) || !/^[a-f0-9]{64}$/.test(rule.sha256)
    || !['warning', 'error'].includes(rule.severity) || typeof rule.enabled !== 'boolean')) throw new Error('Invalid upstream rule snapshot.');
  const mapped = review.ruleGroups.flatMap(group => group.rules);
  if (new Set(mapped).size !== mapped.length || mapped.length !== ids.length || mapped.some(id => !ids.includes(id))
    || review.ruleGroups.some(group => !group.id || !group.decision.trim())) throw new Error('Every upstream rule needs exactly one review disposition.');
  const sources = JSON.parse(await readFile(path.join(root, 'data', 'sources.json'), 'utf8')) as { id: string; reviewStatus: string }[];
  const gaps = review.sourceGaps.map(gap => gap.sourceId);
  if (new Set(gaps).size !== gaps.length || review.sourceGaps.some(gap => !sources.some(source => source.id === gap.sourceId)
    || !gap.assessment.trim() || gap.rules.some(id => !ids.includes(id)))
    || sources.some(source => source.reviewStatus === 'gap' && !gaps.includes(source.id))) throw new Error('Every current source gap needs an upstream assessment.');
  if (review.decision.profile !== 'apigeex' || review.decision.mode !== 'development-and-ci'
    || !['PO013', 'PO025'].every(id => review.decision.excludedRules.includes(id))
    || review.decision.excludedRules.some(id => !ids.includes(id))
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(review.upstream.integrity)
    || !/^[a-f0-9]{40}$/.test(review.samples.commit)
    || !review.samples.bundles.length || review.samples.bundles.some(name => !/^[a-z0-9-]+$/.test(name))) throw new Error('Invalid comparison configuration.');
  return review;
}

async function filesIn(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else if (entry.isFile() && classifyDocument(file)) files.push(file);
  }
  return files.sort();
}

async function main(): Promise<void> {
  const review = await readReview();
  if (process.argv[2] === '--validate') {
    process.stdout.write(`Validated ${review.inventory.length} upstream rule dispositions and ${review.sourceGaps.length} source-gap assessments.\n`);
    return;
  }
  const pkg = JSON.parse(await readFile(path.join(engine, 'package.json'), 'utf8')) as { name: string; version: string };
  if (pkg.name !== 'apigeelint' || pkg.version !== review.upstream.version) throw new Error(`Use the reviewed apigeelint ${review.upstream.version} package.`);
  const plugins = path.join(engine, 'lib', 'package', 'plugins');
  const inventory = await Promise.all((await readdir(plugins)).filter(file => /^[A-Z]{2}[0-9]{3}-.+\.js$/.test(file)).sort().map(async file => {
    const source = await readFile(path.join(plugins, file), 'utf8');
    const severity = source.match(/severity\s*:\s*(2|1|RULE_ERROR|RULE_WARNING)\b/)?.[1];
    return { id: file.slice(0, 5), file, sha256: createHash('sha256').update(source).digest('hex'),
      severity: severity === '2' || severity === 'RULE_ERROR' ? 'error' : 'warning',
      enabled: /enabled\s*:\s*true\b/.test(source) };
  }));
  if (JSON.stringify(inventory) !== JSON.stringify(review.inventory)) throw new Error('Upstream plugin sources differ from the reviewed snapshot.');
  const samplesCommit = execFileSync('git', ['-C', samples, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  if (samplesCommit !== review.samples.commit) throw new Error('Sample checkout differs from the reviewed commit.');
  const sampleChanges = execFileSync('git', ['-C', samples, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8', windowsHide: true }).trim();
  if (sampleChanges) throw new Error('Use an unmodified sample checkout without additional files.');
  const specs = loadSpecifications(root);
  const bundles = [];
  for (const name of review.samples.bundles) {
    const bundle = path.join(samples, name, 'apiproxy');
    const local = [];
    const durations: number[] = [];
    for (const file of await filesIn(bundle)) {
      const xml = await readFile(file, 'utf8');
      const start = performance.now();
      const issues = [...lint(xml, file, specs), ...await lintBundleReferences(xml, file)];
      durations.push(performance.now() - start);
      for (const issue of issues) {
        const before = xml.slice(0, issue.start).split('\n');
        local.push({ file: path.relative(bundle, file).replace(/\\/g, '/'), line: before.length,
          column: before.at(-1)!.length + 1, rule: issue.rule, severity: issue.severity || 'error', message: issue.message });
      }
    }
    const started = performance.now();
    let output: string;
    try {
      output = execFileSync(process.execPath, [path.join(engine, 'cli.js'), '--profile', 'apigeex', '--norc',
        '--excluded', review.decision.excludedRules.join(','), '--formatter', 'json.js', '--path', bundle],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    } catch (error) {
      const result = error as { status?: number; stdout?: string };
      if (result.status !== 1 || typeof result.stdout !== 'string') throw error;
      output = result.stdout;
    }
    const upstreamMs = performance.now() - started;
    const upstream = (JSON.parse(output) as UpstreamFile[]).flatMap(file => file.messages.map(message => ({
      file: path.relative(bundle, path.resolve(file.filePath)).replace(/\\/g, '/'), ...message,
    })));
    bundles.push({ name, documents: durations.length, localMs: Number(durations.reduce((a, b) => a + b, 0).toFixed(2)),
      slowestDocumentMs: Number(Math.max(...durations).toFixed(2)), upstreamMs: Number(upstreamMs.toFixed(2)), local, upstream });
    process.stdout.write(`${name}: ${durations.length} XML files, ${local.length} local findings, ${upstream.length} upstream findings\n`);
  }
  await mkdir(path.join(root, '.cache'), { recursive: true });
  await writeFile(path.join(root, '.cache', 'apigeelint-comparison.json'), JSON.stringify({ version: pkg.version,
    samplesCommit, excluded: review.decision.excludedRules, inventory, bundles }, null, 2) + '\n');
  process.stdout.write('Detailed comparison: .cache/apigeelint-comparison.json\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
