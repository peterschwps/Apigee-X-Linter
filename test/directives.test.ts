import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintBundleReferences } from '../src/bundle';
import { lint } from '../src/linter';
import { policyFile, proxyFile, specs } from './support';

function raiseFault(...lines: string[]): string {
  return ['<RaiseFault name="RF">', ...lines, '<FaultResponse><Set><StatusCode>500</StatusCode></Set></FaultResponse>', '</RaiseFault>'].join('\n');
}

function rules(xml: string): string[] {
  return lint(xml, policyFile, specs).map(issue => issue.rule);
}

test('directive suppresses the listed rule on the following line', () => {
  assert.deepEqual(rules(raiseFault('<Properties/>')), ['AX101']);
  assert.deepEqual(rules(raiseFault('<!-- apigee-x-linter disable=AX101 -->', '<Properties/>')), []);
});

test('directive accepts several IDs, spacing, and lowercase', () => {
  const xml = raiseFault('<!--apigee-x-linter disable = ax101 , AX103-->', '<Properties/><Bogus/><DisplayName bogus="1">RF</DisplayName>');
  assert.deepEqual(rules(xml), []);
});

test('directive keeps other rules on the same line', () => {
  assert.deepEqual(rules(raiseFault('<!-- apigee-x-linter disable=AX103 -->', '<Properties/>')), ['AX101']);
});

test('directive applies only to the line after the comment ends', () => {
  assert.deepEqual(rules(raiseFault('<!-- apigee-x-linter disable=AX101 -->', '', '<Properties/>')), ['AX101']);
  assert.deepEqual(rules(raiseFault('<!-- apigee-x-linter disable=AX101 --><Properties/>')), ['AX101']);
  assert.deepEqual(rules(raiseFault('<!--', '  apigee-x-linter disable=AX101', '-->', '<Properties/>')), []);
});

test('malformed directives and CDATA text are not directives', () => {
  assert.deepEqual(rules(raiseFault('<!-- apigee-x-linter disable AX101 -->', '<Properties/>')), ['AX101']);
  assert.deepEqual(rules(raiseFault('<!-- apigeelint disable=AX101 -->', '<Properties/>')), ['AX101']);
  const xml = '<SpikeArrest name="SA">\n<DisplayName><![CDATA[<!-- apigee-x-linter disable=AX106 -->]]></DisplayName>\n<Rate>fast</Rate>\n</SpikeArrest>';
  assert.deepEqual(rules(xml), ['AX106']);
});

test('directive before the root element suppresses root diagnostics', () => {
  assert.deepEqual(rules('<!-- apigee-x-linter disable=AX104 -->\n<RaiseFault><FaultResponse/></RaiseFault>'), []);
});

test('directive suppresses bundle reference diagnostics', async () => {
  const xml = '<ProxyEndpoint name="t"><PreFlow><Request><Step>\n<!-- apigee-x-linter disable=AX108 -->\n<Name>Missing</Name>\n</Step></Request></PreFlow></ProxyEndpoint>';
  assert.deepEqual(await lintBundleReferences(xml, proxyFile), []);
});
