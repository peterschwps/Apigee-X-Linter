import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDocument, lint } from '../src/linter';
import { policyFile, proxyFile, sharedFlowFile, sharedFlowManifest, sharedFlowPolicyFile, specs } from './support';

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
  { name: 'valid shared flow', xml: '<SharedFlow name="default"><Step><Condition>true</Condition><Name>P</Name></Step></SharedFlow>', file: sharedFlowFile, rules: [] },
  { name: 'empty shared flow', xml: '<SharedFlow name="default"/>', file: sharedFlowFile, rules: [] },
  { name: 'shared flow step without a name', xml: '<SharedFlow name="default"><Step><Condition>true</Condition></Step></SharedFlow>', file: sharedFlowFile, rules: ['AX104'] },
  { name: 'shared flow name with invalid characters', xml: '<SharedFlow name="my flow"><Step><Name>P</Name></Step></SharedFlow>', file: sharedFlowFile, rules: ['AX106'] },
  { name: 'shared flow with an unknown child', xml: '<SharedFlow name="default"><FaultRules/></SharedFlow>', file: sharedFlowFile, rules: ['AX101'] },
  { name: 'shared flow file with a wrong root', xml: '<ProxyEndpoint name="default"/>', file: sharedFlowFile, rules: ['AX101'] },
  { name: 'shared flow manifest without SharedFlows', xml: '<SharedFlowBundle name="shared"><Description>d</Description></SharedFlowBundle>', file: sharedFlowManifest, rules: [] },
  { name: 'shared flow manifest with an invalid version', xml: '<SharedFlowBundle name="shared"><ConfigurationVersion majorVersion="5" minorVersion="0"/></SharedFlowBundle>', file: sharedFlowManifest, rules: ['AX105'] },
  { name: 'shared flow manifest without a name', xml: '<SharedFlowBundle><SharedFlows><SharedFlow>default</SharedFlow></SharedFlows></SharedFlowBundle>', file: sharedFlowManifest, rules: ['AX104'] },
  { name: 'policy in a shared flow bundle', xml: '<SpikeArrest name="SA" bogus="1"><Rate>10ps</Rate></SpikeArrest>', file: sharedFlowPolicyFile, rules: ['AX103'] },
  { name: 'RaiseFault with an undocumented Properties stub', xml: '<RaiseFault name="RF"><Properties/><FaultResponse><Set><StatusCode>500</StatusCode></Set></FaultResponse></RaiseFault>', rules: ['AX101'] },
  { name: 'KVM with an undocumented Properties stub', xml: '<KeyValueMapOperations name="K" mapIdentifier="m"><Properties/><Get assignTo="v"><Key><Parameter>k</Parameter></Key></Get><Scope>environment</Scope></KeyValueMapOperations>', rules: ['AX101'] },
  { name: 'ServiceCallout Verb in the request', xml: '<ServiceCallout name="SC"><Request><Set><Verb>POST</Verb></Set></Request><HTTPTargetConnection><URL>https://example.com</URL></HTTPTargetConnection></ServiceCallout>', rules: [] },
  { name: 'ServiceCallout Verb in the connection', xml: '<ServiceCallout name="SC"><HTTPTargetConnection><Verb>POST</Verb><URL>https://example.com</URL></HTTPTargetConnection></ServiceCallout>', rules: ['AX101'] },
  { name: 'comment inside a format value', xml: '<SpikeArrest name="SA"><Rate><!-- per second -->10ps</Rate></SpikeArrest>', rules: [] },
];

for (const { name, xml, file, rules } of cases) {
  test(`lint reports ${rules.join(', ') || 'nothing'} for ${name}`, () => {
    assert.deepEqual(lint(xml, file ?? policyFile, specs).map(issue => issue.rule), rules);
  });
}

test('classifyDocument recognizes shared flow bundle files', () => {
  assert.equal(classifyDocument('/w/SharedFlowBundle/traffic.xml'), 'sharedFlowBundle');
  assert.equal(classifyDocument('/w/sharedflowbundle/sharedflows/default.xml'), 'sharedFlow');
  assert.equal(classifyDocument('/w/sharedflowbundle/policies/SA.xml'), 'policy');
  assert.equal(classifyDocument('/w/sharedflowbundle/resources/xsl/t.xml'), undefined);
});

test('classifyDocument recognizes paths relative to the bundle parent', () => {
  assert.equal(classifyDocument('apiproxy/policies/SA.xml'), 'policy');
  assert.equal(classifyDocument('apiproxy\\proxies\\default.xml'), 'proxyEndpoint');
  assert.equal(classifyDocument('sharedflowbundle/shared.xml'), 'sharedFlowBundle');
  assert.equal(classifyDocument('notapiproxy/policies/SA.xml'), undefined);
});

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

test('lint reports nothing for an empty or whitespace-only file', () => {
  assert.deepEqual(lint('', policyFile, specs), []);
  assert.deepEqual(lint(' \n\t', policyFile, specs), []);
});

test('lint omits ignored rules', () => {
  const xml = spikeArrest('<UseEffectiveCount>false</UseEffectiveCount>');
  assert.deepEqual(lint(xml, policyFile, specs, new Set(['AX110'])), []);
});
