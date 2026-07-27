import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  findNearestNvmrc,
  listInstalledNodeVersions,
  resolveNodeRuntime,
  selectPolicy,
} from './node-resolver.mjs';

test('lists installed NVM versions without invoking a shell', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Fixture uses the nvm-sh directory layout.');
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-nvm-list-'));
  const nvmDirectory = path.join(root, '.nvm');
  for (const version of ['22.12.0', '24.15.0']) {
    const bin = path.join(nvmDirectory, 'versions', 'node', `v${version}`, 'bin');
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, 'node'), '#!/bin/sh\n');
    await writeFile(path.join(bin, 'npm'), '#!/bin/sh\n');
    await chmod(path.join(bin, 'node'), 0o755);
    await chmod(path.join(bin, 'npm'), 0o755);
  }

  const catalog = await listInstalledNodeVersions({
    environment: { NVM_DIR: nvmDirectory },
    platform: 'darwin',
    homeDirectory: root,
  });

  assert.equal(catalog.detected, true);
  assert.equal(catalog.manager, 'nvm-sh');
  assert.deepEqual(catalog.versions, ['24.15.0', '22.12.0']);
});

test('uses project, workspace and global policy precedence', () => {
  assert.deepEqual(
    selectPolicy({
      projectPolicy: { mode: 'explicit', version: '20.0.0' },
      workspacePolicy: { mode: 'explicit', version: '22.0.0' },
      globalPolicy: { mode: 'auto' },
    }),
    { mode: 'explicit', version: '20.0.0' },
  );
  assert.deepEqual(
    selectPolicy({
      projectPolicy: { mode: 'inherit' },
      workspacePolicy: { mode: 'auto' },
      globalPolicy: { mode: 'explicit', version: '24.0.0' },
    }),
    { mode: 'auto' },
  );
});

test('finds the nearest nvmrc without leaving the workspace root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-node-'));
  const project = path.join(root, 'mfes', 'example');
  await mkdir(project, { recursive: true });
  await writeFile(path.join(root, '.nvmrc'), '22.12.0\n');
  await writeFile(path.join(project, '.nvmrc'), '24.15.0\n');

  const result = await findNearestNvmrc(project, root);
  assert.equal(result.version, '24.15.0');
  assert.equal(result.path, path.join(await realpath(project), '.nvmrc'));
});

test('resolves an exact Node runtime from NVM without executing a shell', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Fixture uses the nvm-sh directory layout.');
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-node-'));
  const project = path.join(root, 'project');
  const nvmDirectory = path.join(root, '.nvm');
  const bin = path.join(nvmDirectory, 'versions', 'node', 'v24.15.0', 'bin');
  await mkdir(project, { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(project, '.nvmrc'), '24.15.0\n');
  await writeFile(path.join(bin, 'node'), '#!/bin/sh\n');
  await writeFile(path.join(bin, 'npm'), '#!/bin/sh\n');
  await chmod(path.join(bin, 'node'), 0o755);
  await chmod(path.join(bin, 'npm'), 0o755);

  const runtime = await resolveNodeRuntime({
    projectPath: project,
    workspaceRoot: root,
    projectPolicy: { mode: 'auto' },
    workspacePolicy: { mode: 'inherit' },
    globalPolicy: { mode: 'auto' },
    environment: { NVM_DIR: nvmDirectory, PATH: '' },
  });

  assert.equal(runtime.available, true);
  assert.equal(runtime.version, '24.15.0');
  assert.equal(runtime.npmExecutable, path.join(bin, 'npm'));
});

test('resolves NVM for Windows from the standard AppData directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-node-win-'));
  const project = path.join(root, 'project');
  const appData = path.join(root, 'AppData', 'Roaming');
  const bin = path.join(appData, 'nvm', 'v24.15.0');
  await mkdir(project, { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(project, '.nvmrc'), '24.15.0\n');
  await writeFile(path.join(bin, 'node.exe'), '');
  await writeFile(path.join(bin, 'npm.cmd'), '');
  await chmod(path.join(bin, 'node.exe'), 0o755);
  await chmod(path.join(bin, 'npm.cmd'), 0o755);

  const runtime = await resolveNodeRuntime({
    projectPath: project,
    workspaceRoot: root,
    projectPolicy: { mode: 'auto' },
    workspacePolicy: { mode: 'inherit' },
    globalPolicy: { mode: 'auto' },
    environment: { APPDATA: appData, PATH: '' },
    platform: 'win32',
    homeDirectory: root,
  });

  assert.equal(runtime.available, true);
  assert.equal(runtime.version, '24.15.0');
  assert.equal(runtime.nodeExecutable, path.join(bin, 'node.exe'));
  assert.equal(runtime.npmExecutable, path.join(bin, 'npm.cmd'));
});
