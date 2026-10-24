import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { version } from '../package.json';
import { run } from '../src/cli';
import { fixtureBundle, repositoryRoot, sharedFlowBundle } from './support';

let workspace: string;
let invalidPolicy: string;
let warningPolicy: string;

async function capture(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { out: line => out.push(line), err: line => err.push(line) });
  return { code, out, err };
}

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'apigee-x-linter-cli-'));
  const policies = path.join(workspace, 'errors', 'apiproxy', 'policies');
  await mkdir(policies, { recursive: true });
  invalidPolicy = path.join(policies, 'FC.xml');
  await writeFile(invalidPolicy, '<FlowCallout name="FC"\n  enabled="flase">\n  <SharedFlowBundle>s</SharedFlowBundle>\n</FlowCallout>\n');
  const warnings = path.join(workspace, 'warnings', 'apiproxy', 'policies');
  await mkdir(warnings, { recursive: true });
  warningPolicy = path.join(warnings, 'SA.xml');
  await writeFile(warningPolicy, '<SpikeArrest name="SA">\n  <Rate>10ps</Rate>\n  <UseEffectiveCount>false</UseEffectiveCount>\n</SpikeArrest>\n');
  const ignoredDirectory = path.join(workspace, 'errors', 'node_modules', 'pkg', 'apiproxy', 'policies');
  await mkdir(ignoredDirectory, { recursive: true });
  await writeFile(path.join(ignoredDirectory, 'Bad.xml'), '<FlowCallout bogus="1"/>');
});

after(() => rm(workspace, { recursive: true, force: true }));

test('cli exits 0 for clean fixture bundles', async () => {
  const result = await capture([fixtureBundle, sharedFlowBundle]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, []);
  assert.match(result.err[0], /^1\d files checked: 0 errors, 0 warnings\.$/);
});

test('cli reports errors with line and column and exits 1', async () => {
  const result = await capture([path.join(workspace, 'errors')]);
  assert.equal(result.code, 1);
  assert.deepEqual(result.out, [`${path.relative(process.cwd(), invalidPolicy)}:2:12: error AX105 Expected one of: true, false. Did you mean "false"?`]);
  assert.equal(result.err[0], '1 file checked: 1 error, 0 warnings.');
});

test('cli reports warnings without failing', async () => {
  const result = await capture([path.join(workspace, 'warnings')]);
  assert.equal(result.code, 0);
  assert.match(result.out[0], /:3:22: warning AX110 /);
});

test('cli --ignore suppresses rules', async () => {
  const result = await capture(['--ignore', 'ax105,AX110', path.join(workspace, 'errors'), path.join(workspace, 'warnings')]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, []);
});

test('cli lints an explicitly given file', async () => {
  assert.equal((await capture([invalidPolicy])).code, 1);
});

test('cli exits 2 for unreadable paths and invalid options', async () => {
  const missing = await capture([path.join(workspace, 'missing')]);
  assert.equal(missing.code, 2);
  assert.match(missing.err[0], /^Cannot read /);
  assert.equal((await capture(['--bogus'])).code, 2);
});

test('cli --help prints usage', async () => {
  const result = await capture(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.out[0], /^Usage: apigee-x-linter/);
});

test('cli --version prints the package version', async () => {
  const result = await capture(['--version']);
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, [version]);
});

test('cli process sets the exit code', () => {
  const cli = path.join(repositoryRoot, 'src', 'cli.ts');
  const clean = spawnSync(process.execPath, ['--import', 'tsx', cli, fixtureBundle], { cwd: repositoryRoot, encoding: 'utf8' });
  const failing = spawnSync(process.execPath, ['--import', 'tsx', cli, path.join(workspace, 'errors')], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.deepEqual([clean.status, failing.status], [0, 1], `${clean.stderr}${failing.stderr}`);
  assert.match(failing.stdout, /error AX105/);
});
