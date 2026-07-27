import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigStore } from './config-store.mjs';

const input = {
  name: 'Workspace',
  shellRootPath: '/tmp/shell',
  mfeRootPaths: ['/tmp/mfes-a', '/tmp/mfes-b'],
  libraries: [{
    rootPath: '/tmp/web-common',
    developmentScript: 'watch',
    artifactRelativePath: 'dist/web-common-lib',
    preferredLinkScript: 'link:web-common',
  }],
  environment: 'local',
  nodePolicy: { mode: 'inherit' },
};

test('persists v4 workspaces, stable roots, overrides and exclusions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const store = new ConfigStore(configPath);
  await store.load();
  const workspace = await store.addWorkspace(input);
  const firstRootId = workspace.mfeRoots[0].id;
  const libraryId = workspace.libraries[0].id;
  await store.updateProject(workspace.id, `${firstRootId}/example`, {
    nodePolicy: { mode: 'explicit', version: '20.19.0' },
    defaultScript: 'start',
    libraryLinkScripts: { [libraryId]: 'link:web-common' },
  });
  await store.updateSettings({
    ide: {
      id: 'vscode',
      name: 'Visual Studio Code',
      executablePath: '/Applications/Visual Studio Code.app/bin/code',
    },
  });
  await store.updateWorkspace(workspace.id, {
    ...input,
    name: 'Renamed',
    mfeRootPaths: ['/tmp/mfes-b', '/tmp/mfes-a'],
  });
  const updated = store.snapshot.workspaces[0];
  assert.equal(updated.mfeRoots[1].id, firstRootId);
  assert.equal(updated.libraries[0].id, libraryId);
  await store.excludeProject(workspace.id, `${firstRootId}/example`);
  const persisted = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(persisted.version, 4);
  assert.equal(persisted.workspaces[0].name, 'Renamed');
  assert.equal(persisted.settings.ide.id, 'vscode');
  assert.deepEqual(persisted.workspaces[0].excludedProjectIds, [
    `${firstRootId}/example`,
  ]);
  assert.equal(
    persisted.workspaces[0].projectOverrides[`${firstRootId}/example`],
    undefined,
  );
  assert.equal(persisted.workspaces[0].libraries[0].id, libraryId);

  await store.restoreExcludedProjects(workspace.id);
  const restored = JSON.parse(await readFile(configPath, 'utf8'));
  assert.deepEqual(restored.workspaces[0].excludedProjectIds, []);
});

test('loads existing v4 workspaces without libraries as an empty list', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  await writeFile(configPath, JSON.stringify({
    version: 4,
    settings: {},
    workspaces: [{
      id: 'workspace',
      name: 'Workspace',
      shellRootPath: '/tmp/shell',
      mfeRoots: [{ id: 'root', rootPath: '/tmp/mfes' }],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
      projectOverrides: {},
      excludedProjectIds: [],
    }],
  }));
  const store = new ConfigStore(configPath);

  const snapshot = await store.load();

  assert.deepEqual(snapshot.workspaces[0].libraries, []);
});

test('uses keep-running for new installs but preserves the safe legacy fallback', async () => {
  const freshDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'mfe-runner-config-fresh-'),
  );
  const freshStore = new ConfigStore(
    path.join(freshDirectory, 'runner-config.json'),
  );
  await freshStore.load();
  assert.equal(freshStore.snapshot.settings.stopProcessesOnExit, false);

  const oldDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'mfe-runner-config-old-v4-'),
  );
  const oldConfigPath = path.join(oldDirectory, 'runner-config.json');
  await writeFile(oldConfigPath, JSON.stringify({
    version: 4,
    settings: {},
    workspaces: [],
  }));
  const oldStore = new ConfigStore(oldConfigPath);
  await oldStore.load();
  assert.equal(oldStore.snapshot.settings.stopProcessesOnExit, true);

  await oldStore.updateSettings({ stopProcessesOnExit: false });
  const reloaded = new ConfigStore(oldConfigPath);
  await reloaded.load();
  assert.equal(reloaded.snapshot.settings.stopProcessesOnExit, false);
});

test('rejects a shell path already assigned to another workspace', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const store = new ConfigStore(path.join(directory, 'runner-config.json'));
  await store.load();
  await store.addWorkspace(input);
  await assert.rejects(
    () => store.addWorkspace({ ...input, name: 'Other', mfeRootPaths: ['/other'] }),
    /outra workspace/,
  );
});

test('backs up legacy configuration and starts with an empty v4 config', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const legacy = { version: 3, shells: [{ id: 'shell' }], tenants: [{ id: 'tenant' }] };
  await writeFile(configPath, JSON.stringify(legacy));
  const store = new ConfigStore(configPath);
  const snapshot = await store.load();
  assert.equal(snapshot.version, 4);
  assert.deepEqual(snapshot.workspaces, []);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, 'runner-config.v3.backup.json'))),
    legacy,
  );
});
