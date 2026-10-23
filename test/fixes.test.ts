import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closestValue, disableDirectiveEdit, type TextEdit } from '../src/fixes';
import { lint } from '../src/linter';
import { policyFile, specs } from './support';

function applyEdit(xml: string, edit: TextEdit | undefined): string {
  assert.ok(edit, 'expected an edit');
  return xml.slice(0, edit.start) + edit.text + xml.slice(edit.end);
}

function firstIssue(xml: string) {
  const [issue] = lint(xml, policyFile, specs);
  assert.ok(issue, 'expected an issue');
  return issue;
}

test('closestValue corrects typos, transpositions, and case', () => {
  assert.equal(closestValue('flase', ['true', 'false']), 'false');
  assert.equal(closestValue('tru', ['true', 'false']), 'true');
  assert.equal(closestValue('TRUE', ['true', 'false']), 'true');
  assert.equal(closestValue('requst', ['request', 'response']), 'request');
});

test('closestValue gives up on distant or ambiguous values', () => {
  assert.equal(closestValue('yes', ['true', 'false']), undefined);
  assert.equal(closestValue('px', ['ps', 'pm']), undefined);
});

test('closestValue compares normalized values', () => {
  const withoutHyphens = (text: string) => text.replace(/-/g, '');
  assert.equal(closestValue('applicaton-json', ['application/json', 'applicationjson'], withoutHyphens), 'applicationjson');
});

test('AX105 carries a replacement and names it in the message', () => {
  const issue = firstIssue('<FlowCallout name="FC" enabled="flase"><SharedFlowBundle>s</SharedFlowBundle></FlowCallout>');
  assert.equal(issue.rule, 'AX105');
  assert.equal(issue.replacement, 'false');
  assert.match(issue.message, /Did you mean "false"\?$/);
});

test('AX105 has no replacement for distant values', () => {
  const issue = firstIssue('<FlowCallout name="FC" enabled="yes"><SharedFlowBundle>s</SharedFlowBundle></FlowCallout>');
  assert.equal(issue.replacement, undefined);
  assert.equal(issue.message, 'Expected one of: true, false.');
});

test('disable edit inserts an indented directive that suppresses the issue', () => {
  const xml = '<RaiseFault name="RF">\n  <Properties/>\n  <FaultResponse><Set><StatusCode>500</StatusCode></Set></FaultResponse>\n</RaiseFault>';
  const issue = firstIssue(xml);
  const edited = applyEdit(xml, disableDirectiveEdit(xml, issue.start, issue.rule));
  assert.match(edited, /\n {2}<!-- apigee-x-linter disable=AX101 -->\n {2}<Properties\/>/);
  assert.deepEqual(lint(edited, policyFile, specs), []);
});

test('disable edit extends a directive on the previous line', () => {
  const xml = '<RaiseFault name="RF">\n  <!-- apigee-x-linter disable=AX103 -->\n  <Properties/>\n  <FaultResponse><Set><StatusCode>500</StatusCode></Set></FaultResponse>\n</RaiseFault>';
  const issue = firstIssue(xml);
  const edited = applyEdit(xml, disableDirectiveEdit(xml, issue.start, issue.rule));
  assert.match(edited, /<!-- apigee-x-linter disable=AX103,AX101 -->\n {2}<Properties\/>/);
  assert.deepEqual(lint(edited, policyFile, specs), []);
  assert.equal(disableDirectiveEdit(edited, edited.indexOf('Properties'), 'AX101'), undefined);
});

test('disable edit preserves CRLF line endings', () => {
  const xml = '<RaiseFault name="RF">\r\n  <Properties/>\r\n  <FaultResponse><Set><StatusCode>500</StatusCode></Set></FaultResponse>\r\n</RaiseFault>';
  const edit = disableDirectiveEdit(xml, xml.indexOf('Properties'), 'AX101');
  assert.equal(edit?.text, '  <!-- apigee-x-linter disable=AX101 -->\r\n');
});

test('disable edit refuses positions inside a start tag or on the XML declaration', () => {
  const multiline = '<FlowCallout name="FC"\n    enabled="flase">\n  <SharedFlowBundle>s</SharedFlowBundle>\n</FlowCallout>';
  assert.equal(disableDirectiveEdit(multiline, multiline.indexOf('flase'), 'AX105'), undefined);
  const declared = '<?xml version="1.0"?><RaiseFault/>';
  assert.equal(disableDirectiveEdit(declared, declared.indexOf('RaiseFault'), 'AX104'), undefined);
});
