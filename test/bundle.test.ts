import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { lintBundleReferences } from '../src/bundle';
import { classifyDocument, lint } from '../src/linter';
import { fixtureBundle, policyFile, proxyFile, specs } from './support';

test('fixture bundle has no findings', async () => {
  const files = (await readdir(fixtureBundle, { recursive: true }))
    .map(file => path.join(fixtureBundle, file))
    .filter(file => classifyDocument(file));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const xml = await readFile(file, 'utf8');
    const issues = [...lint(xml, file, specs), ...await lintBundleReferences(xml, file)];
    assert.deepEqual(issues, [], path.relative(fixtureBundle, file));
  }
});

test('AX108 reports a step referencing a missing policy', async () => {
  const xml = '<ProxyEndpoint name="t"><PreFlow><Request><Step><Name>SA-Limit</Name></Step><Step><Name> Missing </Name></Step></Request></PreFlow></ProxyEndpoint>';
  const issues = await lintBundleReferences(xml, proxyFile);
  assert.deepEqual(issues.map(issue => [issue.rule, xml.slice(issue.start, issue.end)]), [['AX108', 'Missing']]);
});

test('AX109 warns about a resource missing from the bundle', async () => {
  const xml = '<OASValidation name="t"><OASResource>oas://missing.yaml</OASResource></OASValidation>';
  const issues = await lintBundleReferences(xml, policyFile);
  assert.deepEqual(issues.map(issue => [issue.rule, issue.severity]), [['AX109', 'warning']]);
});

test('bundle references are skipped outside a proxy bundle', async () => {
  const xml = '<ProxyEndpoint name="t"><PreFlow><Request><Step><Name>Missing</Name></Step></Request></PreFlow></ProxyEndpoint>';
  assert.deepEqual(await lintBundleReferences(xml, path.join(path.dirname(fixtureBundle), 'loose.xml')), []);
});
