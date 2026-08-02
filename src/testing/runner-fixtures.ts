import {
  DiscoveredProject,
  RunnerBridge,
  RunnerSnapshot,
} from '../app/core/models/runner.models';

export const shellFixture: DiscoveredProject = {
  id: 'shell',
  name: 'plataforma',
  displayName: 'plataforma',
  relativePath: '.',
  absolutePath: '/workspace/plataforma',
  role: 'shell',
  ecosystem: 'node',
  technology: 'Node.js',
  supportLevel: 'stable',
  kind: 'project',
  kindSource: 'detected',
  capabilities: ['angular', 'host'],
  sourceId: 'source-shell',
  startupOrder: 900,
  scripts: { start: 'ng serve' },
  scriptNames: ['start'],
  defaultScript: 'start',
  commands: [{
    id: 'node:script:start',
    label: 'npm run start',
    category: 'run',
    longRunning: true,
    task: 'start',
    args: [],
  }],
  commandIds: ['node:script:start'],
  defaultCommandId: 'node:script:start',
  port: 4200,
  federation: null,
  packageEngines: {},
  registrations: [],
  healthCheck: { type: 'tcp', port: 4200 },
  node: { available: true, version: '24.15.0', source: 'nvmrc' },
  runtime: {
    ecosystem: 'node',
    supportLevel: 'stable',
    available: true,
    compatibility: 'ready',
    reason: null,
    requirements: {},
    components: {
      runtime: {
        available: true,
        path: '/runtime/node',
        version: '24.15.0',
        source: 'nvmrc',
      },
    },
  },
  runtimeRequirements: {},
  git: {
    available: true,
    repository: true,
    branch: 'feature/example',
    detached: false,
    commit: 'abc123def456',
    dirty: false,
    changedFiles: 0,
    upstream: 'origin/feature/example',
    ahead: 0,
    behind: 0,
    compatibleWithShell: true,
    message: '',
  },
  libraryLinks: [],
  warnings: [],
};

export const projectFixture: DiscoveredProject = {
  id: 'root-1/example',
  name: 'plataforma-example',
  displayName: 'plataforma-example',
  relativePath: 'example',
  absolutePath: '/workspace/mfes/example',
  role: 'mfe',
  ecosystem: 'node',
  technology: 'Node.js',
  supportLevel: 'stable',
  kind: 'project',
  kindSource: 'detected',
  capabilities: ['angular', 'mfe'],
  sourceId: 'root-1',
  startupOrder: 500,
  scripts: { start: 'ng serve --configuration=des', test: 'ng test' },
  scriptNames: ['start', 'test'],
  defaultScript: 'start',
  commands: [{
    id: 'node:script:start',
    label: 'npm run start',
    category: 'run',
    longRunning: true,
    task: 'start',
    args: [],
  }, {
    id: 'node:script:test',
    label: 'npm run test',
    category: 'test',
    longRunning: false,
    task: 'test',
    args: [],
  }],
  commandIds: ['node:script:start', 'node:script:test'],
  defaultCommandId: 'node:script:start',
  port: 4310,
  federation: { name: 'plataformaExample', exposes: ['./ExampleModule'] },
  packageEngines: { node: '>=24.15.0' },
  registrations: [],
  healthCheck: { type: 'tcp', port: 4310 },
  node: {
    available: true,
    version: '24.15.0',
    source: 'nvmrc',
    sourcePath: '/workspace/mfes/example/.nvmrc',
  },
  runtime: {
    ecosystem: 'node',
    supportLevel: 'stable',
    available: true,
    compatibility: 'ready',
    reason: null,
    requirements: { node: '>=24.15.0' },
    components: {
      runtime: {
        available: true,
        path: '/runtime/node',
        version: '24.15.0',
        source: 'nvmrc',
      },
    },
  },
  runtimeRequirements: { node: '>=24.15.0' },
  git: {
    available: true,
    repository: true,
    branch: 'feature/example',
    detached: false,
    commit: 'def456abc123',
    dirty: true,
    changedFiles: 2,
    upstream: 'origin/feature/example',
    ahead: 1,
    behind: 0,
    compatibleWithShell: true,
    message: '',
  },
  libraryLinks: [],
  warnings: [],
};

export const snapshotFixture: RunnerSnapshot = {
  config: {
    version: 6,
    settings: {
      globalNodePolicy: { mode: 'auto' },
      executionPolicies: {
        node: { runtime: { mode: 'auto' } },
      },
      theme: 'system',
      stopProcessesOnExit: true,
      logLimit: 1500,
      ide: null,
      ngrok: { executablePath: null },
    },
    workspaces: [{
      id: 'workspace-1',
      name: 'Workspace',
      projectSources: [
        {
          id: 'source-shell',
          rootPath: '/workspace/plataforma',
          rootProjectId: 'shell',
          projects: [{ relativePath: '.', kind: 'project', kindSource: 'detected' }],
        },
        {
          id: 'root-1',
          rootPath: '/workspace/mfes',
          rootProjectId: 'root-1/.',
          projects: [{ relativePath: 'example', kind: 'project', kindSource: 'detected' }],
        },
      ],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
      executionPolicies: {
        node: { runtime: { mode: 'inherit' } },
      },
      projectOverrides: {},
      excludedProjectIds: [],
    }],
  },
  workspaces: [{
    workspace: {
      id: 'workspace-1',
      name: 'Workspace',
      projectSources: [
        {
          id: 'source-shell',
          rootPath: '/workspace/plataforma',
          rootProjectId: 'shell',
          projects: [{ relativePath: '.', kind: 'project', kindSource: 'detected' }],
        },
        {
          id: 'root-1',
          rootPath: '/workspace/mfes',
          rootProjectId: 'root-1/.',
          projects: [{ relativePath: 'example', kind: 'project', kindSource: 'detected' }],
        },
      ],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
      executionPolicies: {
        node: { runtime: { mode: 'inherit' } },
      },
      projectOverrides: {},
      excludedProjectIds: [],
    },
    projects: [shellFixture, projectFixture],
    manifests: [{ tenantId: 'tenant-a', tenantName: 'Tenant A', remoteCount: 1 }],
    warnings: [],
    betaEcosystems: [],
    discoveredAt: '2026-07-24T12:00:00.000Z',
    gitUpdatedAt: '2026-07-24T12:00:00.000Z',
  }],
  processes: [],
  platform: 'darwin',
  systemInfo: {
    platform: 'darwin',
    platformName: 'macOS',
    operatingSystem: {
      type: 'Darwin',
      release: '25.0.0',
      version: 'macOS 26.0',
      architecture: 'arm64',
    },
    hardware: {
      cpuModel: 'Apple M4',
      logicalCores: 10,
      totalMemoryBytes: 17179869184,
    },
    runtime: {
      app: '0.1.0',
      node: '24.15.0',
      electron: '43.2.0',
      chrome: '150.0.0.0',
      v8: '14.0',
    },
  },
  supervisorConnected: true,
};

export function createBridgeFixture(
  snapshot = snapshotFixture,
): jasmine.SpyObj<RunnerBridge> {
  const bridge = jasmine.createSpyObj<RunnerBridge>('RunnerBridge', [
    'getSnapshot',
    'listNodeVersions',
    'listRuntimeInstallations',
    'listFlutterDevices',
    'listAndroidEmulators',
    'launchAndroidEmulator',
    'getNgrokStatus',
    'listNgrokDomains',
    'createNgrokDomain',
    'startNgrokTunnel',
    'stopNgrokTunnel',
    'openNgrokTunnel',
    'openNgrokResource',
    'openNgrokConfig',
    'discoverExternalServices',
    'chooseExternalLogFile',
    'addExternalService',
    'removeExternalService',
    'terminateExternalService',
    'rebindExternalService',
    'openExternalServiceAddress',
    'chooseNgrokExecutable',
    'chooseRuntimePath',
    'openRuntimeDownload',
    'chooseProjectDirectory',
    'inspectProjectSource',
    'reviewWorkspace',
    'addWorkspace',
    'updateWorkspace',
    'removeWorkspace',
    'startWorkspace',
    'stopWorkspace',
    'restartWorkspace',
    'openLocalAddress',
    'copyText',
    'listDeveloperTools',
    'chooseIdeExecutable',
    'openProjectInIde',
    'openProjectFolder',
    'openProjectTerminal',
    'refreshWorkspaceGit',
    'exportDiagnostics',
    'linkLibraries',
    'updateSettings',
    'updateProject',
    'updateProjectOrder',
    'excludeProject',
    'startProject',
    'stopProject',
    'restartProject',
    'terminateExternalProcess',
    'clearLogs',
    'getUpdateState',
    'checkForUpdates',
    'downloadUpdate',
    'installUpdate',
    'onSnapshot',
    'onLog',
    'onProjectSourceInspectionProgress',
    'onUpdateState',
  ]);
  bridge.getSnapshot.and.resolveTo(snapshot);
  bridge.listNodeVersions.and.resolveTo({
    detected: true,
    manager: 'nvm-sh',
    versions: ['24.15.0', '22.12.0'],
    message: '2 versões instaladas.',
  });
  bridge.listRuntimeInstallations.and.callFake(async ({ ecosystem, component }) => ({
    ecosystem,
    component,
    installations: [{
      id: `${ecosystem}:${component}:fixture`,
      label: 'Runtime de teste',
      version: '21.0.1',
      rawVersion: '21.0.1',
      path: '/opt/runtime/bin/tool',
      source: 'installed',
    }],
  }));
  bridge.listFlutterDevices.and.resolveTo({
    devices: [],
    message: 'Nenhum device Flutter detectado.',
  });
  bridge.listAndroidEmulators.and.resolveTo({
    emulators: [],
    message: 'Nenhum Android Virtual Device configurado foi encontrado.',
  });
  bridge.launchAndroidEmulator.and.callFake(async ({ emulatorId }) => ({
    started: true,
    emulatorId,
  }));
  bridge.getNgrokStatus.and.resolveTo({
    installed: true,
    available: true,
    executablePath: '/opt/homebrew/bin/ngrok',
    source: 'homebrew',
    version: '3.22.1',
    configValid: true,
    configPath: '/Users/dev/Library/Application Support/ngrok/ngrok.yml',
    message: 'ngrok e arquivo de configuração disponíveis.',
  });
  bridge.listNgrokDomains.and.resolveTo({
    domains: [{
      id: 'rd_123',
      domain: 'app.example.com',
      description: 'App',
      createdAt: '2026-08-01T00:00:00.000Z',
      cnameTarget: null,
      certificateStatus: 'ready',
      dnsStatus: 'ready',
      wildcard: false,
      compatible: true,
    }],
    message: '1 domínio encontrado.',
  });
  bridge.createNgrokDomain.and.resolveTo({ canceled: true, domain: null });
  bridge.startNgrokTunnel.and.resolveTo(snapshot);
  bridge.stopNgrokTunnel.and.resolveTo(snapshot);
  bridge.openNgrokTunnel.and.resolveTo();
  bridge.openNgrokResource.and.resolveTo();
  bridge.openNgrokConfig.and.resolveTo();
  bridge.discoverExternalServices.and.resolveTo({
    candidates: [],
    docker: { available: false, message: 'Docker indisponível.' },
    processMessage: null,
  });
  bridge.chooseExternalLogFile.and.resolveTo({
    canceled: true,
    filePath: null,
  });
  bridge.addExternalService.and.resolveTo(snapshot);
  bridge.removeExternalService.and.resolveTo(snapshot);
  bridge.terminateExternalService.and.resolveTo(snapshot);
  bridge.rebindExternalService.and.resolveTo(snapshot);
  bridge.openExternalServiceAddress.and.resolveTo();
  bridge.chooseNgrokExecutable.and.resolveTo('/opt/homebrew/bin/ngrok');
  bridge.chooseRuntimePath.and.resolveTo('/opt/runtime/bin/tool');
  bridge.openRuntimeDownload.and.resolveTo();
  bridge.chooseProjectDirectory.and.resolveTo('/workspace/mfes');
  bridge.inspectProjectSource.and.resolveTo({
    rootPath: '/workspace/mfes',
    sourceType: 'root',
    warnings: [],
    projects: [{
      name: 'plataforma-example',
      relativePath: 'example',
      technology: 'Node.js',
      ecosystem: 'node',
      supportLevel: 'stable',
      commands: [{
        id: 'node:script:start',
        label: 'npm run start',
        category: 'run',
        longRunning: true,
        task: 'start',
        args: [],
      }],
      defaultCommandId: 'node:script:start',
      runtimeRequirements: {},
      suggestedKind: 'project',
      evidence: ['package.json', 'Script executável'],
      capabilities: ['angular', 'mfe'],
      scripts: ['start', 'test'],
      localLinkSuggestion: null,
    }],
  });
  bridge.reviewWorkspace.and.resolveTo({
    workspaceId: 'workspace-1',
    sources: [],
    missingProjects: [],
  });
  bridge.addWorkspace.and.resolveTo(snapshot);
  bridge.updateWorkspace.and.resolveTo(snapshot);
  bridge.removeWorkspace.and.resolveTo(snapshot);
  bridge.startWorkspace.and.resolveTo({ snapshot, failures: [] });
  bridge.stopWorkspace.and.resolveTo(snapshot);
  bridge.restartWorkspace.and.resolveTo({ snapshot, failures: [] });
  bridge.openLocalAddress.and.resolveTo();
  bridge.copyText.and.resolveTo();
  bridge.listDeveloperTools.and.resolveTo({
    ideApplications: [{
      id: 'vscode',
      name: 'Visual Studio Code',
      executablePath: '/usr/local/bin/code',
      custom: false,
    }],
    selectedIdeId: 'vscode',
    terminal: { id: 'terminal', name: 'Terminal', available: true },
  });
  bridge.chooseIdeExecutable.and.resolveTo('/Applications/IDE/bin/ide');
  bridge.openProjectInIde.and.resolveTo();
  bridge.openProjectFolder.and.resolveTo();
  bridge.openProjectTerminal.and.resolveTo();
  bridge.refreshWorkspaceGit.and.resolveTo(snapshot);
  bridge.exportDiagnostics.and.resolveTo({
    canceled: false,
    filePath: '/tmp/diagnostico.zip',
  });
  bridge.linkLibraries.and.resolveTo({ snapshot, results: [] });
  bridge.updateSettings.and.resolveTo(snapshot);
  bridge.updateProject.and.resolveTo(snapshot);
  bridge.updateProjectOrder.and.resolveTo(snapshot);
  bridge.excludeProject.and.resolveTo(snapshot);
  bridge.startProject.and.resolveTo(snapshot);
  bridge.stopProject.and.resolveTo(snapshot);
  bridge.restartProject.and.resolveTo(snapshot);
  bridge.terminateExternalProcess.and.resolveTo(snapshot);
  bridge.clearLogs.and.resolveTo(snapshot);
  const updateState = {
    supported: true,
    userInitiated: false,
    status: 'idle' as const,
    currentVersion: '0.1.0',
    availableVersion: null,
    progress: null,
    checkedAt: null,
    message: 'Pronto para buscar atualizações.',
  };
  bridge.getUpdateState.and.resolveTo(updateState);
  bridge.checkForUpdates.and.resolveTo({
    ...updateState,
    userInitiated: true,
    status: 'not-available',
    checkedAt: '2026-07-26T12:00:00.000Z',
    message: 'Você já está usando a versão mais recente.',
  });
  bridge.downloadUpdate.and.resolveTo({
    ...updateState,
    status: 'downloading',
    availableVersion: '0.2.0',
    progress: 0,
    message: 'Iniciando o download da atualização…',
  });
  bridge.installUpdate.and.resolveTo({
    ...updateState,
    status: 'downloaded',
    availableVersion: '0.2.0',
    progress: 100,
    message: 'Atualização pronta para instalar.',
  });
  bridge.onSnapshot.and.returnValue(() => undefined);
  bridge.onLog.and.returnValue(() => undefined);
  bridge.onProjectSourceInspectionProgress.and.returnValue(() => undefined);
  bridge.onUpdateState.and.returnValue(() => undefined);
  return bridge;
}
