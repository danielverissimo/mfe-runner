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

test('persists v6 sources, stable IDs, policies, overrides and exclusions', async () => {
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
  assert.equal(persisted.version, 6);
  assert.equal(persisted.workspaces[0].name, 'Renamed');
  assert.deepEqual(persisted.workspaces[0].excludedProjectIds, [
    `${sourceId}/app`,
    `${sourceId}/lib`,
  ]);
  assert.deepEqual(persisted.workspaces[0].projectOrder, []);
});

test('persists external services in schema v6 and removes only their definitions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const store = new ConfigStore(configPath);
  await store.load();
  const workspace = await store.addWorkspace(input);
  const service = await store.addExternalService(workspace.id, {
    name: 'API externa',
    scheme: 'http',
    host: 'localhost',
    port: 9090,
    provider: 'process',
    identity: { pid: 4321, name: 'java' },
    logSource: { type: 'none' },
  });
  assert.match(service.id, /^external-service:/);
  const persisted = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(persisted.version, 6);
  assert.equal(persisted.workspaces[0].externalServices[0].port, 9090);

  await store.removeExternalService(workspace.id, service.id);
  assert.deepEqual(store.snapshot.workspaces[0].externalServices, []);
});

test('migrates v4 shell, roots and linked libraries into v6 sources', async () => {
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
  assert.equal(snapshot.version, 6);
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
  assert.equal(fresh.snapshot.settings.theme, 'system');
  const oldPath = path.join(directory, 'old.json');
  await writeFile(oldPath, JSON.stringify({ version: 4, settings: {}, workspaces: [] }));
  const old = new ConfigStore(oldPath);
  await old.load();
  assert.equal(old.snapshot.settings.stopProcessesOnExit, true);
  assert.equal(old.snapshot.settings.theme, 'system');
  assert.deepEqual(old.snapshot.settings.ngrok, { executablePath: null });
});

test('persists only the optional ngrok executable path in v6 settings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const store = new ConfigStore(configPath);
  await store.load();
  await store.updateSettings({
    ngrok: {
      executablePath: '/opt/homebrew/bin/ngrok',
      authtoken: 'must-not-be-persisted',
      apiKey: 'must-not-be-persisted',
    },
  });
  assert.deepEqual(store.snapshot.settings.ngrok, {
    executablePath: '/opt/homebrew/bin/ngrok',
  });
  const persisted = await readFile(configPath, 'utf8');
  assert.doesNotMatch(persisted, /must-not-be-persisted/);
});

test('persists a valid appearance theme and sanitizes unsupported values', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const store = new ConfigStore(configPath);
  await store.load();

  await store.updateSettings({ theme: 'light' });
  assert.equal(store.snapshot.settings.theme, 'light');

  await store.updateSettings({ theme: 'unsupported' });
  assert.equal(store.snapshot.settings.theme, 'system');
  const persisted = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(persisted.settings.theme, 'system');
});

test('allows the same source path in different workspaces', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const store = new ConfigStore(path.join(directory, 'runner-config.json'));
  await store.load();
  await store.addWorkspace(input);
  await store.addWorkspace({ ...input, name: 'Other' });
  assert.equal(store.snapshot.workspaces.length, 2);
});

test('migrates v5 Node policies and command overrides into v6', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  await writeFile(configPath, JSON.stringify({
    version: 5,
    settings: {
      globalNodePolicy: { mode: 'explicit', version: '22.17.0' },
      stopProcessesOnExit: false,
      logLimit: 900,
    },
    workspaces: [{
      id: 'workspace',
      name: 'Workspace',
      projectSources: [{
        id: 'source',
        rootPath: '/tmp/project',
        rootProjectId: 'source',
        projects: [{
          relativePath: '.',
          kind: 'project',
          kindSource: 'detected',
        }],
      }],
      environment: 'local',
      nodePolicy: { mode: 'auto' },
      projectOverrides: {
        source: {
          nodePolicy: { mode: 'explicit', version: '20.19.0' },
          defaultScript: 'start',
        },
      },
      excludedProjectIds: [],
    }],
  }));
  const store = new ConfigStore(configPath);
  const snapshot = await store.load();
  assert.equal(snapshot.version, 6);
  assert.deepEqual(
    snapshot.settings.executionPolicies.node.runtime,
    { mode: 'explicit', version: '22.17.0' },
  );
  assert.deepEqual(
    snapshot.workspaces[0].executionPolicies.node.runtime,
    { mode: 'auto' },
  );
  assert.equal(
    snapshot.workspaces[0].projectOverrides.source.defaultCommandId,
    'node:script:start',
  );
  await readFile(path.join(directory, 'runner-config.v5.backup.json'));
});

test('backs up unsupported legacy configuration and starts with empty v6', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-config-'));
  const configPath = path.join(directory, 'runner-config.json');
  const legacy = { version: 3, shells: [{ id: 'shell' }] };
  await writeFile(configPath, JSON.stringify(legacy));
  const store = new ConfigStore(configPath);
  const snapshot = await store.load();
  assert.equal(snapshot.version, 6);
  assert.deepEqual(snapshot.workspaces, []);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, 'runner-config.v3.backup.json'))),
    legacy,
  );
});
