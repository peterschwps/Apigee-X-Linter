import { directiveRules } from './directives';
import { parseXml } from './xml';

export type TextEdit = { start: number; end: number; text: string };

/** Counts insertions, deletions, substitutions, and adjacent transpositions. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

/**
 * Returns the single documented value closest to a mistyped one, or nothing when no value is
 * close enough or several are equally close.
 */
export function closestValue(value: string, candidates: readonly string[], normalize: (text: string) => string = text => text): string | undefined {
  const typed = normalize(value).toLowerCase();
  const scored = candidates.map(candidate => {
    const expected = normalize(candidate).toLowerCase();
    return { candidate, distance: editDistance(typed, expected), limit: Math.max(1, Math.floor(expected.length / 3)) };
  }).filter(item => item.distance <= item.limit).sort((a, b) => a.distance - b.distance);
  return scored.length && scored[0].distance !== scored[1]?.distance ? scored[0].candidate : undefined;
}

/**
 * Builds the edit that suppresses a rule on the line containing the offset: either a new directive
 * line with the same indentation or the rule appended to a directive on the previous line. Returns
 * nothing when the comment could not be placed as valid, effective XML.
 */
export function disableDirectiveEdit(xml: string, offset: number, rule: string): TextEdit | undefined {
  const lineStart = xml.lastIndexOf('\n', offset - 1) + 1;
  const line = xml.slice(lineStart, xml.indexOf('\n', lineStart) < 0 ? xml.length : xml.indexOf('\n', lineStart));
  if (/^\s*<\?xml\b/.test(line)) return undefined;

  // Extend a directive on the previous line, since a second comment line would shift its target.
  let edit: TextEdit | undefined;
  if (lineStart > 0) {
    const previousEnd = lineStart - 1;
    const previousStart = xml.lastIndexOf('\n', previousEnd - 1) + 1;
    const previous = xml.slice(previousStart, previousEnd).replace(/\r$/, '');
    const match = /^([ \t]*)<!--(.*)-->[ \t]*$/.exec(previous);
    const rules = match && directiveRules(match[2]);
    if (rules?.includes(rule)) return undefined;
    if (match && rules) edit = { start: previousStart, end: previousStart + previous.length, text: `${match[1]}<!-- apigee-x-linter disable=${[...rules, rule].join(',')} -->` };
  }
  const lineEnding = xml.includes('\r\n') ? '\r\n' : '\n';
  edit ??= { start: lineStart, end: lineStart, text: `${/^[ \t]*/.exec(line)?.[0] ?? ''}<!-- apigee-x-linter disable=${rule} -->${lineEnding}` };

  // Reject placements inside markup, where the text would not parse as the intended comment.
  const before = parseXml(xml);
  const after = parseXml(xml.slice(0, edit.start) + edit.text + xml.slice(edit.end));
  const placed = after.comments.some(comment => comment.start === edit.start + edit.text.indexOf('<!--'));
  return placed && after.syntaxIssues.length <= before.syntaxIssues.length ? edit : undefined;
}
