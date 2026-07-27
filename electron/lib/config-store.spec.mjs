import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigStore } from './config-store.mjs';

const input = {
  name: 'Workspace',
  projectSources: [{
    rootPath: '/tmp/projects',
    projects: [
      { relativePath: 'app', kind: 'project', kindSource: 'detected' },
      {
        relativePath: 'lib',
        kind: 'library',
        kindSource: 'user',
        localLibraryLink: {
          enabled: true,
          packageName: 'common-lib',
          developmentScript: 'watch',
          artifactRelativePath: 'dist/common-lib',
          preferredLinkScript: 'link:common',
        },
      },
    ],
  }],
  environment: 'local',
  nodePolicy: { mode: 'inherit' },
};

test('persists v5 sources, stable IDs, overrides and exclusions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const store = new ConfigStore(configPath);
  await store.load();
  const workspace = await store.addWorkspace(input);
  const sourceId = workspace.projectSources[0].id;
  await store.updateProject(workspace.id, `${sourceId}/app`, {
    nodePolicy: { mode: 'explicit', version: '20.19.0' },
    defaultScript: 'start',
    startupOrder: 420,
  });
  await store.updateWorkspace(workspace.id, { ...input, name: 'Renamed' });
  assert.equal(store.snapshot.workspaces[0].projectSources[0].id, sourceId);
  await store.updateProjectOrder(workspace.id, [
    `${sourceId}/lib`,
    `${sourceId}/app`,
  ]);
  assert.deepEqual(store.snapshot.workspaces[0].projectOrder, [
    `${sourceId}/lib`,
    `${sourceId}/app`,
  ]);
  await store.excludeProject(workspace.id, `${sourceId}/app`);
  await store.excludeProject(workspace.id, `${sourceId}/lib`);
  const persisted = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(persisted.version, 5);
  assert.equal(persisted.workspaces[0].name, 'Renamed');
  assert.deepEqual(persisted.workspaces[0].excludedProjectIds, [
    `${sourceId}/app`,
    `${sourceId}/lib`,
  ]);
  assert.deepEqual(persisted.workspaces[0].projectOrder, []);
});

test('migrates v4 shell, roots and linked libraries into v5 sources', async () => {
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
      libraries: [{
        id: 'common',
        rootPath: '/tmp/common',
        developmentScript: 'watch',
        artifactRelativePath: 'dist/common',
        preferredLinkScript: 'link:common',
      }],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
      projectOverrides: {},
      excludedProjectIds: [],
    }],
  }));
  const store = new ConfigStore(configPath);
  const snapshot = await store.load();
  assert.equal(snapshot.version, 5);
  assert.equal(snapshot.workspaces[0].projectSources.length, 3);
  assert.equal(snapshot.workspaces[0].projectSources[0].rootProjectId, 'shell');
  assert.equal(
    snapshot.workspaces[0].projectSources[2].projects[0].localLibraryLink.enabled,
    true,
  );
  await readFile(path.join(directory, 'runner-config.v4.backup.json'));
});

test('uses keep-running for new installs and preserves the v4 fallback', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const fresh = new ConfigStore(path.join(directory, 'fresh.json'));
  await fresh.load();
  assert.equal(fresh.snapshot.settings.stopProcessesOnExit, false);
  const oldPath = path.join(directory, 'old.json');
  await writeFile(oldPath, JSON.stringify({ version: 4, settings: {}, workspaces: [] }));
  const old = new ConfigStore(oldPath);
  await old.load();
  assert.equal(old.snapshot.settings.stopProcessesOnExit, true);
});

test('allows the same source path in different workspaces', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const store = new ConfigStore(path.join(directory, 'runner-config.json'));
  await store.load();
  await store.addWorkspace(input);
  await store.addWorkspace({ ...input, name: 'Other' });
  assert.equal(store.snapshot.workspaces.length, 2);
});

test('backs up unsupported legacy configuration and starts with empty v5', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const legacy = { version: 3, shells: [{ id: 'shell' }] };
  await writeFile(configPath, JSON.stringify(legacy));
  const store = new ConfigStore(configPath);
  const snapshot = await store.load();
  assert.equal(snapshot.version, 5);
  assert.deepEqual(snapshot.workspaces, []);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, 'runner-config.v3.backup.json'))),
    legacy,
  );
});
