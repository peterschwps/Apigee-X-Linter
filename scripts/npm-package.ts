import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The VS Code manifest cannot carry a scoped name, so the npm package gets its own manifest.
const root = path.resolve(__dirname, '..');
const stageDirectory = path.join(root, '.cache', 'npm-package');
const repository = 'https://github.com/peterschwps/Apigee-X-Linter';
const expectedFiles = /^(?:package\.json|README\.md|LICENSE|dist\/cli\.js|data\/reviewed\/[a-z0-9-]+\.json)$/;

type RootManifest = { version: string; license: string; keywords: string[] };

function exec(command: string, args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function stage(): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as RootManifest;
  await rm(stageDirectory, { recursive: true, force: true });
  await mkdir(path.join(stageDirectory, 'dist'), { recursive: true });
  await cp(path.join(root, 'dist', 'cli.js'), path.join(stageDirectory, 'dist', 'cli.js'));
  await cp(path.join(root, 'data', 'reviewed'), path.join(stageDirectory, 'data', 'reviewed'), { recursive: true });
  await cp(path.join(root, 'npm', 'README.md'), path.join(stageDirectory, 'README.md'));
  await cp(path.join(root, 'LICENSE'), path.join(stageDirectory, 'LICENSE'));
  const packageManifest = {
    name: '@peterschwps/apigee-x-linter',
    version: manifest.version,
    description: 'Command-line linter for Apigee X proxy and shared flow bundle XML, based on reviewed Google documentation.',
    license: manifest.license,
    keywords: [...manifest.keywords, 'cli', 'lint'],
    homepage: `${repository}#readme`,
    bugs: { url: `${repository}/issues` },
    repository: { type: 'git', url: `git+${repository}.git` },
    bin: { 'apigee-x-linter': 'dist/cli.js' },
    files: ['dist/cli.js', 'data/reviewed'],
    engines: { node: '>=20.1' },
    publishConfig: { access: 'public' },
  };
  await writeFile(path.join(stageDirectory, 'package.json'), `${JSON.stringify(packageManifest, null, 2)}\n`);
  console.log(`Staged ${packageManifest.name}@${packageManifest.version} in ${path.relative(root, stageDirectory)}.`);
}

async function check(): Promise<void> {
  await stage();
  const workspace = await mkdtemp(path.join(tmpdir(), 'apigee-x-linter-npm-'));
  try {
    // Verify the published file list before anything else.
    const packed = exec('npm', ['pack', '--json', '--pack-destination', workspace], stageDirectory);
    if (packed.status !== 0) throw new Error(`npm pack failed:\n${packed.stderr}`);
    const [tarball] = JSON.parse(packed.stdout) as { filename: string; files: { path: string }[] }[];
    const unexpected = tarball.files.map(file => file.path).filter(file => !expectedFiles.test(file));
    if (unexpected.length) throw new Error(`Unexpected files in the npm package: ${unexpected.join(', ')}`);

    // Install the tarball like a user would and run the installed command.
    const project = path.join(workspace, 'project');
    await mkdir(project);
    await writeFile(path.join(project, 'package.json'), '{ "private": true }\n');
    const installed = exec('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', path.join(workspace, tarball.filename)], project);
    if (installed.status !== 0) throw new Error(`npm install failed:\n${installed.stderr}`);
    const command = path.join(project, 'node_modules', '.bin', process.platform === 'win32' ? 'apigee-x-linter.cmd' : 'apigee-x-linter');
    const invalid = path.join(project, 'apiproxy', 'policies', 'FC.xml');
    await mkdir(path.dirname(invalid), { recursive: true });
    await writeFile(invalid, '<FlowCallout name="FC" enabled="flase"><SharedFlowBundle>s</SharedFlowBundle></FlowCallout>\n');
    const clean = exec(command, [path.join(root, 'test', 'fixtures')], project);
    const failing = exec(command, ['apiproxy'], project);
    if (clean.status !== 0 || failing.status !== 1 || !failing.stdout.includes('error AX105')) {
      throw new Error(`Installed command misbehaved (exit ${clean.status} and ${failing.status}):\n${clean.stdout}${clean.stderr}${failing.stdout}${failing.stderr}`);
    }
    console.log(`Checked ${tarball.filename}: ${tarball.files.length} files; the installed command reports findings with the expected exit codes.`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  switch (command) {
    case 'stage': await stage(); break;
    case 'check': await check(); break;
    default: throw new Error('Usage: npm-package.ts <stage|check>');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
