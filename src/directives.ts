import type { LintIssue } from './linter';
import type { XmlComment } from './xml';

const directivePattern = /^\s*apigee-x-linter\s+disable\s*=\s*([A-Za-z]{2}[0-9]{3}(?:\s*,\s*[A-Za-z]{2}[0-9]{3})*)\s*$/;

/** Returns the upper-case rule IDs of a directive comment body, or nothing for other comments. */
export function directiveRules(commentText: string): string[] | undefined {
  return directivePattern.exec(commentText)?.[1].split(',').map(rule => rule.trim().toUpperCase());
}

function lineOf(xml: string, offset: number): number {
  let line = 0;
  for (let index = xml.indexOf('\n'); index >= 0 && index < offset; index = xml.indexOf('\n', index + 1)) line++;
  return line;
}

/**
 * Drops issues on the line following an `<!-- apigee-x-linter disable=ID[,ID...] -->` comment,
 * matching apigeelint's line-based directive semantics.
 */
export function applyDirectives(xml: string, comments: readonly XmlComment[], issues: LintIssue[]): LintIssue[] {
  const disabled = new Map<number, Set<string>>();
  for (const comment of comments) {
    const rules = directiveRules(comment.text);
    if (!rules) continue;
    const line = lineOf(xml, comment.end - 1) + 1;
    disabled.set(line, new Set([...disabled.get(line) || [], ...rules]));
  }
  if (!disabled.size) return issues;
  return issues.filter(issue => !disabled.get(lineOf(xml, issue.start))?.has(issue.rule));
}
