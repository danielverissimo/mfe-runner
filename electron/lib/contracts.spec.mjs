import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateClipboardWriteRequest,
  validateDiagnosticExportRequest,
  validateDirectoryPickerRequest,
  validateIdePreference,
  validateLibraryInspectionRequest,
  validateLibraryLinkRequest,
  validateLocalAddressRequest,
  validateNodePolicy,
  validateProcessRequest,
  validateProjectRequest,
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

test('validates one shell and one or more MFE paths per workspace', () => {
  assert.deepEqual(validateWorkspaceInput({
    name: 'Valloo',
    shellRootPath: '/workspace/shell',
    mfeRootPaths: ['/workspace/mfes-a', '/workspace/mfes-b'],
    libraries: [],
    environment: 'local',
    nodePolicy: { mode: 'auto' },
    command: 'ignored',
  }), {
    name: 'Valloo',
    shellRootPath: '/workspace/shell',
    mfeRootPaths: ['/workspace/mfes-a', '/workspace/mfes-b'],
    libraries: [],
    environment: 'local',
    nodePolicy: { mode: 'auto' },
  });
  assert.throws(
    () => validateWorkspaceInput({
      name: 'Empty',
      shellRootPath: '/shell',
      mfeRootPaths: [],
    }),
    /ao menos um path/,
  );
  assert.throws(
    () => validateWorkspaceInput({
      name: 'Duplicate',
      shellRootPath: '/shell',
      mfeRootPaths: ['/mfes', '/mfes'],
    }),
    /repita/,
  );
});

test('validates library configuration and bounded identifier-only link requests', () => {
  const workspace = validateWorkspaceInput({
    name: 'Valloo',
    shellRootPath: '/workspace/shell',
    mfeRootPaths: ['/workspace/mfes'],
    libraries: [{
      rootPath: '/workspace/web-common',
      developmentScript: 'watch',
      artifactRelativePath: 'dist/web-common-lib',
      preferredLinkScript: 'link:web-common',
      command: 'ignored',
    }],
  });
  assert.deepEqual(workspace.libraries, [{
    rootPath: '/workspace/web-common',
    developmentScript: 'watch',
    artifactRelativePath: 'dist/web-common-lib',
    preferredLinkScript: 'link:web-common',
  }]);
  assert.deepEqual(validateLibraryInspectionRequest({
    rootPath: '/workspace/web-common',
    command: 'ignored',
  }), { rootPath: '/workspace/web-common' });
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
      shellRootPath: '/workspace/shell',
      mfeRootPaths: ['/workspace/mfes'],
      libraries: [{
        rootPath: '/workspace/lib',
        developmentScript: 'watch',
        artifactRelativePath: '../outside',
        preferredLinkScript: 'postinstall',
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
