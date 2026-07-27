import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
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
  assertNonEmptyString,
  assertPlainObject,
  validateDirectoryPickerRequest,
  validateClipboardWriteRequest,
  validateDiagnosticExportRequest,
  validateLocalAddressRequest,
  validateLibraryInspectionRequest,
  validateLibraryLinkRequest,
  validateProcessRequest,
  validateProjectRequest,
  validateProjectUpdate,
  validateWorkspaceInput,
  validateWorkspaceRequest,
} from './lib/contracts.mjs';
import { discoverWorkspace } from './lib/discovery.mjs';
import { SupervisorClient } from './lib/supervisor-client.mjs';
import {
  prepareSupervisorForExit,
  prepareSupervisorForUpdate,
} from './lib/supervisor-exit-policy.mjs';
import { listInstalledNodeVersions } from './lib/node-resolver.mjs';
import { collectSystemInfo } from './lib/system-info.mjs';
import {
  inspectExternalProcess,
  terminateExternalProcess as terminateExternalPortProcess,
} from './lib/external-process.mjs';
import { APP_ICON_PATH, applyApplicationIcon } from './lib/app-icon.mjs';
import {
  APP_NAME,
  applyApplicationIdentity,
} from './lib/app-identity.mjs';
import {
  listDeveloperTools,
  isDeveloperExecutable,
  openProjectInIde,
  openProjectTerminal,
} from './lib/developer-tools.mjs';
import { enrichProjectsWithGit } from './lib/git-context.mjs';
import {
  buildDiagnosticArchive,
  defaultDiagnosticFilename,
  writeDiagnosticArchive,
} from './lib/diagnostic-export.mjs';
import { inspectLibraryDirectory } from './lib/library-inspector.mjs';
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
const updateManager = new UpdateManager({
  updater: autoUpdater,
  appVersion: app.getVersion(),
  packaged: app.isPackaged,
});
const catalogs = new Map();
let mainWindow = null;
let quitAttemptInProgress = false;
let quitAllowed = false;

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
    return handler(payload);
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
          scripts: {},
          scriptNames: [],
          defaultScript: null,
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
      await discoverWorkspace(workspace, config.settings.globalNodePolicy),
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

function resolveProject(workspaceId, projectId) {
  const catalog = catalogs.get(workspaceId);
  const project = catalog?.projects.find((item) => item.id === projectId);
  if (!catalog || !project) throw new Error('Projeto não encontrado.');
  return { workspace: catalog.workspace, project };
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
  const shellRootPath = await validateDirectory(input.shellRootPath);
  const mfeRootPaths = [];
  const seen = new Set();
  for (const rootPath of input.mfeRootPaths) {
    const canonical = await validateDirectory(rootPath);
    if (seen.has(canonical)) {
      throw new Error(`Path de MFE duplicado: ${canonical}`);
    }
    seen.add(canonical);
    mfeRootPaths.push(canonical);
  }
  const libraries = [];
  const seenLibraries = new Set();
  for (const library of input.libraries) {
    const canonical = await validateDirectory(library.rootPath);
    if (canonical === shellRootPath) {
      throw new Error('O shell não pode ser configurado como biblioteca.');
    }
    if (seenLibraries.has(canonical)) {
      throw new Error(`Path de biblioteca duplicado: ${canonical}`);
    }
    seenLibraries.add(canonical);
    const inspected = await inspectLibraryDirectory(canonical, library);
    libraries.push({
      rootPath: inspected.rootPath,
      developmentScript: inspected.developmentScript,
      artifactRelativePath: inspected.artifactRelativePath,
      preferredLinkScript: inspected.preferredLinkScript,
    });
  }
  return { ...input, shellRootPath, mfeRootPaths, libraries };
}

function workspaceChangedOperationally(current, input) {
  const roots = current.mfeRoots.map((root) => root.rootPath);
  return current.shellRootPath !== input.shellRootPath ||
    current.environment !== input.environment ||
    JSON.stringify(current.nodePolicy) !== JSON.stringify(input.nodePolicy) ||
    roots.length !== input.mfeRootPaths.length ||
    roots.some((root, index) => root !== input.mfeRootPaths[index]);
}

function changedLibraryProjectIds(current, input) {
  const nextByRoot = new Map(
    input.libraries.map((library) => [library.rootPath, library]),
  );
  return (current.libraries ?? []).flatMap((library) => {
    const next = nextByRoot.get(library.rootPath);
    const changed = !next ||
      library.developmentScript !== next.developmentScript ||
      library.artifactRelativePath !== next.artifactRelativePath ||
      library.preferredLinkScript !== next.preferredLinkScript;
    return changed ? [`library:${library.id}`] : [];
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
    .filter((project) => project.defaultScript && project.role !== 'template')
    .toSorted((left, right) =>
      (roleOrder.get(left.role) ?? 3) - (roleOrder.get(right.role) ?? 3));
}

async function startWorkspace(workspaceId) {
  const catalog = catalogs.get(workspaceId);
  if (!catalog) throw new Error('Workspace não descoberta.');
  const failures = [];
  for (const project of orderedExecutableProjects(catalog)) {
    try {
      await supervisor.start({
        workspace: catalog.workspace,
        project,
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
    IPC_CHANNELS.chooseShellDirectory,
    withValidatedSender(async (payload) => {
      const { initialPath } = validateDirectoryPickerRequest(payload);
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar o projeto shell',
        properties: ['openDirectory'],
        ...(initialPath ? { defaultPath: initialPath } : {}),
      });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseMfeDirectory,
    withValidatedSender(async (payload) => {
      const { initialPath } = validateDirectoryPickerRequest(payload);
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar projeto ou raiz de MFEs',
        properties: ['openDirectory'],
        ...(initialPath ? { defaultPath: initialPath } : {}),
      });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.chooseLibraryDirectory,
    withValidatedSender(async (payload) => {
      const { initialPath } = validateDirectoryPickerRequest(payload);
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar workspace da biblioteca',
        properties: ['openDirectory'],
        ...(initialPath ? { defaultPath: initialPath } : {}),
      });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.inspectLibraryDirectory,
    withValidatedSender(async (payload) => {
      const { rootPath } = validateLibraryInspectionRequest(payload);
      return inspectLibraryDirectory(await validateDirectory(rootPath));
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
      if (stopAll) {
        await stopWorkspace(workspaceId);
      } else {
        for (const projectId of changedLibraryProjectIds(current, input)) {
          await supervisor.stop(workspaceId, projectId);
        }
      }
      await configStore.updateWorkspace(workspaceId, input);
      await refreshWorkspace(workspaceId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.removeWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      await stopWorkspace(workspaceId);
      await configStore.removeWorkspace(workspaceId);
      catalogs.delete(workspaceId);
      broadcastSnapshot();
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.refreshWorkspace,
    withValidatedSender(async (payload) => {
      const { workspaceId } = validateWorkspaceRequest(payload);
      await configStore.restoreExcludedProjects(workspaceId);
      await refreshWorkspace(workspaceId);
      return buildSnapshot();
    }),
  );
  ipcMain.handle(
    IPC_CHANNELS.updateSettings,
    withValidatedSender(async (payload) => {
      const settings = assertPlainObject(payload, 'Configurações');
      await configStore.updateSettings(settings);
      if (settings.logLimit !== undefined) {
        await supervisor.setLogLimit(configStore.snapshot.settings.logLimit);
      }
      if (settings.globalNodePolicy !== undefined) {
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
    IPC_CHANNELS.linkLibraries,
    withValidatedSender(async (payload) => {
      const request = validateLibraryLinkRequest(payload);
      const catalog = catalogs.get(request.workspaceId);
      if (!catalog) throw new Error('Workspace não descoberta.');
      const plan = buildLibraryLinkPlan(catalog, request);
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
      const { project } = resolveProject(request.workspaceId, request.projectId);
      if (project.role !== 'mfe') {
        throw new Error('Somente micro front-ends podem ser ocultados.');
      }
      await supervisor.stop(request.workspaceId, request.projectId);
      await configStore.excludeProject(request.workspaceId, request.projectId);
      await refreshWorkspace(request.workspaceId);
      return buildSnapshot();
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
      await supervisor.start({ workspace, project, script: request.script });
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
      const existing = supervisor.snapshot().find(
        (process) =>
          process.workspaceId === request.workspaceId &&
          process.projectId === request.projectId,
      );
      await supervisor.stop(request.workspaceId, request.projectId);
      await supervisor.start({
        workspace,
        project,
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
      await stopWorkspace(workspaceId);
      const result = await startWorkspace(workspaceId);
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
    backgroundColor: '#080b12',
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
    await supervisor.connectOrStart();
    await supervisor.setLogLimit(configStore.snapshot.settings.logLimit);
    await refreshAllWorkspaces();
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
