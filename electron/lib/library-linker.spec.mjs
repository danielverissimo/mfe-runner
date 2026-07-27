import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildLibraryLinkPlan,
  executeLibraryLinks,
} from './library-linker.mjs';

function catalogFixture(artifactPath) {
  const library = {
    id: 'library:web-common',
    displayName: 'web-common-lib',
    role: 'library',
    scripts: { watch: 'ng build --watch' },
    scriptNames: ['watch'],
    library: {
      libraryId: 'web-common',
      packageName: 'web-common-lib',
      artifactPath,
      artifactRelativePath: 'dist/web-common-lib',
      artifactAvailable: false,
      developmentScript: 'watch',
      preferredLinkScript: 'link:web-common',
    },
  };
  const shell = {
    id: 'shell',
    displayName: 'Shell',
    role: 'shell',
    scripts: { start: 'ng serve', 'link:web-common': 'node link.js' },
    scriptNames: ['start', 'link:web-common'],
    libraryLinkScriptOverrides: {},
  };
  const mfe = {
    id: 'root/mfe',
    displayName: 'MFE',
    role: 'mfe',
    scripts: { start: 'ng serve' },
    scriptNames: ['start'],
    libraryLinkScriptOverrides: {},
  };
  return {
    workspace: { id: 'workspace', name: 'Workspace' },
    projects: [shell, library, mfe],
  };
}

test('builds a plan only from authoritative library and consumer identifiers', () => {
  const catalog = catalogFixture('/tmp/artifact');
  const plan = buildLibraryLinkPlan(catalog, {
    workspaceId: 'workspace',
    libraryIds: ['web-common'],
    projectIds: ['shell'],
  });

  assert.equal(plan.pairs.length, 1);
  assert.equal(plan.pairs[0].script, 'link:web-common');
  assert.equal(plan.pairs[0].consumer.id, 'shell');
});

test('stops active consumers, prepares the artifact, links sequentially and restarts', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mfe-runner-linker-'));
  const artifactPath = path.join(base, 'dist', 'web-common-lib');
  const catalog = catalogFixture(artifactPath);
  const calls = [];
  let processes = [{
    workspaceId: 'workspace',
    projectId: 'shell',
    script: 'start',
    status: 'healthy',
  }];
  const supervisor = {
    snapshot: () => processes,
    stop: async (workspaceId, projectId) => {
      calls.push(`stop:${workspaceId}:${projectId}`);
      processes = processes.filter((item) => item.projectId !== projectId);
    },
    start: async ({ project, script }) => {
      calls.push(`start:${project.id}:${script}`);
      if (project.role === 'library') {
        await mkdir(artifactPath, { recursive: true });
        await writeFile(
          path.join(artifactPath, 'package.json'),
          JSON.stringify({ name: 'web-common-lib' }),
        );
      }
      processes.push({
        workspaceId: 'workspace',
        projectId: project.id,
        script,
        status: 'running',
      });
    },
    runTask: async ({ project, script }) => {
      calls.push(`task:${project.id}:${script}`);
    },
  };

  const results = await executeLibraryLinks({
    catalog,
    request: {
      workspaceId: 'workspace',
      libraryIds: ['web-common'],
    },
    supervisor,
    artifactTimeout: 1000,
  });

  assert.deepEqual(calls, [
    'stop:workspace:shell',
    'start:library:web-common:watch',
    'task:shell:link:web-common',
    'start:shell:start',
  ]);
  assert.deepEqual(results, [
    {
      libraryId: 'web-common',
      projectId: 'root/mfe',
      status: 'skipped',
      message: 'Nenhum script link:* compatível foi encontrado.',
    },
    {
      libraryId: 'web-common',
      projectId: 'shell',
      status: 'linked',
      message: 'npm run link:web-common concluído.',
    },
  ]);
});
