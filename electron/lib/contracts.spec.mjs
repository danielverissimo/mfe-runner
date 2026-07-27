import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateClipboardWriteRequest,
  validateDiagnosticExportRequest,
  validateDirectoryPickerRequest,
  validateIdePreference,
  validateLibraryLinkRequest,
  validateLocalAddressRequest,
  validateNodePolicy,
  validateProcessRequest,
  validateProjectOrderUpdate,
  validateProjectRequest,
  validateProjectSourceInspectionRequest,
  validateWorkspaceInput,
} from './contracts.mjs';

test('directory picker accepts only an optional bounded initial path', () => {
  assert.deepEqual(
    validateDirectoryPickerRequest({
      initialPath: '/workspace/mfes',
      command: 'ignored',
    }),
    { initialPath: '/workspace/mfes' },
  );
  assert.deepEqual(validateDirectoryPickerRequest(undefined), {});
  assert.throws(
    () => validateDirectoryPickerRequest({ initialPath: 'x'.repeat(2049) }),
    /Path inicial inválido/,
  );
});

test('validates one or more unified project sources per workspace', () => {
  assert.deepEqual(validateWorkspaceInput({
    name: 'Valloo',
    projectSources: [{
      id: 'source-a',
      rootPath: '/workspace/projects-a',
      projects: [{
        relativePath: '.',
        kind: 'project',
        kindSource: 'detected',
      }],
    }, {
      rootPath: '/workspace/projects-b',
      projects: [],
    }],
    environment: 'local',
    nodePolicy: { mode: 'auto' },
    command: 'ignored',
  }), {
    name: 'Valloo',
    projectSources: [{
      id: 'source-a',
      rootPath: '/workspace/projects-a',
      projects: [{
        relativePath: '.',
        kind: 'project',
        kindSource: 'detected',
      }],
    }, {
      rootPath: '/workspace/projects-b',
      projects: [],
    }],
    environment: 'local',
    nodePolicy: { mode: 'auto' },
  });
  assert.throws(
    () => validateWorkspaceInput({
      name: 'Empty',
      projectSources: [],
    }),
    /ao menos um path de projeto/,
  );
  assert.throws(
    () => validateWorkspaceInput({
      name: 'Duplicate',
      projectSources: [
        { rootPath: '/projects', projects: [] },
        { rootPath: '/projects', projects: [] },
      ],
    }),
    /repita/,
  );
});

test('validates optional local linking and bounded identifier-only link requests', () => {
  const workspace = validateWorkspaceInput({
    name: 'Valloo',
    projectSources: [{
      rootPath: '/workspace/web-common',
      projects: [{
        relativePath: '.',
        kind: 'library',
        kindSource: 'user',
        localLibraryLink: {
          enabled: true,
          packageName: 'web-common-lib',
          developmentScript: 'watch',
          artifactRelativePath: 'dist/web-common-lib',
          preferredLinkScript: 'link:web-common',
          command: 'ignored',
        },
      }],
    }],
  });
  assert.deepEqual(workspace.projectSources[0].projects[0], {
    relativePath: '.',
    kind: 'library',
    kindSource: 'user',
    localLibraryLink: {
      enabled: true,
      packageName: 'web-common-lib',
      developmentScript: 'watch',
      artifactRelativePath: 'dist/web-common-lib',
      preferredLinkScript: 'link:web-common',
    },
  });
  assert.deepEqual(validateProjectSourceInspectionRequest({
    rootPath: '/workspace/web-common',
    requestId: 'scan-1',
    command: 'ignored',
  }), {
    rootPath: '/workspace/web-common',
    requestId: 'scan-1',
  });
  assert.deepEqual(validateLibraryLinkRequest({
    workspaceId: 'workspace',
    libraryIds: ['web-common', 'web-common'],
    projectIds: ['shell'],
    path: '/unsafe',
    script: 'postinstall',
  }), {
    workspaceId: 'workspace',
    libraryIds: ['web-common'],
    projectIds: ['shell'],
  });
  assert.throws(
    () => validateWorkspaceInput({
      name: 'Unsafe',
      projectSources: [{
        rootPath: '/workspace/lib',
        projects: [{
          relativePath: '.',
          kind: 'library',
          localLibraryLink: {
            enabled: true,
            packageName: 'library',
            developmentScript: 'watch',
            artifactRelativePath: '../outside',
            preferredLinkScript: 'postinstall',
          },
        }],
      }],
    }),
    /relativo e seguro|começar com link:/,
  );
});

test('requires a version for explicit Node policies', () => {
  assert.throws(() => validateNodePolicy({ mode: 'explicit' }), /Informe a versão/);
  assert.deepEqual(
    validateNodePolicy({ mode: 'explicit', version: '24.15.0' }),
    { mode: 'explicit', version: '24.15.0' },
  );
});

test('process and project requests accept only workspace and project identifiers', () => {
  assert.deepEqual(validateProcessRequest({
    workspaceId: 'workspace',
    projectId: 'root/project',
    script: 'start',
    command: 'unsafe',
  }), {
    workspaceId: 'workspace',
    projectId: 'root/project',
    script: 'start',
  });
  assert.deepEqual(validateProjectRequest({
    workspaceId: 'workspace',
    projectId: 'root/project',
    path: '/tmp/project',
  }), {
    workspaceId: 'workspace',
    projectId: 'root/project',
  });
});

test('validates a bounded unique visual project order', () => {
  assert.deepEqual(validateProjectOrderUpdate({
    workspaceId: 'workspace',
    projectIds: ['root/first', 'root/second'],
    paths: ['/unsafe'],
  }), {
    workspaceId: 'workspace',
    projectIds: ['root/first', 'root/second'],
  });
  assert.throws(
    () => validateProjectOrderUpdate({
      workspaceId: 'workspace',
      projectIds: ['root/first', 'root/first'],
    }),
    /projetos repetidos/,
  );
  assert.throws(
    () => validateProjectOrderUpdate({
      workspaceId: 'workspace',
      projectIds: 'root/first',
    }),
    /Ordenação dos projetos inválida/,
  );
});

test('local browser requests accept only a valid TCP port', () => {
  assert.deepEqual(validateLocalAddressRequest({ port: 4200 }), { port: 4200 });
  assert.throws(() => validateLocalAddressRequest({ port: 0 }), /Porta local inválida/);
});

test('clipboard writes accept only bounded non-empty text', () => {
  assert.deepEqual(
    validateClipboardWriteRequest({ text: 'log selecionado', html: '<b>x</b>' }),
    { text: 'log selecionado' },
  );
  assert.throws(
    () => validateClipboardWriteRequest({ text: '' }),
    /Texto para copiar inválido/,
  );
  assert.throws(
    () => validateClipboardWriteRequest({ text: 'x'.repeat(5_000_001) }),
    /Texto para copiar inválido/,
  );
});

test('validates IDE preferences without accepting command templates', () => {
  assert.deepEqual(validateIdePreference({
    id: 'vscode',
    name: 'Visual Studio Code',
    executablePath: '/Applications/Code/bin/code',
    command: 'ignored',
  }), {
    id: 'vscode',
    name: 'Visual Studio Code',
    executablePath: '/Applications/Code/bin/code',
  });
  assert.equal(validateIdePreference(null), null);
});

test('bounds diagnostic entry selections and defaults to sanitized paths', () => {
  assert.deepEqual(validateDiagnosticExportRequest({
    workspaceId: 'workspace',
    entryIds: ['one', 'one', 'two'],
  }), {
    workspaceId: 'workspace',
    entryIds: ['one', 'two'],
    includeAbsolutePaths: false,
  });
  assert.throws(
    () => validateDiagnosticExportRequest({
      workspaceId: 'workspace',
      entryIds: Array.from({ length: 100001 }, (_, index) => String(index)),
    }),
    /Seleção de logs inválida/,
  );
});
