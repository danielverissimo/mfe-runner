import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { __test__, discoverWorkspace } from './discovery.mjs';

async function angularProject(projectPath, {
  name,
  scripts = { start: 'ng serve' },
  port,
  shell = false,
  federation = false,
  node = '24.15.0',
} = {}) {
  await mkdir(projectPath, { recursive: true });
  await writeFile(path.join(projectPath, 'package.json'), JSON.stringify({
    name,
    scripts,
  }));
  await writeFile(path.join(projectPath, 'angular.json'), JSON.stringify({
    projects: {
      app: {
        projectType: 'application',
        architect: { serve: { options: port ? { port } : {} } },
      },
    },
  }));
  await writeFile(path.join(projectPath, '.nvmrc'), `${node}\n`);
  if (federation) {
    await writeFile(
      path.join(projectPath, 'federation.config.mjs'),
      `export default { name: '${name}', exposes: { './Page': './src/page.ts' } };`,
    );
  }
  if (shell) {
    await writeFile(
      path.join(projectPath, 'federation.config.mjs'),
      `export default { name: '${name}', remotes: {} };`,
    );
    await mkdir(path.join(projectPath, 'src', 'assets', 'tenants', 'demo'), {
      recursive: true,
    });
    await writeFile(
      path.join(projectPath, 'src', 'assets', 'tenants', 'registry.json'),
      JSON.stringify({
        tenants: [{ manifestPath: 'demo/manifest.json' }],
      }),
    );
    await writeFile(
      path.join(projectPath, 'src', 'assets', 'tenants', 'demo', 'manifest.json'),
      JSON.stringify({
        tenantId: 'demo',
        tenantName: 'Demo',
        microFrontends: [{
          id: name.replace('plataforma-', ''),
          remoteName: name,
          type: 'native-federation',
          environments: { local: `http://localhost:${port ?? 4310}` },
        }],
      }),
    );
  }
}

async function angularLibrary(projectPath) {
  await mkdir(projectPath, { recursive: true });
  await writeFile(path.join(projectPath, 'package.json'), JSON.stringify({
    name: 'web-common-lib',
    scripts: {
      build: 'ng build web-common-lib',
      watch: 'ng build web-common-lib --watch',
    },
  }));
  await writeFile(path.join(projectPath, 'angular.json'), JSON.stringify({
    projects: {
      'web-common-lib': {
        projectType: 'library',
        root: '',
        architect: {
          build: { options: { project: 'ng-package.json' } },
        },
      },
    },
  }));
  await writeFile(
    path.join(projectPath, 'ng-package.json'),
    JSON.stringify({ dest: 'dist/web-common-lib' }),
  );
  await writeFile(path.join(projectPath, '.nvmrc'), '24.15.0\n');
  await mkdir(path.join(projectPath, 'dist', 'web-common-lib'), {
    recursive: true,
  });
  await writeFile(
    path.join(projectPath, 'dist', 'web-common-lib', 'package.json'),
    JSON.stringify({ name: 'web-common-lib' }),
  );
}

test('discovers exact shell and multiple MFE roots with stable IDs and dedupe', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-discovery-'));
  const shellPath = path.join(base, 'shell');
  const rootA = path.join(base, 'mfes');
  const rootB = path.join(rootA, 'nested');
  await angularProject(shellPath, {
    name: 'plataforma',
    port: 4200,
    shell: true,
  });
  await angularProject(path.join(rootA, 'example'), {
    name: 'plataforma-example',
    port: 4310,
    federation: true,
  });
  await angularProject(path.join(rootB, 'other'), {
    name: 'plataforma-other',
    port: 4311,
    federation: true,
  });
  const catalog = await discoverWorkspace({
    id: 'workspace',
    name: 'Workspace',
    projectSources: [
      {
        id: 'host-source',
        rootPath: shellPath,
        rootProjectId: 'shell',
        projects: [{ relativePath: '.', kind: 'project', kindSource: 'detected' }],
      },
      { id: 'root-a', rootPath: rootA, rootProjectId: 'root-a', projects: [] },
      { id: 'root-b', rootPath: rootB, rootProjectId: 'root-b', projects: [] },
    ],
    environment: 'local',
    nodePolicy: { mode: 'auto' },
    projectOverrides: {},
    excludedProjectIds: [],
  }, { mode: 'auto' });
  assert.equal(catalog.projects.at(-1).id, 'shell');
  assert.equal(catalog.projects.at(-1).role, 'shell');
  assert.equal(catalog.projects.filter((project) => project.role === 'mfe').length, 2);
  assert.equal(catalog.projects.some((project) => project.id === 'root-a/example'), true);
  assert.equal(new Set(catalog.projects.map((project) => project.absolutePath)).size, 3);
  assert.equal(catalog.manifests[0].tenantId, 'demo');
});

test('uses configured override, otherwise prioritizes the start script', () => {
  assert.equal(
    __test__.selectDefaultScript('mfe', { ng: 'ng', start: 'ng serve' }),
    'start',
  );
  assert.equal(
    __test__.selectDefaultScript(
      'mfe',
      { ng: 'ng', start: 'ng serve' },
      'ng',
    ),
    'ng',
  );
});

test('applies a persisted visual order without changing startup priorities', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-order-'));
  const root = path.join(base, 'projects');
  await angularProject(path.join(root, 'first'), { name: 'first' });
  await angularProject(path.join(root, 'second'), { name: 'second' });
  const catalog = await discoverWorkspace({
    id: 'workspace',
    name: 'Workspace',
    projectSources: [{
      id: 'root',
      rootPath: root,
      rootProjectId: 'root',
      projects: [],
    }],
    environment: 'local',
    nodePolicy: { mode: 'inherit' },
    projectOverrides: {
      'root/first': { startupOrder: 100 },
      'root/second': { startupOrder: 900 },
    },
    projectOrder: ['root/second', 'root/first'],
    excludedProjectIds: [],
  }, { mode: 'auto' });

  assert.deepEqual(
    catalog.projects.map((project) => project.id),
    ['root/second', 'root/first'],
  );
  assert.deepEqual(
    catalog.projects.map((project) => project.startupOrder),
    [900, 100],
  );
});

test('keeps excluded projects out of the generic catalog', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-excluded-'));
  const shellPath = path.join(base, 'shell');
  const root = path.join(base, 'mfes');
  await angularProject(shellPath, { name: 'shell', shell: true });
  await angularProject(path.join(root, 'hidden'), {
    name: 'hidden',
    federation: true,
  });
  const catalog = await discoverWorkspace({
    id: 'workspace',
    name: 'Workspace',
    projectSources: [
      {
        id: 'host-source',
        rootPath: shellPath,
        rootProjectId: 'shell',
        projects: [{ relativePath: '.', kind: 'project', kindSource: 'detected' }],
      },
      { id: 'root', rootPath: root, rootProjectId: 'root', projects: [] },
    ],
    environment: 'local',
    nodePolicy: { mode: 'inherit' },
    projectOverrides: {},
    excludedProjectIds: ['root/hidden'],
  }, { mode: 'auto' });
  assert.deepEqual(catalog.projects.map((project) => project.id), ['shell']);
});

test('discovers linked libraries first with stable IDs and consumer link status', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-libraries-'));
  const shellPath = path.join(base, 'shell');
  const libraryPath = path.join(base, 'web-common');
  const root = path.join(base, 'mfes');
  await angularProject(shellPath, {
    name: 'shell',
    shell: true,
    scripts: {
      start: 'ng serve',
      'link:web-common': 'node link.js',
    },
  });
  await angularLibrary(libraryPath);
  await angularProject(path.join(root, 'consumer'), {
    name: 'consumer',
    federation: true,
    scripts: {
      start: 'ng serve',
      'link:web-common': 'node link.js',
    },
  });

  const catalog = await discoverWorkspace({
    id: 'workspace',
    name: 'Workspace',
    projectSources: [{
      id: 'host-source',
      rootPath: shellPath,
      rootProjectId: 'shell',
      projects: [{ relativePath: '.', kind: 'project', kindSource: 'detected' }],
    }, {
      id: 'root',
      rootPath: root,
      rootProjectId: 'root',
      projects: [],
    }, {
      id: 'web-common',
      rootPath: libraryPath,
      rootProjectId: 'library:web-common',
      projects: [{
        relativePath: '.',
        kind: 'library',
        kindSource: 'user',
        localLibraryLink: {
          enabled: true,
          packageName: '',
          developmentScript: 'watch',
          artifactRelativePath: 'dist/web-common-lib',
          preferredLinkScript: 'link:web-common',
        },
      }],
    }],
    environment: 'local',
    nodePolicy: { mode: 'inherit' },
    projectOverrides: {},
    excludedProjectIds: [],
  }, { mode: 'auto' });

  assert.deepEqual(
    catalog.projects.map((project) => project.id),
    ['library:web-common', 'root/consumer', 'shell'],
  );
  assert.equal(catalog.projects[0].role, 'library');
  assert.equal(catalog.projects[0].defaultScript, 'watch');
  assert.equal(catalog.projects[1].libraryLinks[0].script, 'link:web-common');
  assert.equal(catalog.projects[1].libraryLinks[0].state, 'not-linked');
});
