import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateAndroidEmulatorRequest,
  validateClipboardWriteRequest,
  validateDiagnosticExportRequest,
  validateDirectoryPickerRequest,
  validateFlutterTarget,
  validateExternalServiceConfig,
  validateExternalServiceCreateRequest,
  validateExternalServiceRequest,
  validateHealthCheck,
  validateIdePreference,
  validateLibraryLinkRequest,
  validateLocalAddressRequest,
  validateNgrokDomainCreateRequest,
  validateNgrokPreference,
  validateNgrokResourceRequest,
  validateNgrokTunnelRequest,
  validateNodePolicy,
  validateProcessRequest,
  validateProjectOrderUpdate,
  validateProjectRequest,
  validateProjectSourceInspectionRequest,
  validateProjectUpdate,
  validateRuntimeComponentRequest,
  validateRuntimePathPickerRequest,
  validateWorkspaceInput,
} from './contracts.mjs';

test('validates bounded external-service configuration and identifier-only requests', () => {
  assert.deepEqual(validateExternalServiceCreateRequest({
    workspaceId: 'workspace',
    candidateId: 'docker:abc123:4310',
    name: 'API local',
    scheme: 'https',
    host: 'LOCALHOST',
    port: 4310,
    executablePath: '/attacker/docker',
    args: ['container', 'stop', 'abc123'],
  }), {
    workspaceId: 'workspace',
    candidateId: 'docker:abc123:4310',
    name: 'API local',
    scheme: 'https',
    host: 'localhost',
    port: 4310,
  });
  assert.deepEqual(validateExternalServiceConfig({
    id: 'external-service:abc',
    name: 'Container API',
    scheme: 'http',
    host: 'localhost',
    port: 8080,
    provider: 'docker',
    identity: { containerId: 'container-1', name: 'api', image: 'api:latest' },
    logSource: { type: 'docker' },
  }).identity.containerId, 'container-1');
  assert.deepEqual(validateExternalServiceRequest({
    workspaceId: 'workspace',
    serviceId: 'external-service:abc',
  }), {
    workspaceId: 'workspace',
    serviceId: 'external-service:abc',
  });
  assert.throws(() => validateExternalServiceCreateRequest({
    workspaceId: 'workspace',
    candidateId: 'docker:abc;rm -rf:4310',
    name: 'API',
    scheme: 'http',
    host: 'localhost',
    port: 4310,
  }), /Candidato externo inválido/);
  assert.throws(() => validateExternalServiceRequest({
    workspaceId: 'workspace',
    serviceId: 'root/project',
  }), /Serviço externo inválido/);
});

test('keeps ngrok IPC payloads identifier-only and bounded', () => {
  assert.deepEqual(validateNgrokPreference({
    executablePath: '/opt/homebrew/bin/ngrok',
    authtoken: 'must-not-pass',
  }), { executablePath: '/opt/homebrew/bin/ngrok' });
  assert.deepEqual(validateNgrokDomainCreateRequest({
    name: 'My-App',
    suffix: 'NGROK-FREE.DEV',
    description: 'MFE Runner',
    apiKey: 'must-not-pass',
  }), {
    name: 'my-app',
    suffix: 'ngrok-free.dev',
    description: 'MFE Runner',
  });
  assert.throws(
    () => validateNgrokDomainCreateRequest({
      name: 'app.example.com',
      suffix: 'ngrok.app',
    }),
    /somente letras, números ou hífen/,
  );
  assert.throws(
    () => validateNgrokDomainCreateRequest({
      name: 'app',
      suffix: 'attacker.example',
    }),
    /não suportada/,
  );
  assert.deepEqual(validateNgrokTunnelRequest({
    workspaceId: 'workspace',
    projectId: 'project',
    domainId: 'rd_123',
    domain: 'app.example.com',
    executablePath: '/attacker/ngrok',
    args: ['tcp', '22'],
    port: 22,
  }), {
    workspaceId: 'workspace',
    projectId: 'project',
    domainId: 'rd_123',
    domain: 'app.example.com',
  });
  assert.deepEqual(validateNgrokResourceRequest({ resource: 'apiKey' }), {
    resource: 'apiKey',
  });
  assert.throws(
    () => validateNgrokResourceRequest({ resource: 'https://attacker.invalid' }),
    /não suportado/,
  );
});

test('accepts only a bounded Android emulator id with project authority', () => {
  assert.deepEqual(validateAndroidEmulatorRequest({
    workspaceId: 'workspace',
    projectId: 'project',
    emulatorId: 'Pixel_9a',
    executable: '/attacker/emulator',
    args: ['-wipe-data'],
  }), {
    workspaceId: 'workspace',
    projectId: 'project',
    emulatorId: 'Pixel_9a',
  });
  assert.throws(
    () => validateAndroidEmulatorRequest({
      workspaceId: 'workspace',
      projectId: 'project',
      emulatorId: '',
    }),
    /Android Virtual Device inválido/,
  );
});

test('runtime selectors accept only allowlisted ecosystems and components', () => {
  assert.deepEqual(validateRuntimeComponentRequest({
    ecosystem: 'java-maven',
    component: 'runtime',
    url: 'https://attacker.invalid',
  }), {
    ecosystem: 'java-maven',
    component: 'runtime',
  });
  assert.deepEqual(validateRuntimePathPickerRequest({
    ecosystem: 'go',
    component: 'runtime',
    initialPath: '/usr/local/go/bin/go',
  }), {
    ecosystem: 'go',
    component: 'runtime',
    initialPath: '/usr/local/go/bin/go',
  });
  assert.throws(
    () => validateRuntimeComponentRequest({
      ecosystem: 'custom',
      component: 'runtime',
    }),
    /Ecossistema não suportado/,
  );
  assert.throws(
    () => validateRuntimeComponentRequest({
      ecosystem: 'python',
      component: 'command',
    }),
    /Componente não suportado/,
  );
});

test('validates persisted Flutter targets without accepting arbitrary platforms', () => {
  assert.deepEqual(validateFlutterTarget({
    platform: 'ios',
    deviceId: 'simulator',
    deviceName: 'iPhone',
  }), {
    platform: 'ios',
    deviceId: 'simulator',
    deviceName: 'iPhone',
  });
  assert.throws(
    () => validateFlutterTarget({ platform: 'desktop', deviceId: 'x' }),
    /Plataforma Flutter não suportada/,
  );
});

test('accepts only a structured Flutter target in process requests', () => {
  assert.deepEqual(validateProcessRequest({
    workspaceId: 'workspace',
    projectId: 'project',
    commandId: 'flutter:run:ios',
    flutterTarget: {
      platform: 'ios',
      deviceId: 'simulator-1',
      deviceName: 'iPhone',
      args: ['--dart-define=SECRET=value'],
    },
  }), {
    workspaceId: 'workspace',
    projectId: 'project',
    commandId: 'flutter:run:ios',
    flutterTarget: {
      platform: 'ios',
      deviceId: 'simulator-1',
      deviceName: 'iPhone',
    },
  });
  assert.throws(
    () => validateProcessRequest({
      workspaceId: 'workspace',
      projectId: 'project',
      flutterTarget: { platform: 'macos' },
    }),
    /Plataforma Flutter não suportada/,
  );
});

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

test('validates structured process, TCP and HTTP health checks', () => {
  assert.deepEqual(validateHealthCheck({ type: 'process' }), {
    type: 'process',
  });
  assert.deepEqual(validateHealthCheck({ type: 'tcp', port: 4310 }), {
    type: 'tcp',
    port: 4310,
  });
  assert.deepEqual(validateHealthCheck({
    type: 'http',
    port: '8080',
    path: '/actuator/health',
  }), {
    type: 'http',
    port: 8080,
    path: '/actuator/health',
  });
});

test('rejects unsafe or incomplete health checks', () => {
  assert.throws(
    () => validateHealthCheck({ type: 'http', path: '/health' }),
    /porta/i,
  );
  assert.throws(
    () => validateHealthCheck({ type: 'http', port: 8080, path: '//host' }),
    /path HTTP/i,
  );
  assert.throws(
    () => validateHealthCheck({ type: 'command', port: 8080 }),
    /não suportado/i,
  );
});

test('project updates preserve only validated health-check fields', () => {
  assert.deepEqual(validateProjectUpdate({
    workspaceId: 'workspace',
    projectId: 'project',
    healthCheck: {
      type: 'http',
      port: 8080,
      path: '/ready',
      command: 'curl example.test',
    },
  }), {
    workspaceId: 'workspace',
    projectId: 'project',
    healthCheck: {
      type: 'http',
      port: 8080,
      path: '/ready',
    },
  });
});
