import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { lintBundleReferences } from '../src/bundle';
import { classifyDocument, lint } from '../src/linter';
import { fixtureBundle, policyFile, proxyFile, sharedFlowBundle, sharedFlowFile, sharedFlowPolicyFile, specs } from './support';

for (const bundle of [fixtureBundle, sharedFlowBundle]) {
  test(`fixture ${path.basename(bundle)} has no findings`, async () => {
    const files = (await readdir(bundle, { recursive: true }))
      .map(file => path.join(bundle, file))
      .filter(file => classifyDocument(file));
    assert.ok(files.length >= 4);
    for (const file of files) {
      const xml = await readFile(file, 'utf8');
      const issues = [...lint(xml, file, specs), ...await lintBundleReferences(xml, file)];
      assert.deepEqual(issues, [], path.relative(bundle, file));
    }
  });
}

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

test('AX108 reports a shared flow step referencing a missing policy', async () => {
  const xml = '<SharedFlow name="default"><Step><Name>SA-Shared</Name></Step><Step><Name>Missing</Name></Step></SharedFlow>';
  const issues = await lintBundleReferences(xml, sharedFlowFile);
  assert.deepEqual(issues.map(issue => [issue.rule, xml.slice(issue.start, issue.end)]), [['AX108', 'Missing']]);
});

test('AX109 resolves resources against the shared flow bundle', async () => {
  const present = '<OASValidation name="t"><OASResource>oas://shared.yaml</OASResource></OASValidation>';
  const missing = '<OASValidation name="t"><OASResource>oas://hello.yaml</OASResource></OASValidation>';
  assert.deepEqual(await lintBundleReferences(present, sharedFlowPolicyFile), []);
  assert.deepEqual((await lintBundleReferences(missing, sharedFlowPolicyFile)).map(issue => issue.rule), ['AX109']);
});
