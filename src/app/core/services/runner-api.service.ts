import { Injectable, computed, signal } from '@angular/core';
import {
  DeveloperToolCatalog,
  DiagnosticExportRequest,
  DiagnosticExportResult,
  Ecosystem,
  ExecutionPolicies,
  IdePreference,
  LibraryLinkRequest,
  LibraryLinkResult,
  NodePolicy,
  ProjectHealthCheck,
  NodeVersionCatalog,
  ProcessRequest,
  RunnerSettings,
  RunnerSnapshot,
  RuntimeInstallationCatalog,
  UpdateState,
  WorkspaceInput,
  ProjectSourceInspection,
  ProjectSourceInspectionProgress,
  WorkspaceReview,
} from '../models/runner.models';

const EMPTY_SNAPSHOT: RunnerSnapshot = {
  config: {
    version: 6,
    settings: {
      globalNodePolicy: { mode: 'auto' },
      executionPolicies: {
        node: {
          runtime: { mode: 'auto' },
          packageManager: { mode: 'auto' },
        },
        'java-maven': {
          runtime: { mode: 'auto' },
          tool: { mode: 'auto' },
        },
        'java-gradle': {
          runtime: { mode: 'auto' },
          tool: { mode: 'auto' },
        },
        dotnet: { runtime: { mode: 'auto' } },
        python: { runtime: { mode: 'auto' }, tool: { mode: 'auto' } },
        rust: { runtime: { mode: 'auto' }, tool: { mode: 'auto' } },
        go: { runtime: { mode: 'auto' } },
      },
      theme: 'system',
      stopProcessesOnExit: false,
      logLimit: 1500,
      ide: null,
    },
    workspaces: [],
  },
  workspaces: [],
  processes: [],
  platform: 'unknown',
  systemInfo: {
    platform: 'unknown',
    platformName: 'Desconhecida',
    operatingSystem: {
      type: 'unknown',
      release: 'unknown',
      version: 'unknown',
      architecture: 'unknown',
    },
    hardware: {
      cpuModel: 'Não identificado',
      logicalCores: 0,
      totalMemoryBytes: 0,
    },
    runtime: {
      app: '0.1.0',
      node: 'unknown',
      electron: null,
      chrome: null,
      v8: 'unknown',
    },
  },
  supervisorConnected: false,
};

const EMPTY_NODE_CATALOG: NodeVersionCatalog = {
  detected: false,
  manager: null,
  versions: [],
  message: 'Verificando a instalação do NVM…',
};

const EMPTY_DEVELOPER_TOOLS: DeveloperToolCatalog = {
  ideApplications: [],
  selectedIdeId: null,
  terminal: {
    id: null,
    name: 'Verificando terminal…',
    available: false,
  },
};

const EMPTY_UPDATE_STATE: UpdateState = {
  supported: false,
  userInitiated: false,
  status: 'disabled',
  currentVersion: '0.1.0',
  availableVersion: null,
  progress: null,
  checkedAt: null,
  message: 'Verificando suporte a atualizações…',
};

@Injectable({ providedIn: 'root' })
export class RunnerApiService {
  readonly snapshot = signal<RunnerSnapshot>(EMPTY_SNAPSHOT);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly workspaces = computed(() => this.snapshot().workspaces);
  readonly processes = computed(() => this.snapshot().processes);
  readonly settings = computed(() => this.snapshot().config.settings);
  readonly nodeVersions = signal<NodeVersionCatalog>(EMPTY_NODE_CATALOG);
  readonly nodeVersionsLoading = signal(false);
  readonly runtimeInstallations = signal<
    Record<string, RuntimeInstallationCatalog>
  >({});
  readonly runtimeInstallationsLoading = signal<Record<string, boolean>>({});
  readonly developerTools = signal<DeveloperToolCatalog>(
    EMPTY_DEVELOPER_TOOLS,
  );
  readonly developerToolsLoading = signal(false);
  readonly updateState = signal<UpdateState>(EMPTY_UPDATE_STATE);

  private unsubscribeSnapshot?: () => void;
  private unsubscribeLog?: () => void;
  private unsubscribeUpdateState?: () => void;
  private unsubscribeProjectSourceProgress?: () => void;
  private readonly projectSourceProgressCallbacks = new Map<
    string,
    (progress: ProjectSourceInspectionProgress) => void
  >();
  private inspectionSequence = 0;

  async initialize(): Promise<void> {
    const api = this.getApi();
    this.unsubscribeSnapshot?.();
    this.unsubscribeLog?.();
    this.unsubscribeUpdateState?.();
    this.unsubscribeProjectSourceProgress?.();
    this.unsubscribeSnapshot = api.onSnapshot((snapshot) =>
      this.snapshot.set(snapshot)
    );
    this.unsubscribeLog = api.onLog(() => undefined);
    this.unsubscribeUpdateState = api.onUpdateState((state) =>
      this.updateState.set(state)
    );
    this.unsubscribeProjectSourceProgress =
      api.onProjectSourceInspectionProgress((progress) =>
        this.projectSourceProgressCallbacks.get(progress.requestId)?.(progress)
      );
    await Promise.all([
      this.run(() => api.getSnapshot()),
      this.refreshNodeVersions(),
      this.refreshDeveloperTools(),
      api.getUpdateState().then((state) => this.updateState.set(state)),
    ]);
  }

  destroy(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeLog?.();
    this.unsubscribeUpdateState?.();
    this.unsubscribeProjectSourceProgress?.();
    this.projectSourceProgressCallbacks.clear();
  }

  chooseProjectDirectory(initialPath?: string): Promise<string | null> {
    return this.getApi().chooseProjectDirectory({ initialPath });
  }

  async inspectProjectSource(
    rootPath: string,
    onProgress?: (progress: ProjectSourceInspectionProgress) => void,
  ): Promise<ProjectSourceInspection> {
    const requestId =
      `source-${Date.now().toString(36)}-${(++this.inspectionSequence).toString(36)}`;
    if (onProgress) {
      this.projectSourceProgressCallbacks.set(requestId, onProgress);
    }
    try {
      return await this.getApi().inspectProjectSource({ rootPath, requestId });
    } finally {
      this.projectSourceProgressCallbacks.delete(requestId);
    }
  }

  reviewWorkspace(workspaceId: string): Promise<WorkspaceReview> {
    return this.getApi().reviewWorkspace({ workspaceId });
  }

  addWorkspace(input: WorkspaceInput): Promise<void> {
    return this.run(() => this.getApi().addWorkspace(input));
  }

  updateWorkspace(workspaceId: string, input: WorkspaceInput): Promise<void> {
    return this.run(() =>
      this.getApi().updateWorkspace({ workspaceId, ...input })
    );
  }

  removeWorkspace(workspaceId: string): Promise<void> {
    return this.run(() => this.getApi().removeWorkspace({ workspaceId }));
  }

  startWorkspace(workspaceId: string): Promise<void> {
    return this.runResult(async () => {
      const result = await this.getApi().startWorkspace({ workspaceId });
      if (result.failures.length) {
        this.error.set(
          `${result.failures.length} projeto(s) não puderam ser iniciados.`,
        );
      }
      return result.snapshot;
    });
  }

  stopWorkspace(workspaceId: string): Promise<void> {
    return this.run(() => this.getApi().stopWorkspace({ workspaceId }));
  }

  restartWorkspace(workspaceId: string): Promise<void> {
    return this.runResult(async () => {
      const result = await this.getApi().restartWorkspace({ workspaceId });
      if (result.failures.length) {
        this.error.set(
          `${result.failures.length} projeto(s) não puderam ser reiniciados.`,
        );
      }
      return result.snapshot;
    });
  }

  async linkLibraries(
    request: LibraryLinkRequest,
  ): Promise<LibraryLinkResult | null> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await this.getApi().linkLibraries(request);
      this.snapshot.set(result.snapshot);
      const failed = result.results.filter((item) => item.status === 'failed');
      const skipped = result.results.filter((item) => item.status === 'skipped');
      const linked = result.results.filter((item) => item.status === 'linked');
      if (result.results.length) {
        this.notice.set(
          `Vínculo concluído: ${linked.length} concluído(s), ` +
          `${failed.length} com falha e ${skipped.length} ignorado(s).`,
        );
      }
      if (failed.length || skipped.length) {
        this.error.set(
          `${failed.length} vínculo(s) falharam e ` +
          `${skipped.length} foram ignorados.`,
        );
      }
      return result;
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Falha ao vincular bibliotecas.',
      );
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async openLocalAddress(port: number): Promise<void> {
    this.error.set(null);
    try {
      await this.getApi().openLocalAddress({ port });
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível abrir o endereço local.',
      );
    }
  }

  copyText(text: string): Promise<void> {
    return this.getApi().copyText({ text });
  }

  async refreshDeveloperTools(): Promise<void> {
    this.developerToolsLoading.set(true);
    try {
      this.developerTools.set(await this.getApi().listDeveloperTools());
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível detectar as ferramentas de desenvolvimento.',
      );
    } finally {
      this.developerToolsLoading.set(false);
    }
  }

  chooseIdeExecutable(initialPath?: string): Promise<string | null> {
    return this.getApi().chooseIdeExecutable({ initialPath });
  }

  async saveIde(preference: IdePreference | null): Promise<void> {
    await this.updateSettings({ ide: preference });
    await this.refreshDeveloperTools();
  }

  openProjectInIde(workspaceId: string, projectId: string): Promise<void> {
    return this.runAction(
      () => this.getApi().openProjectInIde({ workspaceId, projectId }),
      'Não foi possível abrir o projeto na IDE.',
    );
  }

  openProjectFolder(workspaceId: string, projectId: string): Promise<void> {
    return this.runAction(
      () => this.getApi().openProjectFolder({ workspaceId, projectId }),
      'Não foi possível abrir a pasta do projeto.',
    );
  }

  openProjectTerminal(workspaceId: string, projectId: string): Promise<void> {
    return this.runAction(
      () => this.getApi().openProjectTerminal({ workspaceId, projectId }),
      'Não foi possível abrir o terminal.',
    );
  }

  refreshWorkspaceGit(workspaceId: string): Promise<void> {
    return this.run(() =>
      this.getApi().refreshWorkspaceGit({ workspaceId })
    );
  }

  exportDiagnostics(
    request: DiagnosticExportRequest,
  ): Promise<DiagnosticExportResult> {
    return this.getApi().exportDiagnostics(request);
  }

  async refreshNodeVersions(): Promise<void> {
    this.nodeVersionsLoading.set(true);
    try {
      this.nodeVersions.set(await this.getApi().listNodeVersions());
    } catch (error) {
      this.nodeVersions.set({
        detected: false,
        manager: null,
        versions: [],
        message: error instanceof Error
          ? error.message
          : 'Não foi possível consultar as versões do NVM.',
      });
    } finally {
      this.nodeVersionsLoading.set(false);
    }
  }

  runtimeInstallationCatalog(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool' | 'packageManager',
  ): RuntimeInstallationCatalog {
    return this.runtimeInstallations()[`${ecosystem}:${component}`] ?? {
      ecosystem,
      component,
      installations: [],
    };
  }

  runtimeInstallationLoading(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool' | 'packageManager',
  ): boolean {
    return !!this.runtimeInstallationsLoading()[
      `${ecosystem}:${component}`
    ];
  }

  async refreshRuntimeInstallations(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool' | 'packageManager',
  ): Promise<void> {
    const key = `${ecosystem}:${component}`;
    this.runtimeInstallationsLoading.update((state) => ({
      ...state,
      [key]: true,
    }));
    try {
      const catalog = await this.getApi().listRuntimeInstallations({
        ecosystem,
        component,
      });
      this.runtimeInstallations.update((catalogs) => ({
        ...catalogs,
        [key]: catalog,
      }));
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível detectar as instalações locais.',
      );
    } finally {
      this.runtimeInstallationsLoading.update((state) => ({
        ...state,
        [key]: false,
      }));
    }
  }

  chooseRuntimePath(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool' | 'packageManager',
    initialPath?: string,
  ): Promise<string | null> {
    return this.getApi().chooseRuntimePath({
      ecosystem,
      component,
      initialPath,
    });
  }

  openRuntimeDownload(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool' | 'packageManager',
  ): Promise<void> {
    return this.runAction(
      () => this.getApi().openRuntimeDownload({ ecosystem, component }),
      'Não foi possível abrir a página oficial de instalação.',
    );
  }

  async updateSettings(
    input: Partial<RunnerSettings>,
    successMessage?: string,
  ): Promise<void> {
    await this.run(() => this.getApi().updateSettings(input));
    if (!this.error() && successMessage) this.notice.set(successMessage);
  }

  updateProject(
    workspaceId: string,
    projectId: string,
    nodePolicy: NodePolicy,
    defaultScript?: string,
    libraryLinkScripts?: Record<string, string>,
    startupOrder?: number,
    executionPolicies?: ExecutionPolicies,
    defaultCommandId?: string,
    healthCheck?: ProjectHealthCheck,
  ): Promise<void> {
    return this.run(() =>
      this.getApi().updateProject({
        workspaceId,
        projectId,
        nodePolicy,
        defaultScript,
        libraryLinkScripts,
        startupOrder,
        executionPolicies,
        defaultCommandId,
        healthCheck,
      })
    );
  }

  updateProjectOrder(
    workspaceId: string,
    projectIds: string[],
  ): Promise<void> {
    return this.run(() =>
      this.getApi().updateProjectOrder({ workspaceId, projectIds })
    );
  }

  excludeProject(workspaceId: string, projectId: string): Promise<void> {
    return this.run(() =>
      this.getApi().excludeProject({ workspaceId, projectId })
    );
  }

  startProject(input: ProcessRequest): Promise<void> {
    return this.run(() => this.getApi().startProject(input));
  }

  stopProject(input: ProcessRequest): Promise<void> {
    return this.run(() => this.getApi().stopProject(input));
  }

  restartProject(input: ProcessRequest): Promise<void> {
    return this.run(() => this.getApi().restartProject(input));
  }

  terminateExternalProcess(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    return this.run(() =>
      this.getApi().terminateExternalProcess({ workspaceId, projectId })
    );
  }

  clearLogs(workspaceId?: string, projectId?: string): Promise<void> {
    return this.run(() =>
      this.getApi().clearLogs({ workspaceId, projectId })
    );
  }

  async checkForUpdates(): Promise<void> {
    await this.runUpdateAction(
      () => this.getApi().checkForUpdates(),
      'Não foi possível buscar atualizações.',
    );
  }

  async downloadUpdate(): Promise<void> {
    await this.runUpdateAction(
      () => this.getApi().downloadUpdate(),
      'Não foi possível baixar a atualização.',
    );
  }

  async installUpdate(): Promise<boolean> {
    return this.runUpdateAction(
      () => this.getApi().installUpdate(),
      'Não foi possível instalar a atualização.',
    );
  }

  dismissError(): void {
    this.error.set(null);
  }

  dismissNotice(): void {
    this.notice.set(null);
  }

  private getApi() {
    if (!window.runnerApi) {
      throw new Error(
        'Bridge do Electron indisponível. Execute o aplicativo com npm start ou npm run dev.',
      );
    }
    return window.runnerApi;
  }

  private async runAction(
    operation: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<void> {
    this.error.set(null);
    try {
      await operation();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : fallbackMessage,
      );
    }
  }

  private async runUpdateAction(
    operation: () => Promise<UpdateState>,
    fallbackMessage: string,
  ): Promise<boolean> {
    this.error.set(null);
    try {
      this.updateState.set(await operation());
      return true;
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : fallbackMessage,
      );
      return false;
    }
  }

  private async run(
    operation: () => Promise<RunnerSnapshot>,
  ): Promise<void> {
    await this.runResult(operation);
  }

  private async runResult(
    operation: () => Promise<RunnerSnapshot>,
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.snapshot.set(await operation());
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Ocorreu um erro inesperado.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
