import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complete } from '../src/completion';
import { policyFile, proxyFile, sharedFlowFile, specs } from './support';

function labels(xml: string): string[] {
  return complete(xml, xml.length, policyFile, specs).map(suggestion => suggestion.label);
}

test('completion suggests documented child elements', () => {
  assert.deepEqual(labels('<SpikeArrest name="SA"><U'), ['UseEffectiveCount']);
});

test('completion suggests documented text values', () => {
  assert.deepEqual(labels('<SpikeArrest name="SA"><UseEffectiveCount>'), ['true', 'false']);
});

test('completion suggests unused attributes and attribute values', () => {
  assert.deepEqual(labels('<FlowCallout name="FC" '), ['continueOnError', 'enabled', 'async']);
  assert.deepEqual(labels('<FlowCallout name="FC" enabled="t'), ['true']);
});

test('completion suggests policy roots in an empty policy file', () => {
  assert.ok(labels('<').includes('SpikeArrest'));
});

test('completion suggests bundle policy names inside Step/Name', () => {
  const names = ['AM-Set', 'SA-Limit', 'SA-Shared'];
  const proxy = '<ProxyEndpoint name="d"><PreFlow><Request><Step><Name>SA-';
  const shared = '<SharedFlow name="default"><Step><Name>';
  assert.deepEqual(complete(proxy, proxy.length, proxyFile, specs, names).map(suggestion => suggestion.label), ['SA-Limit', 'SA-Shared']);
  assert.deepEqual(complete(shared, shared.length, sharedFlowFile, specs, names).map(suggestion => suggestion.label), names);
});

test('completion replaces only the typed policy name prefix', () => {
  const xml = '<SharedFlow name="default"><Step><Name>SA-';
  const [suggestion] = complete(xml, xml.length, sharedFlowFile, specs, ['SA-Limit']);
  assert.equal(xml.slice(suggestion.replaceStart, suggestion.replaceEnd), 'SA-');
});

test('completion keeps policy names out of other text contexts', () => {
  const xml = '<SharedFlow name="default"><Step><Condition>';
  assert.deepEqual(complete(xml, xml.length, sharedFlowFile, specs, ['SA-Limit']), []);
});
