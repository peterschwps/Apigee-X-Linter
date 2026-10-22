import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeEntities, parseXml, rootElementName } from '../src/xml';

function rootText(xml: string) {
  const text = parseXml(xml).root?.text;
  return text && { value: text.value, range: xml.slice(text.start, text.end) };
}

test('decodeEntities resolves predefined and numeric references', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;'), `a & b <c> "d" 'e'`);
  assert.equal(decodeEntities('tr&#117;&#x65;'), 'true');
});

test('decodeEntities keeps unknown or invalid references literal', () => {
  assert.equal(decodeEntities('&custom; &#x110000;'), '&custom; &#x110000;');
});

test('leaf text excludes comments and narrows the range to the value', () => {
  assert.deepEqual(rootText('<A>\n  <!-- note -->  true \n</A>'), { value: 'true', range: 'true' });
});

test('leaf text unwraps CDATA and decodes references', () => {
  assert.deepEqual(rootText('<A><![CDATA[ x < y ]]></A>'), { value: 'x < y', range: '<![CDATA[ x < y ]]>' });
  assert.deepEqual(rootText('<A>a &amp; b</A>'), { value: 'a & b', range: 'a &amp; b' });
});

test('leaf text is absent for empty, whitespace-only, and parent elements', () => {
  assert.equal(rootText('<A/>'), undefined);
  assert.equal(rootText('<A> <!-- only a comment --> </A>'), undefined);
  assert.equal(rootText('<A>text<B/></A>'), undefined);
});

test('attribute values are decoded while ranges keep raw offsets', () => {
  const xml = '<A b="x &amp; y"/>';
  const attribute = parseXml(xml).root?.attributes[0];
  assert.equal(attribute?.value, 'x & y');
  assert.equal(xml.slice(attribute?.valueStart, attribute?.valueEnd), 'x &amp; y');
});

test('rootElementName skips the declaration, processing instructions, and comments', () => {
  assert.equal(rootElementName('<Quota name="q"/>'), 'Quota');
  assert.equal(rootElementName('<?xml version="1.0"?>\n<!-- a -->\n<?pi x?><!-- b --><Quota>'), 'Quota');
});

test('rootElementName is absent without a root element', () => {
  assert.equal(rootElementName(''), undefined);
  assert.equal(rootElementName('<!-- unterminated <Quota>'), undefined);
});
