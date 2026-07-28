import assert from 'node:assert/strict';
import test from 'node:test';
import { restartActiveWorkspaceProjects } from './workspace-lifecycle.mjs';

test('restarts only projects that were active when the workspace restart began', async () => {
  const calls = [];
  let snapshotCalls = 0;
  const result = await restartActiveWorkspaceProjects({
    workspaceId: 'workspace-1',
    projects: [
      { id: 'running-project' },
      { id: 'stopped-project' },
      { id: 'starting-project' },
      { id: 'linking-project' },
    ],
    supervisor: {
      snapshot: () => {
        snapshotCalls += 1;
        return [
          {
            workspaceId: 'workspace-1',
            projectId: 'running-project',
            status: 'healthy',
          },
          {
            workspaceId: 'workspace-1',
            projectId: 'stopped-project',
            status: 'stopped',
          },
          {
            workspaceId: 'workspace-1',
            projectId: 'starting-project',
            status: 'starting',
          },
          {
            workspaceId: 'workspace-1',
            projectId: 'linking-project',
            status: 'linking',
          },
          {
            workspaceId: 'workspace-2',
            projectId: 'running-in-another-workspace',
            status: 'running',
          },
        ];
      },
      restart: async (workspaceId, projectId) => {
        calls.push(`restart:${workspaceId}:${projectId}`);
      },
    },
    wait: async (milliseconds) => calls.push(`wait:${milliseconds}`),
  });

  assert.equal(snapshotCalls, 1);
  assert.deepEqual(calls, [
    'restart:workspace-1:running-project',
    'wait:350',
    'restart:workspace-1:starting-project',
  ]);
  assert.deepEqual(result, { failures: [] });
});

test('continues restarting active projects and reports individual failures', async () => {
  const calls = [];
  const result = await restartActiveWorkspaceProjects({
    workspaceId: 'workspace-1',
    projects: [{ id: 'first' }, { id: 'second' }],
    supervisor: {
      snapshot: () => [
        { workspaceId: 'workspace-1', projectId: 'first', status: 'running' },
        { workspaceId: 'workspace-1', projectId: 'second', status: 'degraded' },
      ],
      restart: async (_workspaceId, projectId) => {
        calls.push(projectId);
        if (projectId === 'first') {
          throw new Error('Falha no primeiro projeto');
        }
      },
    },
    wait: async () => {
      throw new Error('Não deve aguardar após uma falha');
    },
  });

  assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(result, {
    failures: [{
      projectId: 'first',
      message: 'Falha no primeiro projeto',
    }],
  });
});
