import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildDiagnosticArchive,
  createPathSanitizer,
} from './diagnostic-export.mjs';

const workspace = {
  id: 'workspace-1',
  name: 'Workspace',
  environment: 'local',
  projectSources: [{
    id: 'root',
    rootPath: '/Users/developer/work/mfes',
    rootProjectId: 'root',
    projects: [],
  }],
};
const project = {
  id: 'root/project',
  displayName: 'project',
  role: 'mfe',
  relativePath: 'project',
  absolutePath: '/Users/developer/work/mfes/project',
  port: 4310,
  warnings: ['Arquivo em /Users/developer/work/mfes/project/config.json'],
  node: { available: true, version: '24.15.0', source: 'nvmrc' },
  git: {
    available: true,
    repository: true,
    branch: 'feature/logs',
    detached: false,
    commit: 'abcdef123456',
    dirty: false,
    changedFiles: 0,
    upstream: null,
    ahead: null,
    behind: null,
    compatibleWithShell: false,
    message: 'Branch diferente',
  },
};

test('sanitizes configured and remaining absolute paths', () => {
  const sanitize = createPathSanitizer(workspace, [project]);
  assert.equal(
    sanitize('/Users/developer/work/mfes/project/src/main.ts'),
    '<PROJECT:project>/src/main.ts',
  );
  assert.equal(sanitize('at /private/tmp/build.js'), 'at <ABSOLUTE_PATH>');
});

test('builds a structured redacted ZIP from authoritative entries', () => {
  const archive = buildDiagnosticArchive({
    workspace,
    catalog: {
      workspace,
      projects: [project],
      manifests: [],
      warnings: [],
      discoveredAt: '2026-07-24T12:00:00.000Z',
      gitUpdatedAt: '2026-07-24T12:00:00.000Z',
    },
    processes: [{
      workspaceId: workspace.id,
      projectId: project.id,
      projectName: project.displayName,
      script: 'start',
      status: 'failed',
      startedAt: null,
      stoppedAt: null,
      exitCode: 1,
      message: 'password=super-secret',
      logs: [{
        id: 'log-1',
        workspaceId: workspace.id,
        projectId: project.id,
        projectName: project.displayName,
        stream: 'stderr',
        level: 'error',
        message:
          'token=private-value at /Users/developer/work/mfes/project/main.ts',
        timestamp: '2026-07-24T12:00:00.000Z',
      }],
    }],
    systemInfo: {
      runtime: { node: '24.15.0' },
      operatingSystem: { type: 'Darwin' },
      hardware: { logicalCores: 10 },
    },
    appVersion: '0.1.0',
    includeAbsolutePaths: false,
  });
  const files = unzipSync(archive);
  assert.ok(files['summary.json']);
  assert.ok(files['diagnostics.json']);
  assert.ok(files['logs/project.log']);
  assert.doesNotThrow(() => JSON.parse(strFromU8(files['summary.json'])));
  assert.doesNotThrow(() => JSON.parse(strFromU8(files['diagnostics.json'])));
  const combined = Object.values(files).map(strFromU8).join('\n');
  assert.doesNotMatch(combined, /\/Users\/developer/);
  assert.doesNotMatch(combined, /super-secret|private-value/);
  assert.match(combined, /\[REDACTED\]/);
});
