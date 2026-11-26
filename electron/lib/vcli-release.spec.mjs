import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PackageJsonProjectDetector } from './project-detectors.mjs';
import { validateProcessRequest } from './contracts.mjs';
import { createLaunchSpecification } from './launch-specification.mjs';
import { ProcessSupervisor } from './process-supervisor.mjs';
import {
  applyRequestedVcliRelease, supportsVcliRelease, validateVcliRelease,
  vcliReleaseArgs, vcliReleaseEnvironment, VCLI_RELEASE_COMMAND,
} from './vcli-release.mjs';

const options = {
  version: '1.2.3', target: 'all', mode: 'local', dryRun: true, includeUntracked: false,
};
const manifest = {
  name: 'vcli',
  scripts: {
    dev: 'vite',
    desktop: 'tauri dev',
    'package:mac:arm64': 'npm run package:mac -- --arch arm64',
    'release:publish': 'node scripts/release-orchestrator.mjs',
  },
};
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-vcli-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'));
  await mkdir(path.join(root, 'src-tauri'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'distribution.config.json'), '{}');
  await writeFile(path.join(root, 'src-tauri/tauri.conf.json'), '{}');
  await writeFile(path.join(root, 'scripts/release-orchestrator.mjs'), '');
  const detected = await new PackageJsonProjectDetector().detect(root, root);
  return {
    ...detected, id: 'vcli', absolutePath: root, port: 1420,
    node: { available: true, nodeExecutable: process.execPath, npmExecutable: process.execPath },
    runtime: { available: true, compatibility: 'ready' },
  };
}

test('discovers the project-owned VCLI release without executing it', async (t) => {
  const project = await fixture(t);
  assert.equal(project.commands.find((c) => c.id === VCLI_RELEASE_COMMAND).releaseKind, 'vcli');
  assert.equal(project.defaultCommandId, 'node:script:desktop');
  assert.equal(await supportsVcliRelease(project.absolutePath, { ...manifest, name: 'other' }), false);
  assert.equal(await supportsVcliRelease(project.absolutePath, { ...manifest, scripts: { 'release:publish': 'node other.mjs' } }), false);
  await rm(path.join(project.absolutePath, 'distribution.config.json'));
  assert.equal(await supportsVcliRelease(project.absolutePath, manifest), false);
});

test('runs VCLI desktop in watch mode and packages a single target as a build', async (t) => {
  const project = await fixture(t);
  const workspace = { id: 'vcli', name: 'VCLI', environment: 'local' };
  const desktop = createLaunchSpecification({ workspace, project });
  assert.deepEqual(desktop.args.slice(-2), ['run', 'desktop']);
  assert.equal(desktop.longRunning, true);
  const packageId = 'node:script:package:mac:arm64';
  const packaging = createLaunchSpecification({ workspace, project, commandId: packageId });
  assert.deepEqual(packaging.args.slice(-2), ['run', 'package:mac:arm64']);
  assert.equal(packaging.longRunning, false);
  assert.equal(project.commands.find(({ id }) => id === packageId).category, 'build');
  if (process.platform === 'darwin') {
    assert.ok(desktop.env.PATH.split(path.delimiter).includes(path.join(os.homedir(), '.cargo/bin')));
    assert.equal(packaging.env.PATH, desktop.env.PATH);
  }
});

test('validates release options at the IPC boundary and rejects raw arguments and credentials', () => {
  const request = { workspaceId: 'workspace', projectId: 'vcli', commandId: VCLI_RELEASE_COMMAND, release: options };
  assert.deepEqual(validateProcessRequest(request).release, options);
  for (const invalid of [null, [], { ...options, args: ['--help'] }, { ...options, password: 'synthetic' },
    { ...options, version: '1.2;echo' }, { ...options, version: '01.2.3' },
    { ...options, target: '--help' }, { ...options, dryRun: 'false' },
    { ...options, includeUntracked: 'false' }, { ...options, mode: 'shell' },
    { ...options, ghUser: '--help' }, { ...options, notesFile: 'relative.md' },
    { ...options, publicKeyFile: '/tmp/key\nfile' }]) {
    assert.throws(() => validateProcessRequest({ ...request, release: invalid }));
  }
});

test('builds fixed arguments for all targets, validation and publication', () => {
  assert.deepEqual(vcliReleaseArgs(options, 'darwin'), ['--version', '1.2.3', '--all', '--local', '--dry-run']);
  assert.deepEqual(vcliReleaseArgs({ ...options, target: 'windows-x64', mode: 'actions', dryRun: false,
    includeUntracked: true, ghUser: 'example-user', publicKeyFile: '/tmp/public key.pub', notesFile: '/tmp/notes.md' }, 'linux'),
  ['--version', '1.2.3', '--target', 'windows-x64', '--include-untracked', '--gh-user', 'example-user', '--public-key-file', '/tmp/public key.pub', '--notes', '/tmp/notes.md']);
  for (const target of ['macos-arm64', 'macos-x64', 'windows-arm64', 'windows-x64', 'linux-arm64', 'linux-x64']) {
    assert.deepEqual(vcliReleaseArgs({ ...options, target }, 'darwin').slice(2, 4), ['--target', target]);
  }
  assert.throws(() => vcliReleaseArgs(options, 'linux'), /Mac/);
  assert.throws(() => vcliReleaseArgs({ ...options, mode: 'actions' }, 'win32'), /Mac/);
});

test('rechecks the entry point and refuses options for another command or project', async (t) => {
  const project = await fixture(t);
  const request = { commandId: VCLI_RELEASE_COMMAND, release: { ...options, mode: 'actions', target: 'linux-x64' } };
  const launchProject = await applyRequestedVcliRelease(project, request);
  for (const legacy of [{ commandId: 'release:publish' }, { script: 'release:publish' }]) {
    await assert.rejects(applyRequestedVcliRelease(project, legacy));
    assert.throws(() => createLaunchSpecification({ workspace: { name: 'test' }, project, commandId: legacy.commandId || 'release:publish' }));
  }
  assert.deepEqual(launchProject.release, request.release);
  await assert.rejects(applyRequestedVcliRelease(project, { ...request, commandId: 'node:script:dev' }));
  await assert.rejects(applyRequestedVcliRelease({ ...project, ecosystem: 'rust' }, request));
  await assert.rejects(applyRequestedVcliRelease(project, { commandId: VCLI_RELEASE_COMMAND }));
  await writeFile(path.join(project.absolutePath, 'package.json'), JSON.stringify({ ...manifest, scripts: {} }));
  await assert.rejects(applyRequestedVcliRelease(project, request), /mudou/);
});

test('release launch requires structured options and ignores application port and health checks', async (t) => {
  const project = await fixture(t);
  const workspace = { id: 'workspace', name: 'test', environment: 'local' };
  assert.throws(() => createLaunchSpecification({ workspace, project, commandId: VCLI_RELEASE_COMMAND }));
  const launch = createLaunchSpecification({ workspace, project: { ...project, release: { ...options, mode: 'actions', target: 'linux-x64' } }, commandId: VCLI_RELEASE_COMMAND });
  assert.equal(launch.port, null);
  assert.deepEqual(launch.healthCheck, { type: 'process' });
  assert.equal(launch.longRunning, false);
  assert.deepEqual(launch.args, ['run', 'release:publish', '--', '--version', '1.2.3', '--target', 'linux-x64', '--dry-run']);
});

test('supervises a synthetic release, captures logs and exit status, and blocks restart before stop', async (t) => {
  const project = await fixture(t);
  await writeFile(path.join(project.absolutePath, 'scripts/release-orchestrator.mjs'),
    "console.log('synthetic release ' + JSON.stringify(process.argv.slice(2))); setTimeout(() => process.exit(Number(process.env.VCLI_TEST_EXIT || 0)), 80);");
  project.node.npmExecutable = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const supervisor = new ProcessSupervisor();
  t.after(() => supervisor.stopAll());
  const request = { workspace: { id: 'workspace', name: 'test', environment: 'local' },
    project: { ...project, release: { ...options, mode: 'actions', target: 'linux-x64' } }, commandId: VCLI_RELEASE_COMMAND };
  await supervisor.start(request);
  await assert.rejects(supervisor.restart('workspace', 'vcli'), /nova execução/);
  let result;
  for (let i = 0; i < 100; i++) {
    result = supervisor.snapshot()[0];
    if (result.stoppedAt) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(result.status, 'stopped');
  assert.equal(result.exitCode, 0);
  assert.ok(supervisor.snapshot()[0].logs.some((entry) => entry.message.includes('synthetic release')));
  request.project.runtime = { ...project.runtime, environment: { VCLI_TEST_EXIT: '7' } };
  await supervisor.start(request);
  for (let i = 0; i < 100; i++) {
    result = supervisor.snapshot()[0];
    if (result.stoppedAt) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 7);
});

test('preserves the resolved runtime PATH and appends macOS build-tool fallbacks', () => {
  const environment = { PATH: '/selected-node/bin:/usr/bin', EXAMPLE: 'value' };
  const resolved = vcliReleaseEnvironment(environment, 'darwin', '/test-home');
  assert.ok(resolved.PATH.startsWith(environment.PATH + ':'));
  assert.ok(resolved.PATH.includes('/test-home/.cargo/bin'));
  assert.ok(resolved.PATH.includes('/Applications/Docker.app/Contents/Resources/bin'));
  assert.equal(resolved.EXAMPLE, 'value');
  assert.equal(vcliReleaseEnvironment(environment, 'linux'), environment);
});
