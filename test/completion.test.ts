import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complete } from '../src/completion';
import { policyFile, specs } from './support';

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
