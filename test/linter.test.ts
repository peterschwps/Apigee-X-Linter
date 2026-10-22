import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lint } from '../src/linter';
import { policyFile, proxyFile, specs } from './support';

const flowCallout = (body: string, attributes = 'name="FC"') => `<FlowCallout ${attributes}>${body}</FlowCallout>`;
const spikeArrest = (body: string) => `<SpikeArrest name="SA"><Rate>10ps</Rate>${body}</SpikeArrest>`;
const proxy = (body: string) => `<ProxyEndpoint name="default">${body}</ProxyEndpoint>`;

const cases: { name: string; xml: string; file?: string; rules: string[] }[] = [
  { name: 'valid policy', xml: flowCallout('<SharedFlowBundle>shared</SharedFlowBundle>'), rules: [] },
  { name: 'AX001 syntax error', xml: '<FlowCallout name="FC">', rules: ['AX001'] },
  { name: 'AX101 unknown element', xml: flowCallout('<SharedFlowBundle>s</SharedFlowBundle><Bogus/>'), rules: ['AX101'] },
  { name: 'AX101 wrong document root', xml: '<TargetEndpoint name="default"/>', file: proxyFile, rules: ['AX101'] },
  { name: 'AX102 misplaced element', xml: flowCallout('<SharedFlowBundle>s</SharedFlowBundle><Parameter name="p"/>'), rules: ['AX102'] },
  { name: 'AX103 unknown attribute', xml: flowCallout('<SharedFlowBundle>s</SharedFlowBundle>', 'name="FC" bogus="1"'), rules: ['AX103'] },
  { name: 'AX104 missing attribute and child', xml: flowCallout('', ''), rules: ['AX104', 'AX104'] },
  { name: 'AX105 invalid enum attribute', xml: flowCallout('<SharedFlowBundle>s</SharedFlowBundle>', 'name="FC" enabled="yes"'), rules: ['AX105'] },
  { name: 'AX106 invalid format', xml: '<SpikeArrest name="SA"><Rate>fast</Rate></SpikeArrest>', rules: ['AX106'] },
  { name: 'AX107 duplicate flow name', xml: proxy('<Flows><Flow name="a"/><Flow name="a"/></Flows>'), file: proxyFile, rules: ['AX107'] },
  { name: 'AX110 compatibility warning', xml: spikeArrest('<UseEffectiveCount>false</UseEffectiveCount>'), rules: ['AX110'] },
  { name: 'comment inside an enum value', xml: spikeArrest('<UseEffectiveCount><!-- x -->true</UseEffectiveCount>'), rules: [] },
  { name: 'CDATA enum value', xml: spikeArrest('<UseEffectiveCount><![CDATA[true]]></UseEffectiveCount>'), rules: [] },
  { name: 'character reference in an enum attribute', xml: flowCallout('<SharedFlowBundle>s</SharedFlowBundle>', 'name="FC" enabled="tr&#117;e"'), rules: [] },
  { name: 'comment inside a format value', xml: '<SpikeArrest name="SA"><Rate><!-- per second -->10ps</Rate></SpikeArrest>', rules: [] },
];

for (const { name, xml, file, rules } of cases) {
  test(`lint reports ${rules.join(', ') || 'nothing'} for ${name}`, () => {
    assert.deepEqual(lint(xml, file ?? policyFile, specs).map(issue => issue.rule), rules);
  });
}

test('lint marks warnings and links Google documentation', () => {
  const [issue] = lint(spikeArrest('<UseEffectiveCount>false</UseEffectiveCount>'), policyFile, specs);
  assert.equal(issue.severity, 'warning');
  assert.match(issue.source ?? '', /^https:\/\/docs\.cloud\.google\.com\/apigee\//);
});

test('lint ranges cover the value without surrounding comments', () => {
  const xml = spikeArrest('<UseEffectiveCount> <!-- x --> maybe </UseEffectiveCount>');
  const [issue] = lint(xml, policyFile, specs);
  assert.equal(issue.rule, 'AX105');
  assert.equal(xml.slice(issue.start, issue.end), 'maybe');
});

test('lint omits ignored rules', () => {
  const xml = spikeArrest('<UseEffectiveCount>false</UseEffectiveCount>');
  assert.deepEqual(lint(xml, policyFile, specs, new Set(['AX110'])), []);
});
