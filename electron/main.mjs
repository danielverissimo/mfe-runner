import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  nativeTheme,
  protocol,
  shell as electronShell,
} from 'electron';
import updaterPackage from 'electron-updater';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigStore } from './lib/config-store.mjs';
import {
  IPC_CHANNELS,
  validateAndroidEmulatorRequest,
  validateNgrokDomainCreateRequest,
  validateNgrokResourceRequest,
  validateNgrokTunnelRequest,
  assertNonEmptyString,
  assertPlainObject,
  validateDirectoryPickerRequest,
  validateExternalServiceCreateRequest,
  validateExternalServiceRequest,
  validateClipboardWriteRequest,
  validateDiagnosticExportRequest,
  validateLocalAddressRequest,
  validateProjectSourceInspectionRequest,
  validateLibraryLinkRequest,
  validateProcessRequest,
  validateProjectRequest,
  validateProjectOrderUpdate,
  validateProjectUpdate,
  validateRuntimeComponentRequest,
  validateRuntimePathPickerRequest,
  validateWorkspaceInput,
  validateWorkspaceRequest,
} from './lib/contracts.mjs';
import { discoverWorkspace } from './lib/discovery.mjs';
import { SupervisorClient } from './lib/supervisor-client.mjs';
import {
  prepareSupervisorForExit,
  prepareSupervisorForUpdate,
} from './lib/supervisor-exit-policy.mjs';
import { restartActiveWorkspaceProjects } from './lib/workspace-lifecycle.mjs';
import { listInstalledNodeVersions } from './lib/node-resolver.mjs';
import { listFlutterDevices, listRuntimeInstallations } from './lib/runtime-resolver.mjs';
import {
  launchAndroidEmulator,
  listAndroidEmulators,
} from './lib/android-emulator.mjs';
import {
  composeNgrokManagedDomain,
  createNgrokDomain,
  createNgrokLaunchSpecification,
  getNgrokStatus,
  listNgrokDomains,
} from './lib/ngrok.mjs';
import { collectSystemInfo } from './lib/system-info.mjs';
import {
  inspectExternalProcess,
  terminateExternalProcess as terminateExternalPortProcess,
} from './lib/external-process.mjs';
import {
  buildExternalServiceDefinition,
  discoverExternalServiceCandidates,
  resolveDockerLogLaunch,
  stopDockerContainer,
} from './lib/external-services.mjs';
import { APP_ICON_PATH, applyApplicationIcon } from './lib/app-icon.mjs';
import {
  APP_NAME,
  applyApplicationIdentity,
} from './lib/app-identity.mjs';
import {
  listDeveloperTools,
  isDeveloperExecutable,
  openPathInIde,
  openProjectInIde,
  openProjectTerminal,
} from './lib/developer-tools.mjs';
import { enrichProjectsWithGit } from './lib/git-context.mjs';
import {
  buildDiagnosticArchive,
  defaultDiagnosticFilename,
  writeDiagnosticArchive,
} from './lib/diagnostic-export.mjs';
import {
  inspectProjectSource,
  publicSourceInspection,
} from './lib/project-detectors.mjs';
import {
  buildLibraryLinkPlan,
  executeLibraryLinks,
} from './lib/library-linker.mjs';
import { UpdateManager } from './lib/update-manager.mjs';
import { scheduleMacUpdateRelaunch } from './lib/update-relauncher.mjs';

applyApplicationIdentity(app);
const { autoUpdater } = updaterPackage;

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
  },
}]);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererDirectory = path.resolve(currentDirectory, '..', 'dist', 'browser');
const updateRelaunchHelperPath = path.join(
  currentDirectory,
  'lib',
  'update-relaunch-helper.mjs',
);
const userDataPath = app.getPath('userData');
const configStore = new ConfigStore(
  path.join(userDataPath, 'runner-config.json'),
);
const supervisor = new SupervisorClient({
  userDataPath,
  entryPath: path.join(currentDirectory, 'lib', 'supervisor-entry.mjs'),
});

function applyNativeTheme(theme) {
  nativeTheme.themeSource = ['light', 'dark'].includes(theme)
    ? theme
    : 'system';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(
      nativeTheme.shouldUseDarkColors ? '#080b12' : '#f3f5fa',
    );
  }
}
const updateManager = new UpdateManager({
  updater: autoUpdater,
  appVersion: app.getVersion(),
  packaged: app.isPackaged,
});
const catalogs = new Map();
const approvedExternalLogFiles = new Set();
let mainWindow = null;
let quitAttemptInProgress = false;
let quitAllowed = false;

const RUNTIME_DOWNLOAD_URLS = Object.freeze({
  'node:runtime': 'https://nodejs.org/en/download',
  'node:packageManager': 'https://nodejs.org/en/download',
  'java-maven:runtime': 'https://www.oracle.com/java/technologies/downloads/',
  'java-maven:tool': 'https://maven.apache.org/download.cgi',
  'java-gradle:runtime': 'https://www.oracle.com/java/technologies/downloads/',
  'java-gradle:tool': 'https://gradle.org/install/',
  'dotnet:runtime': 'https://dotnet.microsoft.com/en-us/download',
  'python:runtime': 'https://www.python.org/downloads/',
  'python:tool': 'https://packaging.python.org/en/latest/tutorials/installing-packages/',
  'rust:runtime': 'https://www.rust-lang.org/tools/install',
  'rust:tool': 'https://www.rust-lang.org/tools/install',
  'go:runtime': 'https://go.dev/dl/',
  'flutter:runtime': 'https://docs.flutter.dev/get-started/install',
});

const NGROK_RESOURCE_URLS = Object.freeze({
  install: 'https://ngrok.com/download',
  authtoken: 'https://dashboard.ngrok.com/get-started/your-authtoken',
  apiKey: 'https://dashboard.ngrok.com/api-keys',
  domains: 'https://dashboard.ngrok.com/domains',
});

function ngrokOptions() {
  return {
    configuredPath:
      configStore.snapshot.settings.ngrok?.executablePath ?? undefined,
  };
}

function runtimePathUsesDirectory(ecosystem, component) {
  return (ecosystem.startsWith('java-') || ecosystem === 'flutter') && component === 'runtime';
}

function validateSender(frame) {
  if (!frame?.url) return false;
  try {
    const url = new URL(frame.url);
    return (url.protocol === 'app:' && url.host === 'bundle') ||
      (!app.isPackaged &&
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
        url.port === '4200');
  } catch {
    return false;
  }
}

function withValidatedSender(handler) {
  return async (event, payload) => {
    if (!validateSender(event.senderFrame)) {
      throw new Error('Origem IPC não autorizada.');
    }
    return handler(payload, event);
  };
}

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: error?.code,
  };
}

function broadcastUpdateState(state = updateManager.snapshot) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.updateStateChanged, state);
  }
}

async function checkForUpdatesFromMenu() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  await updateManager.check({ userInitiated: true });
}

function registerApplicationMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: APP_NAME,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', visible: !app.isPackaged },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [{
        label: 'Buscar atualizações…',
        click: () => void checkForUpdatesFromMenu(),
      }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildSnapshot() {
  const config = configStore.snapshot;
  const processes = supervisor.snapshot();
  return {
    config,
    workspaces: config.workspaces.map((workspace) => {
      const catalog = catalogs.get(workspace.id) ?? {
        workspace,
        projects: [],
        manifests: [],
        warnings: ['Workspace ainda não foi descoberta.'],
        discoveredAt: null,
        gitUpdatedAt: null,
      };
      const knownProjectIds = new Set(
        catalog.projects.map((project) => project.id),
      );
      const orphanProjects = processes
        .filter((record) =>
          record.workspaceId === workspace.id &&
          record.source !== 'external' &&
          !knownProjectIds.has(record.projectId) &&
          ['starting', 'linking', 'healthy', 'running', 'degraded', 'stopping']
            .includes(record.status)
        )
        .map((record) => ({
          id: record.projectId,
          name: record.projectName,
          displayName: record.projectName,
          relativePath: 'Projeto não encontrado na descoberta atual',
          absolutePath: '',
          role: 'application',
          kind: 'project',
          kindSource: 'detected',
          capabilities: [],
          sourceId: '',
          startupOrder: 500,
          scripts: {},
          scriptNames: [],
          defaultScript: null,
          commands: [],
          defaultCommandId: null,
          ecosystem: 'node',
          technology: 'Node.js',
          supportLevel: 'stable',
          runtime: {
            available: false,
            status: 'unavailable',
            ecosystem: 'node',
            components: {},
            reason: 'O catálogo atual não contém este projeto.',
          },
          port: record.port,
          federation: null,
          packageEngines: {},
          registrations: [],
          node: {
            available: false,
            version: null,
            source: 'path',
            reason: 'O catálogo atual não contém este projeto.',
          },
          git: {
            available: false,
            repository: false,
            branch: null,
            detached: false,
            commit: null,
            dirty: false,
            changedFiles: 0,
            upstream: null,
            ahead: null,
            behind: null,
            compatibleWithShell: null,
            message: 'Contexto Git indisponível para processo órfão.',
          },
          libraryLinks: [],
          warnings: [
            'Processo gerenciado sem projeto correspondente no catálogo atual.',
          ],
          orphaned: true,
        }));
      return {
        ...catalog,
        projects: [...catalog.projects, ...orphanProjects],
      };
    }),
    processes,
    platform: process.platform,
    systemInfo: collectSystemInfo({ appVersion: app.getVersion() }),
    supervisorConnected: supervisor.connected,
  };
}

function broadcastSnapshot() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.snapshotChanged, buildSnapshot());
  }
}

async function refreshWorkspace(workspaceId) {
  const config = configStore.snapshot;
  const workspace = config.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error('Workspace não encontrada.');
  try {
    catalogs.set(
      workspace.id,
      await discoverWorkspace(workspace, config.settings.executionPolicies),
    );
  } catch (error) {
    catalogs.set(workspace.id, {
      workspace,
      projects: [],
      manifests: [],
      warnings: [error.message],
      discoveredAt: new Date().toISOString(),
      gitUpdatedAt: null,
    });
  }
  broadcastSnapshot();
  return catalogs.get(workspace.id);
}

async function refreshAllWorkspaces() {
  const { workspaces } = configStore.snapshot;
  await Promise.all(workspaces.map((workspace) => refreshWorkspace(workspace.id)));
}

function externalDiscoveryExcludedPorts(workspaceId) {
  const catalog = catalogs.get(workspaceId);
  const projectPorts = catalog?.projects.map((project) => project.port)
    .filter(Number.isInteger) ?? [];
  const processPorts = supervisor.snapshot()
    .filter((record) => record.workspaceId === workspaceId)
    .map((record) => record.port)
    .filter(Number.isInteger);
  const workspace = configStore.snapshot.workspaces.find(
    (item) => item.id === workspaceId,
  );
  const externalPorts = workspace?.externalServices?.map((service) => service.port) ?? [];
  return [...new Set([...projectPorts, ...processPorts, ...externalPorts])];
}

async function discoverExternalCandidatesForWorkspace(workspaceId) {
  const workspace = configStore.snapshot.workspaces.find(
    (item) => item.id === workspaceId,
  );
  if (!workspace) throw new Error('Workspace não encontrada.');
  return discoverExternalServiceCandidates({
    excludedPorts: externalDiscoveryExcludedPorts(workspaceId),
  });
}

async function attachExternalService(workspace, service) {
  let logLaunch = null;
  if (service.logSource?.type === 'docker') {
    logLaunch = await resolveDockerLogLaunch(service).catch(() => null);
  }
  return supervisor.attachExternal({ workspace, service, logLaunch });
}

async function reconcileExternalServices() {
  for (const workspace of configStore.snapshot.workspaces) {
    const services = workspace.externalServices ?? [];
    await supervisor.reconcileExternal(workspace, services);
    const activeIds = new Set(
      supervisor.snapshot()
        .filter((record) =>
          record.workspaceId === workspace.id && record.source === 'external'
        )
        .map((record) => record.projectId),
    );
    for (const service of services) {
      if (!activeIds.has(service.id)) await attachExternalService(workspace, service);
    }
  }
}

function resolveProject(workspaceId, projectId) {
  const catalog = catalogs.get(workspaceId);
  const project = catalog?.projects.find((item) => item.id === projectId);
  if (!catalog || !project) throw new Error('Projeto não encontrado.');
  return { workspace: catalog.workspace, project };
}

function applyRequestedFlutterTarget(project, request) {
  if (!request.flutterTarget) return project;
  if (project.ecosystem !== 'flutter') {
    throw new Error('Alvo Flutter só pode ser usado em um projeto Flutter.');
  }
  const profile = project.commands.find(
    (command) => command.id === request.commandId,
  );
  if (!profile?.flutterTarget) {
    throw new Error('Comando Flutter não disponível para o destino selecionado.');
  }
  const expectedTarget = profile.flutterTarget === 'test'
    ? 'test'
    : profile.category === 'build'
      ? `build-${request.flutterTarget.platform}`
      : request.flutterTarget.platform;
  if (profile.flutterTarget !== expectedTarget) {
    throw new Error('O comando Flutter não corresponde à plataforma selecionada.');
  }
  if (request.flutterTarget.platform === 'web' && request.flutterTarget.deviceId) {
    throw new Error('Flutter Web não aceita seleção manual de device.');
  }
  if (
    request.flutterTarget.platform !== 'web' &&
    !request.flutterTarget.deviceId
  ) {
    throw new Error('Selecione um device Flutter para Android ou iOS.');
  }
  return { ...project, flutterTarget: request.flutterTarget };
}

async function validateFlutterTarget(project) {
  if (project.ecosystem !== 'flutter' || !project.flutterTarget?.deviceId) return;
  const result = await listFlutterDevices({
    executable: project.runtime.components?.runtime?.path,
    cwd: project.absolutePath,
  });
  const device = result.devices.find((item) => item.id === project.flutterTarget.deviceId);
  if (!device || !device.available || (device.platform !== 'unknown' && device.platform !== project.flutterTarget.platform)) {
    throw new Error(
      `O device Flutter "${project.flutterTarget.deviceName ?? project.flutterTarget.deviceId}" ` +
      'não está disponível para a plataforma selecionada.',
    );
  }
}

async function validateDirectory(rootPath) {
  const canonical = await realpath(rootPath);
  const details = await stat(canonical);
  if (!details.isDirectory()) {
    throw new Error('O path informado não é um diretório.');
  }
  return canonical;
}

async function normalizeWorkspaceInput(payload) {
  const input = validateWorkspaceInput(payload);
  const projectSources = [];
  const seen = new Set();
  const seenProjectPaths = new Set();
  for (const source of input.projectSources) {
    const canonical = await validateDirectory(source.rootPath);
    if (seen.has(canonical)) {
      throw new Error(`Path de projeto duplicado: ${canonical}`);
    }
    seen.add(canonical);
    const inspection = await inspectProjectSource(canonical);
    const candidates = new Map(
      inspection.projects.map((project) => [project.relativePath, project]),
    );
    const selections = new Map(
      source.projects.map((project) => [project.relativePath, project]),
    );
    const projects = inspection.projects.flatMap((candidate) => {
      if (seenProjectPaths.has(candidate.absolutePath)) return [];
      seenProjectPaths.add(candidate.absolutePath);
      const selected = selections.get(candidate.relativePath);
      if (!selected && !candidate.suggestedKind) {
        throw new Error(
          `Classifique o projeto ${candidate.name} antes de salvar.`,
        );
      }
      const requestedDecision = selected ?? {
        relativePath: candidate.relativePath,
        kind: candidate.suggestedKind,
        kindSource: 'detected',
      };
      const decision = requestedDecision.kindSource === 'user'
        ? requestedDecision
        : {
            ...requestedDecision,
            kind: candidate.suggestedKind,
            kindSource: 'detected',
          };
      if (!decision.kind) {
        throw new Error(
          `Classifique o projeto ${candidate.name} antes de salvar.`,
        );
      }
      if (
        decision.localLibraryLink?.enabled &&
        (decision.kind !== 'library' ||
          !candidate.scripts[decision.localLibraryLink.developmentScript] ||
          !decision.localLibraryLink.preferredLinkScript.startsWith('link:'))
      ) {
        throw new Error(
          `Configuração de vínculo inválida para ${candidate.name}.`,
        );
      }
      return [{
        ...decision,
        ...(decision.localLibraryLink?.enabled
          ? {
              localLibraryLink: {
                ...decision.localLibraryLink,
                packageName:
                  decision.localLibraryLink.packageName ||
                  candidate.packageJson.name ||
                  candidate.name,
              },
            }
          : {}),
      }];
    });
    for (const relativePath of selections.keys()) {
      if (!candidates.has(relativePath)) {
        throw new Error(`Projeto não encontrado durante a revisão: ${relativePath}`);
      }
    }
    projectSources.push({
      ...(source.id ? { id: source.id } : {}),
      rootPath: inspection.rootPath,
      projects,
    });
  }
  return { ...input, projectSources };
}

async function restorePreviouslyActiveProjects(workspaceId, records) {
  const catalog = catalogs.get(workspaceId);
  if (!catalog || records.length === 0) return [];
  const failures = [];
  for (const record of records) {
    const project = catalog.projects.find(
      (candidate) => candidate.id === record.projectId,
    );
    if (!project?.defaultCommandId && !project?.defaultScript) continue;
    try {
      assertProjectNotActiveInAnotherWorkspace(workspaceId, project);
      await validateFlutterTarget(project);
      await supervisor.start({
        workspace: catalog.workspace,
        project,
        commandId:
          record.commandId &&
          project.commands?.some((command) => command.id === record.commandId)
            ? record.commandId
            : project.defaultCommandId,
        script:
          record.script && project.scripts[record.script]
            ? record.script
            : project.defaultScript,
      });
    } catch (error) {
      failures.push({
        projectId: record.projectId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
}

function workspaceChangedOperationally(current, input) {
  const roots = current.projectSources.map((source) => source.rootPath);
  return current.environment !== input.environment ||
    JSON.stringify(current.executionPolicies) !==
      JSON.stringify(input.executionPolicies) ||
    roots.length !== input.projectSources.length ||
    roots.some((root, index) => root !== input.projectSources[index].rootPath);
}

function removedOrChangedProjectIds(current, input) {
  const nextByRoot = new Map(
    input.projectSources.map((source) => [source.rootPath, source]),
  );
  return current.projectSources.flatMap((source) => {
    const next = nextByRoot.get(source.rootPath);
    if (!next) {
      return source.projects.map((project) =>
        project.relativePath === '.'
          ? source.rootProjectId
          : `${source.id}/${project.relativePath}`
      );
    }
    const nextProjects = new Map(
      next.projects.map((project) => [project.relativePath, project]),
    );
    return source.projects.flatMap((project) => {
      const candidate = nextProjects.get(project.relativePath);
      if (candidate && JSON.stringify(candidate) === JSON.stringify(project)) {
        return [];
      }
      return [project.relativePath === '.'
        ? source.rootProjectId
        : `${source.id}/${project.relativePath}`];
    });
  });
}

function summarizeProjectNames(projects, limit = 12) {
  const names = projects.slice(0, limit).map((project) => project.displayName);
  const remaining = projects.length - names.length;
  return `${names.join(', ')}${remaining > 0 ? ` e mais ${remaining}` : ''}`;
}

const roleOrder = new Map([
  ['library', 0],
  ['mfe', 1],
  ['application', 2],
  ['template', 3],
  ['shell', 4],
]);

function orderedExecutableProjects(catalog) {
  return catalog.projects
    .filter((project) =>
      (project.defaultCommandId || project.defaultScript) &&
      project.role !== 'template')
    .toSorted((left, right) =>
      (left.startupOrder ?? (roleOrder.get(left.role) ?? 3) * 100) -
      (right.startupOrder ?? (roleOrder.get(right.role) ?? 3) * 100));
}

const ACTIVE_PROCESS_STATES = new Set([
  'starting',
  'linking',
  'running',
  'healthy',
  'degraded',
  'stopping',
]);

function assertProjectNotActiveInAnotherWorkspace(workspaceId, project) {
  for (const managed of supervisor.snapshot()) {
    if (
      managed.workspaceId === workspaceId ||
      !ACTIVE_PROCESS_STATES.has(managed.status)
    ) {
      continue;
    }
    const otherCatalog = catalogs.get(managed.workspaceId);
    const otherProject = otherCatalog?.projects.find(
      (candidate) => candidate.id === managed.projectId,
    );
    if (otherProject?.absolutePath === project.absolutePath) {
      throw new Error(
        `"${project.displayName}" já está em execução na workspace ` +
        `"${otherCatalog?.workspace.name ?? managed.workspaceId}".`,
      );
    }
  }
}

async function startWorkspace(workspaceId) {
  const catalog = catalogs.get(workspaceId);
  if (!catalog) throw new Error('Workspace não descoberta.');
  const failures = [];
  for (const project of orderedExecutableProjects(catalog)) {
    try {
      assertProjectNotActiveInAnotherWorkspace(workspaceId, project);
      await supervisor.start({
        workspace: catalog.workspace,
        project,
        commandId: project.defaultCommandId,
        script: project.defaultScript,
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (error) {
      failures.push({ projectId: project.id, message: error.message });
    }
  }
  return { failures };
}

async function stopWorkspace(workspaceId) {
  const catalog = catalogs.get(workspaceId);
  const projectIds = catalog
    ? orderedExecutableProjects(catalog).reverse().map((project) => project.id)
    : undefined;
  await supervisor.stopWorkspace(workspaceId, projectIds);
}

async function restartWorkspace(workspaceId) {
  const catalog = catalogs.get(workspaceId);
  if (!catalog) throw new Error('Workspace não descoberta.');
  return restartActiveWorkspaceProjects({
    workspaceId,
    projects: orderedExecutableProjects(catalog),
    supervisor,
  });
}

async function reviewWorkspace(workspaceId) {
  const workspace = configStore.snapshot.workspaces.find(
    (item) => item.id === workspaceId,
  );
  if (!workspace) throw new Error('Workspace não encontrada.');
  const catalog = catalogs.get(workspaceId);
  const currentIds = new Set(catalog?.projects.map((project) => project.id) ?? []);
  const foundIds = new Set();
  const sources = [];
  for (const source of workspace.projectSources) {
    const inspection = await inspectProjectSource(source.rootPath);
    const publicInspection = publicSourceInspection(inspection);
    for (const candidate of publicInspection.projects) {
      const id = candidate.relativePath === '.'
        ? source.rootProjectId
        : `${source.id}/${candidate.relativePath}`;
      foundIds.add(id);
      const configured = source.projects.find(
        (project) => project.relativePath === candidate.relativePath,
      );
      if (configured) {
        candidate.configuredKind = configured.kind;
        candidate.kindSource = configured.kindSource;
        candidate.localLibraryLink = configured.localLibraryLink;
      }
      candidate.status = configured ? 'existing' : 'new';
    }
    sources.push({
      sourceId: source.id,
      status: 'existing',
      ...publicInspection,
    });
  }
  return {
    workspaceId,
    sources,
    missingProjects: (catalog?.projects ?? [])
      .filter((project) => currentIds.has(project.id) && !foundIds.has(project.id))
      .map((project) => ({
        projectId: project.id,
        name: project.displayName,
        relativePath: project.relativePath,
      })),
  };
}

function registerIpcHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.getSnapshot,
    withValidatedSender(async () => buildSnapshot()),
  );
  ipcMain.handle(
    IPC_CHANNELS.listNodeVersions,
    withValidatedSender(async () => listInstalledNodeVersions()),
  );
  ipcMain.handle(
    IPC_CHANNELS.listRuntimeInstallations,
    withValidatedSender(async (payload) =>
      listRuntimeInstallations(validateRuntimeComponentRequest(payload))
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.listFlutterDevices,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const catalog = catalogs.get(request.workspaceId);
      const project = catalog?.projects.find((item) => item.id === request.projectId);
      if (!project) throw new Error('Projeto não encontrado.');
      if (project.ecosystem !== 'flutter') {
        throw new Error('O projeto selecionado não é Flutter.');
      }
      return listFlutterDevices({
        executable: project.runtime.components?.runtime?.path,
        cwd: project.absolutePath,
      });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.listAndroidEmulators,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const { project } = resolveProject(request.workspaceId, request.projectId);
      if (project.ecosystem !== 'flutter') {
        throw new Error('O projeto selecionado não é Flutter.');
      }
      return listAndroidEmulators();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.launchAndroidEmulator,
    withValidatedSender(async (payload) => {
      const request = validateAndroidEmulatorRequest(payload);
      const { project } = resolveProject(request.workspaceId, request.projectId);
      if (project.ecosystem !== 'flutter') {
        throw new Error('O projeto selecionado não é Flutter.');
      }
      return launchAndroidEmulator({ emulatorId: request.emulatorId });
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.getNgrokStatus,
    withValidatedSender(async () => getNgrokStatus(ngrokOptions())),
  );
  ipcMain.handle(
    IPC_CHANNELS.listNgrokDomains,
    withValidatedSender(async () => listNgrokDomains(ngrokOptions())),
  );
  ipcMain.handle(
    IPC_CHANNELS.createNgrokDomain,
    withValidatedSender(async (payload) => {
      const request = validateNgrokDomainCreateRequest(payload);
      const hostname = composeNgrokManagedDomain(request.name, request.suffix);
      const catalog = await listNgrokDomains(ngrokOptions());
      const existing = catalog.domains.find((domain) =>
        domain.domain === hostname && domain.compatible
      );
      if (existing) return { canceled: false, domain: existing };
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Criar domínio no ngrok',
        message: `Criar o domínio "${hostname}" na sua conta ngrok?`,
        detail:
          'Esta operação altera sua conta. Dependendo do plano, o domínio pode exigir upgrade ou gerar cobrança.',
        buttons: ['Criar domínio', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (confirmation.response !== 0) return { canceled: true, domain: null };
      const domain = await createNgrokDomain({
        domain: hostname,
        description: request.description,
        ...ngrokOptions(),
      });
      return { canceled: false, domain };
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.startNgrokTunnel,
    withValidatedSender(async (payload) => {
      const request = validateNgrokTunnelRequest(payload);
      const projectCatalog = catalogs.get(request.workspaceId);
      const project = projectCatalog?.projects.find(
        (item) => item.id === request.projectId,
      );
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === request.workspaceId,
      );
      const externalService = workspace?.externalServices?.find(
        (item) => item.id === request.projectId,
      );
      if (!project && !externalService) throw new Error('Alvo do ngrok não encontrado.');
      const managed = supervisor.snapshot().find((record) =>
        record.workspaceId === request.workspaceId &&
        record.projectId === request.projectId
      );
      if (!managed || !['running', 'healthy', 'degraded', 'online'].includes(managed.status)) {
        throw new Error('O serviço precisa estar disponível antes de vincular o ngrok.');
      }
      if (!Number.isInteger(managed.port)) {
        throw new Error('O processo não possui uma porta válida para o ngrok.');
      }
      const catalog = await listNgrokDomains(ngrokOptions());
      const selected = catalog.domains.find((domain) =>
        domain.id === request.domainId && domain.domain === request.domain
      );
      if (!selected) {
        throw new Error('O domínio selecionado não pertence mais à conta ngrok.');
      }
      if (selected.wildcard) {
        throw new Error('Domínios wildcard não são suportados nesta versão.');
      }
      const status = await getNgrokStatus(ngrokOptions());
      if (!status.available) throw new Error(status.message);
      const launch = createNgrokLaunchSpecification({
        executablePath: status.executablePath,
        configPath: status.configPath,
        ...(externalService
          ? {
              upstream:
                `${externalService.scheme}://${externalService.host}:` +
                `${externalService.port}`,
            }
          : { port: managed.port }),
        domainId: selected.id,
        domain: selected.domain,
      });
      await supervisor.startNgrok(
        request.workspaceId,
        request.projectId,
        {
          ...launch,
          ...(project?.absolutePath ? { cwd: project.absolutePath } : {}),
          env: process.env,
        },
      );
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.stopNgrokTunnel,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      await supervisor.stopNgrok(request.workspaceId, request.projectId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openNgrokTunnel,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const managed = supervisor.snapshot().find((record) =>
        record.workspaceId === request.workspaceId &&
        record.projectId === request.projectId
      );
      if (managed?.ngrok?.status !== 'online' || !managed.ngrok.publicUrl) {
        throw new Error('O serviço não possui um túnel ngrok disponível.');
      }
      await electronShell.openExternal(managed.ngrok.publicUrl);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openNgrokResource,
    withValidatedSender(async (payload) => {
      const { resource } = validateNgrokResourceRequest(payload);
      await electronShell.openExternal(NGROK_RESOURCE_URLS[resource]);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openNgrokConfig,
    withValidatedSender(async () => {
      const status = await getNgrokStatus(ngrokOptions());
      if (!status.configValid || !status.configPath) {
        throw new Error('Nenhum arquivo de configuração válido do ngrok foi encontrado.');
      }
      const configPath = await realpath(status.configPath);
      const details = await stat(configPath);
      if (!details.isFile()) {
        throw new Error('A configuração detectada do ngrok não é um arquivo válido.');
      }
      await openPathInIde(configPath, configStore.snapshot.settings);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseNgrokExecutable,
    withValidatedSender(async (payload) => {
      const { initialPath } = validateDirectoryPickerRequest(payload);
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar executável do ngrok',
        properties: ['openFile'],
        ...(initialPath ? { defaultPath: initialPath } : {}),
      });
      if (result.canceled) return null;
      const executablePath = await realpath(result.filePaths[0]);
      if (!(await isDeveloperExecutable(executablePath))) {
        throw new Error('O arquivo selecionado não é um executável válido.');
      }
      return executablePath;
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseRuntimePath,
    withValidatedSender(async (payload) => {
      const request = validateRuntimePathPickerRequest(payload);
      const directory = runtimePathUsesDirectory(
        request.ecosystem,
        request.component,
      );
      const result = await dialog.showOpenDialog(mainWindow, {
        title: directory
          ? 'Selecionar diretório do runtime'
          : 'Selecionar executável',
        properties: [directory ? 'openDirectory' : 'openFile'],
        ...(request.initialPath ? { defaultPath: request.initialPath } : {}),
      });
      if (result.canceled) return null;
      const selectedPath = await realpath(result.filePaths[0]);
      const details = await stat(selectedPath);
      if (directory ? !details.isDirectory() : !details.isFile()) {
        throw new Error(
          directory
            ? 'Selecione um diretório válido.'
            : 'Selecione um arquivo executável válido.',
        );
      }
      return selectedPath;
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openRuntimeDownload,
    withValidatedSender(async (payload) => {
      const request = validateRuntimeComponentRequest(payload);
      const url = RUNTIME_DOWNLOAD_URLS[
        `${request.ecosystem}:${request.component}`
      ];
      if (!url) {
        throw new Error('Não há uma página oficial configurada para este item.');
      }
      await electronShell.openExternal(url);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseProjectDirectory,
    withValidatedSender(async (payload) => {
      const { initialPath } = validateDirectoryPickerRequest(payload);
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar projeto, raiz ou monorepo',
        properties: ['openDirectory'],
        ...(initialPath ? { defaultPath: initialPath } : {}),
      });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.inspectProjectSource,
    withValidatedSender(async (payload, event) => {
      const { rootPath, requestId } =
        validateProjectSourceInspectionRequest(payload);
      const sender = event.sender;
      return publicSourceInspection(
        await inspectProjectSource(
          await validateDirectory(rootPath),
          (progress) => {
            if (!sender.isDestroyed()) {
              sender.send(IPC_CHANNELS.projectSourceInspectionProgress, {
                requestId,
                ...progress,
              });
            }
          },
        ),
      );
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.reviewWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      return reviewWorkspace(workspaceId);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openLocalAddress,
    withValidatedSender(async (payload) => {
      const { port } = validateLocalAddressRequest(payload);
      await electronShell.openExternal(`http://127.0.0.1:${port}`);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.copyText,
    withValidatedSender(async (payload) => {
      const { text } = validateClipboardWriteRequest(payload);
      clipboard.writeText(text);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.listDeveloperTools,
    withValidatedSender(async () =>
      listDeveloperTools(configStore.snapshot.settings)
    ),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseIdeExecutable,
    withValidatedSender(async (payload) => {
      const { initialPath } = validateDirectoryPickerRequest(payload);
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar executável da IDE',
        properties: ['openFile'],
        ...(initialPath ? { defaultPath: initialPath } : {}),
      });
      if (result.canceled) return null;
      const executablePath = await realpath(result.filePaths[0]);
      const details = await stat(executablePath);
      if (!details.isFile()) throw new Error('Selecione um arquivo executável.');
      if (!(await isDeveloperExecutable(executablePath))) {
        throw new Error('O arquivo selecionado não possui permissão de execução.');
      }
      return executablePath;
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openProjectInIde,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const { project } = resolveProject(
        request.workspaceId,
        request.projectId,
      );
      await openProjectInIde(
        project.absolutePath,
        configStore.snapshot.settings,
      );
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openProjectFolder,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const { project } = resolveProject(
        request.workspaceId,
        request.projectId,
      );
      const error = await electronShell.openPath(project.absolutePath);
      if (error) throw new Error(`Não foi possível abrir a pasta: ${error}`);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openProjectTerminal,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const { project } = resolveProject(
        request.workspaceId,
        request.projectId,
      );
      await openProjectTerminal(project.absolutePath);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.refreshWorkspaceGit,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      const catalog = catalogs.get(workspaceId);
      if (!catalog) throw new Error('Workspace não descoberta.');
      catalog.projects = await enrichProjectsWithGit(catalog.projects);
      catalog.gitUpdatedAt = new Date().toISOString();
      broadcastSnapshot();
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.exportDiagnostics,
    withValidatedSender(async (payload) => {
      const request = validateDiagnosticExportRequest(payload);
      const catalog = catalogs.get(request.workspaceId);
      if (!catalog) throw new Error('Workspace não descoberta.');
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === request.workspaceId,
      );
      if (!workspace) throw new Error('Workspace não encontrada.');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar pacote de diagnóstico',
        defaultPath: path.join(
          app.getPath('documents'),
          defaultDiagnosticFilename(workspace.name),
        ),
        filters: [{ name: 'Arquivo ZIP', extensions: ['zip'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) {
        return { canceled: true, filePath: null };
      }
      const archive = buildDiagnosticArchive({
        workspace,
        catalog,
        processes: supervisor.snapshot(),
        systemInfo: collectSystemInfo({ appVersion: app.getVersion() }),
        appVersion: app.getVersion(),
        entryIds: request.entryIds,
        includeAbsolutePaths: request.includeAbsolutePaths,
      });
      await writeDiagnosticArchive(result.filePath, archive);
      return { canceled: false, filePath: result.filePath };
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.addWorkspace,
    withValidatedSender(async (payload) => {
      const input = await normalizeWorkspaceInput(payload);
      const workspace = await configStore.addWorkspace(input);
      await refreshWorkspace(workspace.id);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateWorkspace,
    withValidatedSender(async (payload) => {
      const value = assertPlainObject(payload, 'Atualização da workspace');
      const workspaceId = assertNonEmptyString(
        value.workspaceId,
        'Workspace',
        100,
      );
      const input = await normalizeWorkspaceInput(value);
      const current = configStore.snapshot.workspaces.find(
        (workspace) => workspace.id === workspaceId,
      );
      if (!current) throw new Error('Workspace não encontrada.');
      const stopAll = workspaceChangedOperationally(current, input);
      const changedProjectIds = stopAll
        ? null
        : new Set(removedOrChangedProjectIds(current, input));
      const activeBeforeUpdate = supervisor.snapshot().filter((record) =>
        record.workspaceId === workspaceId &&
        ACTIVE_PROCESS_STATES.has(record.status) &&
        (stopAll || changedProjectIds.has(record.projectId))
      );
      if (stopAll) {
        await stopWorkspace(workspaceId);
      } else {
        for (const projectId of changedProjectIds) {
          await supervisor.stop(workspaceId, projectId);
        }
      }
      await configStore.updateWorkspace(workspaceId, input);
      await refreshWorkspace(workspaceId);
      const restartFailures = await restorePreviouslyActiveProjects(
        workspaceId,
        activeBeforeUpdate,
      );
      if (restartFailures.length) {
        throw new Error(
          `${restartFailures.length} projeto(s) não puderam ser restaurados: ` +
          restartFailures.map((failure) => failure.message).join(' | '),
        );
      }
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.removeWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      await stopWorkspace(workspaceId);
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === workspaceId,
      );
      for (const service of workspace?.externalServices ?? []) {
        await supervisor.detachExternal(workspaceId, service.id);
      }
      await configStore.removeWorkspace(workspaceId);
      catalogs.delete(workspaceId);
      broadcastSnapshot();
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateSettings,
    withValidatedSender(async (payload) => {
      const settings = assertPlainObject(payload, 'Configurações');
      await configStore.updateSettings(settings);
      if (settings.theme !== undefined) {
        applyNativeTheme(configStore.snapshot.settings.theme);
      }
      if (settings.logLimit !== undefined) {
        await supervisor.setLogLimit(configStore.snapshot.settings.logLimit);
      }
      if (
        settings.globalNodePolicy !== undefined ||
        settings.executionPolicies !== undefined
      ) {
        await refreshAllWorkspaces();
      }
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateProject,
    withValidatedSender(async (payload) => {
      const update = validateProjectUpdate(payload);
      await configStore.updateProject(update.workspaceId, update.projectId, update);
      await refreshWorkspace(update.workspaceId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateProjectOrder,
    withValidatedSender(async (payload) => {
      const request = validateProjectOrderUpdate(payload);
      const catalog = catalogs.get(request.workspaceId);
      if (!catalog) throw new Error('Workspace não descoberta.');
      const configurableIds = new Set(
        catalog.projects
          .filter((project) => !project.orphaned)
          .map((project) => project.id),
      );
      if (
        request.projectIds.length !== configurableIds.size ||
        request.projectIds.some((projectId) => !configurableIds.has(projectId))
      ) {
        throw new Error(
          'A ordenação deve conter exatamente os projetos atuais da workspace.',
        );
      }
      await configStore.updateProjectOrder(
        request.workspaceId,
        request.projectIds,
      );
      await refreshWorkspace(request.workspaceId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.linkLibraries,
    withValidatedSender(async (payload) => {
      const request = validateLibraryLinkRequest(payload);
      const catalog = catalogs.get(request.workspaceId);
      if (!catalog) throw new Error('Workspace não descoberta.');
      const plan = buildLibraryLinkPlan(catalog, request);
      for (const project of [...plan.libraries, ...plan.consumers]) {
        assertProjectNotActiveInAnotherWorkspace(request.workspaceId, project);
      }
      const isBatch =
        plan.libraries.length > 1 ||
        plan.consumers.length > 1;
      if (isBatch) {
        const activeIds = new Set(
          supervisor.snapshot()
            .filter((process) =>
              process.workspaceId === request.workspaceId &&
              ['starting', 'linking', 'running', 'healthy', 'degraded', 'stopping']
                .includes(process.status)
            )
            .map((process) => process.projectId),
        );
        const runnable = plan.pairs.filter((pair) => pair.script);
        const skipped = plan.pairs.length - runnable.length;
        const restarted = new Set(
          runnable
            .filter((pair) => activeIds.has(pair.consumer.id))
            .map((pair) => pair.consumer.id),
        ).size;
        const confirmation = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Vincular bibliotecas?',
          message:
            `${plan.libraries.length} biblioteca(s) serão vinculadas em ` +
            `${plan.consumers.length} projeto(s).`,
          detail:
            `Bibliotecas: ${summarizeProjectNames(plan.libraries)}.\n` +
            `Consumidores: ${summarizeProjectNames(plan.consumers)}.\n\n` +
            `${runnable.length} vínculo(s) executável(is), ` +
            `${skipped} ignorado(s) e ${restarted} projeto(s) serão ` +
            'parados e reiniciados. Somente scripts link:* declarados ' +
            'nos package.json serão executados.',
          buttons: ['Cancelar', 'Vincular'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (confirmation.response !== 1) {
          return { snapshot: buildSnapshot(), results: [] };
        }
      }
      const results = await executeLibraryLinks({
        catalog,
        request,
        supervisor,
      });
      await refreshWorkspace(request.workspaceId);
      return { snapshot: buildSnapshot(), results };
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.excludeProject,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      resolveProject(request.workspaceId, request.projectId);
      await supervisor.stop(request.workspaceId, request.projectId);
      await configStore.excludeProject(request.workspaceId, request.projectId);
      await refreshWorkspace(request.workspaceId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.discoverExternalServices,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      return discoverExternalCandidatesForWorkspace(workspaceId);
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseExternalLogFile,
    withValidatedSender(async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar arquivo de log',
        properties: ['openFile'],
        filters: [
          { name: 'Logs e texto', extensions: ['log', 'txt', 'out'] },
          { name: 'Todos os arquivos', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePaths[0]) {
        return { canceled: true, filePath: null };
      }
      const filePath = await realpath(result.filePaths[0]);
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('Selecione um arquivo de log válido.');
      approvedExternalLogFiles.add(filePath);
      return { canceled: false, filePath };
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.addExternalService,
    withValidatedSender(async (payload) => {
      const request = validateExternalServiceCreateRequest(payload);
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === request.workspaceId,
      );
      if (!workspace) throw new Error('Workspace não encontrada.');
      if (externalDiscoveryExcludedPorts(request.workspaceId).includes(request.port)) {
        throw new Error(
          `A porta ${request.port} já pertence a um projeto ou vínculo desta workspace.`,
        );
      }
      if (request.logFilePath) {
        const canonicalLogFile = await realpath(request.logFilePath);
        if (!approvedExternalLogFiles.has(canonicalLogFile)) {
          throw new Error('Selecione o arquivo de log pelo diálogo do MFE Runner.');
        }
        request.logFilePath = canonicalLogFile;
      }
      const catalog = request.candidateId
        ? await discoverExternalServiceCandidates({
            excludedPorts: externalDiscoveryExcludedPorts(request.workspaceId),
          })
        : { candidates: [] };
      const definition = await buildExternalServiceDefinition(request, catalog);
      const service = await configStore.addExternalService(
        request.workspaceId,
        definition,
      );
      await attachExternalService(workspace, service);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.removeExternalService,
    withValidatedSender(async (payload) => {
      const request = validateExternalServiceRequest(payload);
      await supervisor.detachExternal(request.workspaceId, request.serviceId);
      await configStore.removeExternalService(
        request.workspaceId,
        request.serviceId,
      );
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.rebindExternalService,
    withValidatedSender(async (payload) => {
      const request = validateExternalServiceRequest(payload);
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === request.workspaceId,
      );
      const service = workspace?.externalServices?.find(
        (item) => item.id === request.serviceId,
      );
      if (!workspace || !service) throw new Error('Serviço externo não encontrado.');
      if (service.provider !== 'process') {
        throw new Error('Somente processos locais podem atualizar a identidade desta forma.');
      }
      const current = await inspectExternalProcess(service.port);
      if (!current) throw new Error('Nenhum processo está ouvindo na porta configurada.');
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Atualizar identidade externa?',
        message: `Vincular ${service.name} ao PID ${current.pid}?`,
        detail: 'Confirme apenas se este é o processo esperado para a porta configurada.',
        buttons: ['Cancelar', 'Atualizar vínculo'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return buildSnapshot();
      const updated = await configStore.replaceExternalService(
        request.workspaceId,
        request.serviceId,
        { ...service, identity: { pid: current.pid, name: current.name } },
      );
      await attachExternalService(workspace, updated);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.terminateExternalService,
    withValidatedSender(async (payload) => {
      const request = validateExternalServiceRequest(payload);
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === request.workspaceId,
      );
      const service = workspace?.externalServices?.find(
        (item) => item.id === request.serviceId,
      );
      if (!service) throw new Error('Serviço externo não encontrado.');
      const identity = service.provider === 'docker'
        ? `container ${service.identity.name ?? service.identity.containerId}`
        : `PID ${service.identity.pid ?? 'não identificado'}`;
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Encerrar serviço externo?',
        message: `Encerrar ${service.name} (${identity})?`,
        detail:
          'Este serviço não foi iniciado pelo MFE Runner. Dados não salvos podem ser perdidos.',
        buttons: ['Cancelar', 'Encerrar serviço'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return buildSnapshot();
      await supervisor.stopNgrok(request.workspaceId, request.serviceId);
      if (service.provider === 'docker') {
        await stopDockerContainer(service);
      } else {
        if (!Number.isInteger(service.identity?.pid) ||
            !['localhost', '127.0.0.1', '[::1]'].includes(service.host)) {
          throw new Error('Este serviço não possui um processo local encerrável.');
        }
        await terminateExternalPortProcess(service.port, service.identity.pid);
      }
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.openExternalServiceAddress,
    withValidatedSender(async (payload) => {
      const request = validateExternalServiceRequest(payload);
      const workspace = configStore.snapshot.workspaces.find(
        (item) => item.id === request.workspaceId,
      );
      const service = workspace?.externalServices?.find(
        (item) => item.id === request.serviceId,
      );
      if (!service) throw new Error('Serviço externo não encontrado.');
      await electronShell.openExternal(
        `${service.scheme}://${service.host}:${service.port}`,
      );
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.startProject,
    withValidatedSender(async (payload) => {
      const request = validateProcessRequest(payload);
      const { workspace, project } = resolveProject(
        request.workspaceId,
        request.projectId,
      );
      assertProjectNotActiveInAnotherWorkspace(request.workspaceId, project);
      const launchProject = applyRequestedFlutterTarget(project, request);
      await validateFlutterTarget(launchProject);
      await supervisor.start({
        workspace,
        project: launchProject,
        commandId: request.commandId,
        script: request.script,
      });
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.stopProject,
    withValidatedSender(async (payload) => {
      const request = validateProcessRequest(payload);
      await supervisor.stop(request.workspaceId, request.projectId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.restartProject,
    withValidatedSender(async (payload) => {
      const request = validateProcessRequest(payload);
      const { workspace, project } = resolveProject(
        request.workspaceId,
        request.projectId,
      );
      assertProjectNotActiveInAnotherWorkspace(request.workspaceId, project);
      await validateFlutterTarget(project);
      const existing = supervisor.snapshot().find(
        (process) =>
          process.workspaceId === request.workspaceId &&
          process.projectId === request.projectId,
      );
      await supervisor.stop(request.workspaceId, request.projectId);
      await supervisor.start({
        workspace,
        project,
        commandId: existing?.commandId ?? project.defaultCommandId,
        script: existing?.script ?? project.defaultScript,
      });
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.terminateExternalProcess,
    withValidatedSender(async (payload) => {
      const request = validateProjectRequest(payload);
      const { project } = resolveProject(
        request.workspaceId,
        request.projectId,
      );
      const record = supervisor.snapshot().find(
        (process) =>
          process.workspaceId === request.workspaceId &&
          process.projectId === request.projectId,
      );
      if (record?.status !== 'conflict' || !project.port) {
        throw new Error(
          'O projeto não possui um conflito de porta externo ativo.',
        );
      }

      const managedOwner = supervisor.snapshot().find(
        (process) =>
          process.key !== record.key &&
          process.port === project.port &&
          ['starting', 'linking', 'running', 'healthy', 'degraded', 'stopping'].includes(
            process.status,
          ),
      );
      if (managedOwner) {
        throw new Error(
          `A porta ${project.port} pertence a ${managedOwner.projectName}, ` +
            'que já é gerenciado pelo Runner. Pare esse projeto pela lista.',
        );
      }

      const external = await inspectExternalProcess(project.port);
      if (!external) {
        await supervisor.resolveExternalConflict(
          request.workspaceId,
          request.projectId,
          `A porta ${project.port} já estava liberada.`,
        );
        return buildSnapshot();
      }
      if (external.pid === process.pid) {
        throw new Error('O Runner recusou encerrar o próprio processo.');
      }

      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Encerrar processo externo?',
        message:
          `${external.name} (PID ${external.pid}) está ocupando a porta ` +
          `${project.port}.`,
        detail:
          `Usuário: ${external.owner}\n\n` +
          'O processo não foi iniciado pelo MFE Runner. Dados não salvos ' +
          'nesse processo podem ser perdidos. Se necessário, o sistema ' +
          'operacional solicitará autorização de administrador.',
        buttons: ['Cancelar', 'Encerrar processo'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return buildSnapshot();

      const result = await terminateExternalPortProcess(
        project.port,
        external.pid,
      );
      const message = result.alreadyClosed
        ? `O processo externo já havia encerrado; porta ${project.port} liberada.`
        : `Processo externo PID ${external.pid} encerrado; porta ` +
          `${project.port} liberada${result.elevated ? ' com autorização do sistema' : ''}.`;
      await supervisor.resolveExternalConflict(
        request.workspaceId,
        request.projectId,
        message,
      );
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.startWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      const result = await startWorkspace(workspaceId);
      return { snapshot: buildSnapshot(), ...result };
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.stopWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      await stopWorkspace(workspaceId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.restartWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      const result = await restartWorkspace(workspaceId);
      return { snapshot: buildSnapshot(), ...result };
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.clearLogs,
    withValidatedSender(async (payload) => {
      const value = payload && typeof payload === 'object' ? payload : {};
      await supervisor.clearLogs(value.workspaceId, value.projectId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.getUpdateState,
    withValidatedSender(async () => updateManager.snapshot),
  );
  ipcMain.handle(
    IPC_CHANNELS.checkForUpdates,
    withValidatedSender(async () =>
      updateManager.check({ userInitiated: true })),
  );
  ipcMain.handle(
    IPC_CHANNELS.downloadUpdate,
    withValidatedSender(async () => updateManager.download()),
  );
  ipcMain.handle(
    IPC_CHANNELS.installUpdate,
    withValidatedSender(async () => {
      await prepareSupervisorForUpdate({ supervisor });
      quitAllowed = true;
      try {
        scheduleMacUpdateRelaunch({
          helperPath: updateRelaunchHelperPath,
          expectedVersion:
            updateManager.snapshot.availableVersion ?? app.getVersion(),
        });
        updateManager.quitAndInstall();
      } catch (error) {
        quitAllowed = false;
        throw error;
      }
      return updateManager.snapshot;
    }),
  );
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relativePath) relativePath = 'index.html';
    const requestedPath = path.resolve(rendererDirectory, relativePath);
    const relative = path.relative(rendererDirectory, requestedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(requestedPath).toString());
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#080b12' : '#f3f5fa',
    title: APP_NAME,
    icon: APP_ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('app://bundle') ||
      (!app.isPackaged && url.startsWith('http://localhost:4200'));
    if (!allowed) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (quitAllowed) return;
    event.preventDefault();
    app.quit();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  const developmentUrl = process.env.MFE_RUNNER_DEV_URL;
  await mainWindow.loadURL(
    !app.isPackaged && developmentUrl
      ? developmentUrl
      : 'app://bundle/index.html',
  );
}

updateManager.on('state', broadcastUpdateState);
supervisor.on('snapshot', broadcastSnapshot);
supervisor.on('log', (entry) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.logReceived, entry);
  }
});
supervisor.on('connected', broadcastSnapshot);
supervisor.on('disconnected', broadcastSnapshot);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  quitAllowed = true;
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    applyApplicationIcon(app);
    registerAppProtocol();
    registerIpcHandlers();
    registerApplicationMenu();
    updateManager.initialize();
    await configStore.load();
    applyNativeTheme(configStore.snapshot.settings.theme);
    await supervisor.connectOrStart();
    await supervisor.setLogLimit(configStore.snapshot.settings.logLimit);
    await refreshAllWorkspaces();
    await reconcileExternalServices();
    await createWindow();
    const updateTimer = setTimeout(() => {
      void updateManager.check();
    }, 3000);
    updateTimer.unref();
  }).catch((error) => {
    dialog.showErrorBox(
      'Falha ao iniciar o MFE Runner',
      serializeError(error).message,
    );
    quitAllowed = true;
    supervisor.disconnect();
    app.quit();
  });
}

app.on('before-quit', (event) => {
  if (quitAllowed) return;
  event.preventDefault();
  if (quitAttemptInProgress) return;
  quitAttemptInProgress = true;

  void (async () => {
    try {
      await prepareSupervisorForExit({
        stopProcessesOnExit:
          configStore.snapshot.settings.stopProcessesOnExit,
        supervisor,
      });
      quitAllowed = true;
      app.quit();
    } catch (error) {
      quitAttemptInProgress = false;
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Não foi possível encerrar os processos',
        message: 'O MFE Runner continuará aberto.',
        detail: serializeError(error).message,
        buttons: ['OK'],
      });
    }
  })();
});

app.on('window-all-closed', () => app.quit());
