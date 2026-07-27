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
  scripts: { start: 'ng serve' },
  scriptNames: ['start'],
  defaultScript: 'start',
  port: 4200,
  federation: null,
  packageEngines: {},
  registrations: [],
  node: { available: true, version: '24.15.0', source: 'nvmrc' },
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
  scripts: { start: 'ng serve --configuration=des', test: 'ng test' },
  scriptNames: ['start', 'test'],
  defaultScript: 'start',
  port: 4310,
  federation: { name: 'plataformaExample', exposes: ['./ExampleModule'] },
  packageEngines: { node: '>=24.15.0' },
  registrations: [],
  node: {
    available: true,
    version: '24.15.0',
    source: 'nvmrc',
    sourcePath: '/workspace/mfes/example/.nvmrc',
  },
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
    version: 4,
    settings: {
      globalNodePolicy: { mode: 'auto' },
      stopProcessesOnExit: true,
      logLimit: 1500,
      ide: null,
    },
    workspaces: [{
      id: 'workspace-1',
      name: 'Workspace',
      shellRootPath: '/workspace/plataforma',
      mfeRoots: [{ id: 'root-1', rootPath: '/workspace/mfes' }],
      libraries: [],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
      projectOverrides: {},
      excludedProjectIds: [],
    }],
  },
  workspaces: [{
    workspace: {
      id: 'workspace-1',
      name: 'Workspace',
      shellRootPath: '/workspace/plataforma',
      mfeRoots: [{ id: 'root-1', rootPath: '/workspace/mfes' }],
      libraries: [],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
      projectOverrides: {},
      excludedProjectIds: [],
    },
    projects: [shellFixture, projectFixture],
    manifests: [{ tenantId: 'tenant-a', tenantName: 'Tenant A', remoteCount: 1 }],
    warnings: [],
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
    'chooseShellDirectory',
    'chooseMfeDirectory',
    'chooseLibraryDirectory',
    'inspectLibraryDirectory',
    'addWorkspace',
    'updateWorkspace',
    'removeWorkspace',
    'refreshWorkspace',
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
    'onUpdateState',
  ]);
  bridge.getSnapshot.and.resolveTo(snapshot);
  bridge.listNodeVersions.and.resolveTo({
    detected: true,
    manager: 'nvm-sh',
    versions: ['24.15.0', '22.12.0'],
    message: '2 versões instaladas.',
  });
  bridge.chooseShellDirectory.and.resolveTo('/workspace/plataforma');
  bridge.chooseMfeDirectory.and.resolveTo('/workspace/mfes');
  bridge.chooseLibraryDirectory.and.resolveTo('/workspace/web-common');
  bridge.inspectLibraryDirectory.and.resolveTo({
    rootPath: '/workspace/web-common',
    angularProject: 'web-common-lib',
    packageName: 'web-common-lib',
    scripts: ['build', 'watch'],
    developmentScript: 'watch',
    artifactRelativePath: 'dist/web-common-lib',
    preferredLinkScript: 'link:web-common',
  });
  bridge.addWorkspace.and.resolveTo(snapshot);
  bridge.updateWorkspace.and.resolveTo(snapshot);
  bridge.removeWorkspace.and.resolveTo(snapshot);
  bridge.refreshWorkspace.and.resolveTo(snapshot);
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
  bridge.onUpdateState.and.returnValue(() => undefined);
  return bridge;
}
