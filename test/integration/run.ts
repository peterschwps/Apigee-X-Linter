import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';
import { build } from 'esbuild';

// The engine floor from package.json, so the oldest supported VS Code is exercised.
const vscodeVersion = '1.96.0';
const root = path.resolve(__dirname, '..', '..');
const outputDirectory = path.join(root, '.cache', 'integration');

const workspaceFiles: Record<string, string> = {
  'apiproxy/policies/FC-Typo.xml': '<FlowCallout name="FC-Typo" enabled="flase">\n  <SharedFlowBundle>shared</SharedFlowBundle>\n</FlowCallout>\n',
  'apiproxy/policies/FC-Disable.xml': '<FlowCallout name="FC-Disable">\n  <SharedFlowBundle>shared</SharedFlowBundle>\n  <Bogus/>\n</FlowCallout>\n',
  'apiproxy/proxies/default.xml': '<ProxyEndpoint name="default">\n  <PreFlow>\n    <Request>\n      <Step>\n        <Name></Name>\n      </Step>\n    </Request>\n  </PreFlow>\n</ProxyEndpoint>\n',
};

async function main(): Promise<void> {
  // The extension host loads plain JavaScript, so bundle the TypeScript suite first.
  const suite = path.join(outputDirectory, 'suite.js');
  await build({ entryPoints: [path.join(__dirname, 'suite.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: suite, logLevel: 'warning' });

  const workspace = await mkdtemp(path.join(tmpdir(), 'apigee-x-linter-integration-'));
  const userData = await mkdtemp(path.join(tmpdir(), 'apigee-x-linter-user-data-'));
  try {
    for (const [file, content] of Object.entries(workspaceFiles)) {
      await mkdir(path.dirname(path.join(workspace, file)), { recursive: true });
      await writeFile(path.join(workspace, file), content);
    }
    await runTests({
      version: vscodeVersion,
      cachePath: path.join(root, '.cache', 'vscode-test'),
      extensionDevelopmentPath: root,
      extensionTestsPath: suite,
      launchArgs: [workspace, '--disable-extensions', '--skip-welcome', '--skip-release-notes', `--user-data-dir=${userData}`, `--extensions-dir=${path.join(userData, 'extensions')}`],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(userData, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
