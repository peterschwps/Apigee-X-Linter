#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { version } from '../package.json';
import { lintBundleReferences } from './bundle';
import { classifyDocument, lint } from './linter';
import { loadSpecifications } from './spec';

const usage = `Usage: apigee-x-linter [--ignore AX110,AX101] [--version] [path ...]

Lints Apigee X proxy and shared flow bundle XML below each path (default: the current directory).
Files given explicitly are linted even outside apiproxy or sharedflowbundle directories.

Exit codes: 0 without errors, 1 when errors were found, 2 for invalid usage or unreadable paths.`;

const argumentConfig = {
  allowPositionals: true,
  options: { ignore: { type: 'string', multiple: true }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } },
} as const;

export type Output = { out: (line: string) => void; err: (line: string) => void };

const consoleOutput: Output = {
  out: line => process.stdout.write(`${line}\n`),
  err: line => process.stderr.write(`${line}\n`),
};

async function bundleFiles(target: string): Promise<string[]> {
  if (!(await stat(target)).isDirectory()) return [target];
  const entries = await readdir(target, { recursive: true });
  return entries
    .filter(entry => !/(?:^|[\\/])(?:node_modules|\.git)(?:[\\/]|$)/.test(entry))
    .map(entry => path.join(target, entry))
    .filter(file => classifyDocument(file));
}

function parseArguments(args: string[]) {
  try {
    return parseArgs({ args, ...argumentConfig });
  } catch (error) {
    return error as Error;
  }
}

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function position(xml: string, offset: number): string {
  const lines = xml.slice(0, offset).split('\n');
  return `${lines.length}:${lines[lines.length - 1].length + 1}`;
}

/** Lints the given paths, writes one line per finding, and returns the process exit code. */
export async function run(args: string[], output: Output = consoleOutput): Promise<number> {
  const options = parseArguments(args);
  if (options instanceof Error) {
    output.err(`${options.message}\n\n${usage}`);
    return 2;
  }
  if (options.values.help) {
    output.out(usage);
    return 0;
  }
  if (options.values.version) {
    output.out(version);
    return 0;
  }
  const ignored = new Set((options.values.ignore ?? []).flatMap(value => value.split(',')).map(rule => rule.trim().toUpperCase()).filter(Boolean));

  // Collect files first so an unreadable path fails before any findings are printed.
  const files = new Set<string>();
  for (const target of options.positionals.length ? options.positionals : ['.']) {
    try {
      for (const file of await bundleFiles(target)) files.add(file);
    } catch (error) {
      output.err(`Cannot read ${target}: ${(error as Error).message}`);
      return 2;
    }
  }

  const specs = loadSpecifications(path.resolve(__dirname, '..'));
  let errors = 0;
  let warnings = 0;
  for (const file of [...files].sort()) {
    const xml = await readFile(file, 'utf8');
    const bundleIssues = (await lintBundleReferences(xml, file)).filter(issue => !ignored.has(issue.rule));
    const issues = [...lint(xml, file, specs, ignored), ...bundleIssues].sort((a, b) => a.start - b.start);
    for (const issue of issues) {
      const severity = issue.severity ?? 'error';
      if (severity === 'error') errors++;
      else warnings++;
      output.out(`${path.relative(process.cwd(), file) || file}:${position(xml, issue.start)}: ${severity} ${issue.rule} ${issue.message}`);
    }
  }
  output.err(`${count(files.size, 'file')} checked: ${count(errors, 'error')}, ${count(warnings, 'warning')}.`);
  return errors ? 1 : 0;
}

if (require.main === module) {
  run(process.argv.slice(2)).then(code => { process.exitCode = code; }, (error: unknown) => {
    console.error(error);
    process.exitCode = 2;
  });
}
