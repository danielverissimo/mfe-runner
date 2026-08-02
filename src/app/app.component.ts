import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AndroidEmulator,
  DiscoveredProject,
  AppTheme,
  Ecosystem,
  ExecutionPolicies,
  ExternalServiceConfig,
  ExternalServiceCreateInput,
  IdePreference,
  NodePolicyMode,
  ProcessStatus,
  ProcessRequest,
  FlutterDevice,
  FlutterProjectTarget,
  NgrokManagedDomainSuffix,
  RunnerEnvironment,
  WorkspaceCatalog,
  WorkspaceConfig,
  WorkspaceInput,
} from './core/models/runner.models';
import { RunnerApiService } from './core/services/runner-api.service';
import { LogPanelComponent } from './shared/log-panel/log-panel.component';
import { ExternalServiceDialogComponent } from './shared/external-service-dialog/external-service-dialog.component';
import {
  FlutterLaunchAction,
  FlutterLaunchDialogComponent,
  FlutterLaunchSelection,
} from './shared/flutter-launch-dialog/flutter-launch-dialog.component';
import {
  NgrokDialogComponent,
  NgrokTunnelSelection,
} from './shared/ngrok-dialog/ngrok-dialog.component';
import { NodeVersionPickerComponent } from './shared/node-version-picker/node-version-picker.component';
import { ProcessTableComponent } from './shared/process-table/process-table.component';
import {
  ProjectSettingsChange,
  ProjectSettingsDialogComponent,
} from './shared/project-settings-dialog/project-settings-dialog.component';
import { SystemInfoDialogComponent } from './shared/system-info-dialog/system-info-dialog.component';
import { WorkspaceDialogComponent } from './shared/workspace-dialog/workspace-dialog.component';
import { ActionTooltipDirective } from './shared/action-tooltip/action-tooltip.directive';
import {
  RunnerIconComponent,
  RunnerIconName,
} from './shared/runner-icon/runner-icon.component';
import { RunnerSelectComponent } from './shared/runner-select/runner-select.component';
import { I18nRootDirective } from './core/i18n/i18n-root.directive';
import {
  AppLanguage,
  I18nService,
} from './core/i18n/i18n.service';

const ANDROID_EMULATOR_POLL_INTERVAL_MS = 2000;
const ANDROID_EMULATOR_POLL_ATTEMPTS = 61;
const NGROK_CONFIG_COMMANDS = Object.freeze({
  authtoken: 'ngrok config add-authtoken <AUTHTOKEN>',
  apiKey: 'ngrok config add-api-key <API_KEY>',
});

type NgrokConfigCommand = keyof typeof NGROK_CONFIG_COMMANDS;

type Section = 'projects' | 'workspaces' | 'logs' | 'settings';

interface ProjectDialogContext {
  catalog: WorkspaceCatalog;
  project: DiscoveredProject;
}

interface FlutterLaunchContext {
  catalog: WorkspaceCatalog;
  project: DiscoveredProject;
  action: FlutterLaunchAction;
}

interface NgrokDialogContext {
  catalog: WorkspaceCatalog;
  targetId: string;
  targetName: string;
  project?: DiscoveredProject;
}

interface WorkspaceRemovalContext {
  id: string;
  name: string;
}

type ProjectVisibility = 'all' | 'running';
type PolicyComponent = 'runtime' | 'tool' | 'packageManager';

interface EcosystemSettingsCard {
  ecosystem: Ecosystem;
  label: string;
  supportLevel: 'stable' | 'beta';
  components: Array<{ id: PolicyComponent; label: string }>;
}

const ACTIVE_PROCESS_STATUSES = new Set<ProcessStatus>([
  'starting',
  'linking',
  'running',
  'healthy',
  'degraded',
  'stopping',
]);

function normalizeProjectSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionTooltipDirective,
    I18nRootDirective,
    FlutterLaunchDialogComponent,
    ExternalServiceDialogComponent,
    LogPanelComponent,
    NgrokDialogComponent,
    NodeVersionPickerComponent,
    ProcessTableComponent,
    ProjectSettingsDialogComponent,
    RunnerIconComponent,
    RunnerSelectComponent,
    SystemInfoDialogComponent,
    WorkspaceDialogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private static readonly WORKSPACE_STORAGE_KEY =
    'mfe-runner.selected-workspace-id';
  private static readonly SPLIT_STORAGE_KEY =
    'mfe-runner.projects.process-area-percent';
  private static readonly DEFAULT_SPLIT = 68;
  private static readonly MIN_PROCESS_AREA_PX = 180;
  private static readonly MIN_LOG_AREA_PX = 150;
  private static readonly SPLITTER_HEIGHT_PX = 12;

  readonly runner = inject(RunnerApiService);
  readonly i18n = inject(I18nService);
  private readonly document = inject(DOCUMENT);
  readonly section = signal<Section>('projects');
  readonly sectionBeforeLogs = signal<Section>('projects');
  readonly selectedWorkspaceId = signal<string | null>(null);
  readonly selectedLogProjectId = signal<string | undefined>(undefined);
  readonly selectedLogWorkspaceId = signal<string | undefined>(undefined);
  readonly workspaceDialogOpen = signal(false);
  readonly workspaceDialogTarget = signal<WorkspaceConfig | null>(null);
  readonly workspaceDialogReviewMode = signal(false);
  readonly workspaceRemoval = signal<WorkspaceRemovalContext | null>(null);
  readonly projectDialogContext = signal<ProjectDialogContext | null>(null);
  readonly flutterLaunchContext = signal<FlutterLaunchContext | null>(null);
  readonly ngrokDialogContext = signal<NgrokDialogContext | null>(null);
  readonly externalServiceDialogOpen = signal(false);
  readonly externalServiceSubmitting = signal(false);
  readonly ngrokCreating = signal(false);
  readonly copiedNgrokCommand = signal<NgrokConfigCommand | null>(null);
  readonly systemInfoDialogOpen = signal(false);
  readonly projectVisibility = signal<ProjectVisibility>('all');
  readonly projectNameFilter = signal('');
  readonly globalVersionDraft = signal('');
  readonly globalPolicyPathDrafts = signal<Record<string, string>>({});
  readonly pendingExplicitPolicies = signal<Record<string, true>>({});
  readonly flutterDevices = signal<FlutterDevice[]>([]);
  readonly flutterDevicesLoading = signal(false);
  readonly androidEmulators = signal<AndroidEmulator[]>([]);
  readonly androidEmulatorsLoading = signal(false);
  readonly androidEmulatorStarting = signal(false);
  readonly androidEmulatorBooting = signal(false);
  readonly androidEmulatorMessage = signal<string | null>(null);
  readonly effectiveTheme = signal<'light' | 'dark'>('dark');
  readonly logLimitDraft = signal('');
  readonly processAreaPercent = signal(this.readSplitPreference());
  readonly resizing = signal(false);
  readonly updateNoticeDismissed = signal(false);
  readonly installingUpdate = signal(false);
  @ViewChild(WorkspaceDialogComponent)
  private workspaceDialog?: WorkspaceDialogComponent;
  @ViewChild(ExternalServiceDialogComponent)
  private externalServiceDialog?: ExternalServiceDialogComponent;
  private workspaceBounds: DOMRect | null = null;
  private updateNoticeTimer?: ReturnType<typeof setTimeout>;
  private ngrokCopyNoticeTimer?: ReturnType<typeof setTimeout>;
  private androidEmulatorPollGeneration = 0;
  private syncedLogLimit?: number;
  private systemThemeQuery?: MediaQueryList;
  private readonly systemThemeChange = (): void => {
    if (this.runner.settings().theme === 'system') this.applyTheme('system');
  };

  readonly navigation: {
    id: Section;
    label: string;
    icon: RunnerIconName;
  }[] = [
    { id: 'projects', label: 'Projetos', icon: 'grid' },
    { id: 'workspaces', label: 'Workspaces', icon: 'diamond' },
    { id: 'logs', label: 'Logs', icon: 'list' },
    { id: 'settings', label: 'Configurações', icon: 'settings' },
  ];
  readonly ecosystemSettings: EcosystemSettingsCard[] = [
    {
      ecosystem: 'node',
      label: 'Node.js',
      supportLevel: 'stable',
      components: [
        { id: 'runtime', label: 'Node.js' },
        { id: 'packageManager', label: 'npm, pnpm ou Yarn' },
      ],
    },
    {
      ecosystem: 'java-maven',
      label: 'Java / Maven',
      supportLevel: 'beta',
      components: [
        { id: 'runtime', label: 'JDK' },
        { id: 'tool', label: 'Maven' },
      ],
    },
    {
      ecosystem: 'java-gradle',
      label: 'Java / Gradle',
      supportLevel: 'beta',
      components: [
        { id: 'runtime', label: 'JDK' },
        { id: 'tool', label: 'Gradle' },
      ],
    },
    {
      ecosystem: 'dotnet',
      label: '.NET',
      supportLevel: 'beta',
      components: [{ id: 'runtime', label: '.NET SDK' }],
    },
    {
      ecosystem: 'python',
      label: 'Python',
      supportLevel: 'beta',
      components: [{ id: 'runtime', label: 'Python / ambiente virtual' }],
    },
    {
      ecosystem: 'rust',
      label: 'Rust',
      supportLevel: 'beta',
      components: [{ id: 'runtime', label: 'Rust / Cargo' }],
    },
    {
      ecosystem: 'go',
      label: 'Go',
      supportLevel: 'beta',
      components: [{ id: 'runtime', label: 'Go toolchain' }],
    },
    {
      ecosystem: 'flutter',
      label: 'Flutter',
      supportLevel: 'beta',
      components: [{ id: 'runtime', label: 'Flutter SDK / FVM' }],
    },
  ];

  readonly selectedCatalog = computed(() => {
    const workspaces = this.runner.workspaces();
    return workspaces.find(
      (catalog) => catalog.workspace.id === this.selectedWorkspaceId(),
    ) ?? workspaces[0] ?? null;
  });

  readonly nameFilteredProjects = computed(() => {
    const catalog = this.selectedCatalog();
    if (!catalog) return [];
    const terms = normalizeProjectSearch(this.projectNameFilter())
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) return catalog.projects;
    return catalog.projects.filter((project) => {
      const searchableName = normalizeProjectSearch([
        project.displayName,
        project.name,
        project.relativePath,
      ].join(' '));
      return terms.every((term) => searchableName.includes(term));
    });
  });

  readonly activeProjectIds = computed(() => {
    const catalog = this.selectedCatalog();
    if (!catalog) return new Set<string>();
    return new Set(
      this.runner.processes()
        .filter((process) =>
          process.workspaceId === catalog.workspace.id &&
          ACTIVE_PROCESS_STATUSES.has(process.status))
        .map((process) => process.projectId),
    );
  });

  readonly filteredRunningProjectCount = computed(() =>
    this.nameFilteredProjects().filter((project) =>
      this.activeProjectIds().has(project.id)).length
  );

  readonly visibleProjects = computed(() => {
    const projects = this.nameFilteredProjects();
    if (this.projectVisibility() === 'all') return projects;
    const activeProjectIds = this.activeProjectIds();
    return projects.filter((project) => activeProjectIds.has(project.id));
  });

  readonly externalServices = computed(() =>
    this.selectedCatalog()?.workspace.externalServices ?? []
  );

  readonly projectEmptyMessage = computed(() => {
    if (normalizeProjectSearch(this.projectNameFilter())) {
      return this.projectVisibility() === 'running'
        ? 'Nenhum projeto em execução corresponde à busca.'
        : 'Nenhum projeto corresponde à busca.';
    }
    return this.projectVisibility() === 'running'
      ? 'Nenhum projeto está em execução.'
      : 'Nenhum projeto executável foi descoberto nestes paths.';
  });

  readonly workspaceMetrics = computed(() => {
    const catalog = this.selectedCatalog();
    if (!catalog) {
      return {
        projects: 0,
        running: 0,
        attention: 0,
        manifests: 0,
        externalServices: 0,
      };
    }
    const processByProject = new Map(
      this.runner.processes()
        .filter((process) => process.workspaceId === catalog.workspace.id)
        .map((process) => [process.projectId, process]),
    );
    return {
      projects: catalog.projects.length,
      running: catalog.projects.filter((project) =>
        ACTIVE_PROCESS_STATUSES.has(
          processByProject.get(project.id)?.status ?? 'stopped',
        ),
      ).length,
      attention: catalog.projects.filter((project) =>
        project.warnings.length ||
        project.git.compatibleWithShell === false ||
        ['degraded', 'failed', 'conflict'].includes(
          processByProject.get(project.id)?.status ?? '',
        )
      ).length,
      manifests: catalog.manifests.length,
      externalServices: catalog.workspace.externalServices?.length ?? 0,
    };
  });

  readonly showUpdateNotice = computed(() => {
    const update = this.runner.updateState();
    if (
      update.status === 'not-available' &&
      this.updateNoticeDismissed()
    ) {
      return false;
    }
    return ['available', 'downloading', 'downloaded'].includes(update.status) ||
      (
        update.userInitiated &&
        ['checking', 'not-available', 'error'].includes(update.status)
      );
  });

  constructor() {
    effect(() => {
      const workspaces = this.runner.workspaces();
      const selected = this.selectedWorkspaceId();
      if (
        workspaces.length &&
        !workspaces.some((item) => item.workspace.id === selected)
      ) {
        const persistedWorkspaceId = this.readWorkspacePreference();
        const restoredWorkspace = workspaces.find(
          (item) => item.workspace.id === persistedWorkspaceId,
        ) ?? workspaces[0];
        this.activateWorkspace(restoredWorkspace.workspace.id);
      }
      if (!workspaces.length) this.selectedWorkspaceId.set(null);
      const globalPolicy = this.runner.settings().globalNodePolicy;
      if (globalPolicy.version && !this.globalVersionDraft()) {
        this.globalVersionDraft.set(globalPolicy.version);
      }
      const drafts = { ...this.globalPolicyPathDrafts() };
      let draftsChanged = false;
      for (const [ecosystem, components] of Object.entries(
        this.runner.settings().executionPolicies,
      )) {
        for (const [component, policy] of Object.entries(components ?? {})) {
          const key = `${ecosystem}:${component}`;
          if (policy?.path && !drafts[key]) {
            drafts[key] = policy.path;
            draftsChanged = true;
          }
        }
      }
      if (draftsChanged) this.globalPolicyPathDrafts.set(drafts);
      const logLimit = this.runner.settings().logLimit;
      if (
        this.syncedLogLimit === undefined ||
        this.logLimitDraft() === String(this.syncedLogLimit)
      ) {
        this.logLimitDraft.set(String(logLimit));
      }
      this.syncedLogLimit = logLimit;
      this.applyTheme(this.runner.settings().theme);
    });
    effect(() => {
      const update = this.runner.updateState();
      this.clearUpdateNoticeTimer();
      if (update.status === 'checking') {
        this.updateNoticeDismissed.set(false);
      }
      if (update.userInitiated && update.status === 'not-available') {
        this.updateNoticeTimer = setTimeout(
          () => this.dismissUpdateNotice(),
          5_000,
        );
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.systemThemeQuery = this.document.defaultView?.matchMedia(
      '(prefers-color-scheme: dark)',
    );
    this.systemThemeQuery?.addEventListener('change', this.systemThemeChange);
    this.applyTheme(this.runner.settings().theme);
    await this.runner.initialize();
  }

  ngOnDestroy(): void {
    this.androidEmulatorPollGeneration += 1;
    this.clearUpdateNoticeTimer();
    this.clearNgrokCopyNoticeTimer();
    this.systemThemeQuery?.removeEventListener('change', this.systemThemeChange);
    this.runner.destroy();
  }

  dismissUpdateNotice(): void {
    this.updateNoticeDismissed.set(true);
    this.clearUpdateNoticeTimer();
  }

  private clearUpdateNoticeTimer(): void {
    if (this.updateNoticeTimer) {
      clearTimeout(this.updateNoticeTimer);
      this.updateNoticeTimer = undefined;
    }
  }

  selectSection(section: Section): void {
    const previous = this.section();
    if (section === 'logs' && this.section() !== 'logs') {
      this.sectionBeforeLogs.set(this.section());
    }
    this.section.set(section);
    if (section === 'settings' && previous !== 'settings') {
      for (const card of this.ecosystemSettings) {
        for (const component of card.components) {
          if (card.ecosystem === 'node' && component.id === 'runtime') continue;
          void this.runner.refreshRuntimeInstallations(
            card.ecosystem,
            component.id,
          );
        }
      }
    }
    if (section === 'projects' && previous !== 'projects') {
      const workspaceId = this.currentWorkspaceId();
      if (workspaceId) void this.runner.refreshWorkspaceGit(workspaceId);
    }
  }

  backFromLogs(): void {
    const destination = this.sectionBeforeLogs();
    this.section.set(destination === 'logs' ? 'projects' : destination);
  }

  selectWorkspace(workspaceId: string): void {
    this.activateWorkspace(workspaceId);
    this.selectedLogProjectId.set(undefined);
    this.selectedLogWorkspaceId.set(undefined);
  }

  changeLanguage(language: AppLanguage): void {
    this.i18n.setLanguage(language);
  }

  async openWorkspaceDialog(workspace: WorkspaceConfig | null = null): Promise<void> {
    this.workspaceDialogTarget.set(workspace);
    this.workspaceDialogReviewMode.set(false);
    this.workspaceDialogOpen.set(true);
    await Promise.resolve();
    if (workspace) {
      for (let index = 0; index < workspace.projectSources.length; index += 1) {
        const source = workspace.projectSources[index];
        this.workspaceDialog?.startInspection(index);
        try {
          const inspection = await this.runner.inspectProjectSource(
            source.rootPath,
            (progress) =>
              this.workspaceDialog?.setInspectionProgress(index, progress),
          );
          this.workspaceDialog?.setInspection(index, inspection);
        } catch (error) {
          this.workspaceDialog?.setInspectionError(
            index,
            error instanceof Error ? error.message : 'Falha na análise do path.',
          );
        }
      }
    }
  }

  closeWorkspaceDialog(): void {
    this.workspaceDialogOpen.set(false);
    this.workspaceDialogTarget.set(null);
    this.workspaceDialogReviewMode.set(false);
  }

  async addProjectPath(): Promise<void> {
    const selectedPath = await this.runner.chooseProjectDirectory();
    if (!selectedPath) return;
    const index = this.workspaceDialog?.beginInspection(selectedPath);
    if (index === undefined) return;
    try {
      const inspection = await this.runner.inspectProjectSource(
        selectedPath,
        (progress) =>
          this.workspaceDialog?.setInspectionProgress(index, progress),
      );
      this.workspaceDialog?.setInspection(index, inspection);
    } catch (error) {
      this.workspaceDialog?.setInspectionError(
        index,
        error instanceof Error ? error.message : 'Não foi possível analisar o path.',
      );
    }
  }

  async reviewWorkspace(catalog: WorkspaceCatalog): Promise<void> {
    this.workspaceDialogTarget.set(catalog.workspace);
    this.workspaceDialogReviewMode.set(true);
    this.workspaceDialogOpen.set(true);
    await Promise.resolve();
    try {
      const review = await this.runner.reviewWorkspace(catalog.workspace.id);
      review.sources.forEach((source, index) =>
        this.workspaceDialog?.setInspection(index, source)
      );
      this.workspaceDialog?.setMissingProjects(review.missingProjects);
    } catch (error) {
      catalog.workspace.projectSources.forEach((_, index) =>
        this.workspaceDialog?.setInspectionError(
          index,
          error instanceof Error
            ? error.message
            : 'Não foi possível revisar a workspace.',
        )
      );
    }
  }

  async saveWorkspace(input: WorkspaceInput): Promise<void> {
    const target = this.workspaceDialogTarget();
    if (target) {
      await this.runner.updateWorkspace(target.id, input);
    } else {
      await this.runner.addWorkspace(input);
    }
    if (!this.runner.error()) {
      this.closeWorkspaceDialog();
      const created = this.runner.workspaces().find(
        (catalog) => catalog.workspace.name === input.name,
      );
      if (created) this.activateWorkspace(created.workspace.id);
      this.section.set('projects');
    }
  }

  async removeWorkspace(catalog: WorkspaceCatalog): Promise<void> {
    const confirmed = window.confirm(
      `Remover a workspace "${catalog.workspace.name}" do Runner?\n\n` +
      'Os processos serão parados. Nenhum arquivo será apagado.',
    );
    if (!confirmed) return;
    this.workspaceRemoval.set({
      id: catalog.workspace.id,
      name: catalog.workspace.name,
    });
    try {
      await this.runner.removeWorkspace(catalog.workspace.id);
    } finally {
      this.workspaceRemoval.set(null);
    }
  }

  openProjects(catalog: WorkspaceCatalog): void {
    this.activateWorkspace(catalog.workspace.id);
    this.section.set('projects');
  }

  hasLinkLibraries(catalog: WorkspaceCatalog): boolean {
    return catalog.projects.some((project) => !!project.library);
  }

  async updateEnvironment(
    catalog: WorkspaceCatalog,
    value: string,
  ): Promise<void> {
    const environment = value as RunnerEnvironment;
    await this.runner.updateWorkspace(
      catalog.workspace.id,
      this.workspaceInput(catalog.workspace, { environment }),
    );
  }

  async excludeProject(
    catalog: WorkspaceCatalog,
    projectId: string,
  ): Promise<void> {
    const project = catalog.projects.find((item) => item.id === projectId);
    if (!project) return;
    const itemType = project.kind === 'library' ? 'biblioteca' : 'projeto';
    const confirmed = window.confirm(
      `Remover ${itemType} "${project.displayName}" da workspace?\n\n` +
      'O processo será parado e nenhum arquivo será apagado. ' +
      'O item poderá ser adicionado novamente ao redescobrir a workspace.',
    );
    if (confirmed) {
      await this.runner.excludeProject(catalog.workspace.id, project.id);
    }
  }

  async moveProject(
    catalog: WorkspaceCatalog,
    projectId: string,
    direction: 'up' | 'down',
  ): Promise<void> {
    if (
      this.projectVisibility() !== 'all' ||
      normalizeProjectSearch(this.projectNameFilter())
    ) return;
    const projects = catalog.projects.filter((project) => !project.orphaned);
    const index = projects.findIndex((project) => project.id === projectId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= projects.length) return;
    const projectIds = projects.map((project) => project.id);
    [projectIds[index], projectIds[targetIndex]] = [
      projectIds[targetIndex],
      projectIds[index],
    ];
    await this.runner.updateProjectOrder(catalog.workspace.id, projectIds);
  }

  openProjectSettings(projectId: string): void {
    const catalog = this.selectedCatalog();
    const project = catalog?.projects.find((item) => item.id === projectId);
    if (catalog && project) {
      this.projectDialogContext.set({ catalog, project });
      if (project.ecosystem === 'flutter') void this.refreshFlutterDevices(catalog.workspace.id, project.id);
    }
  }

  async refreshFlutterDevices(
    workspaceId: string,
    projectId: string,
    loadAndroidFallback = false,
  ): Promise<void> {
    let shouldLoadAndroidFallback = false;
    this.flutterDevicesLoading.set(true);
    try {
      const result = await this.runner.listFlutterDevices(workspaceId, projectId);
      this.flutterDevices.set(result.devices);
      if (result.message) this.runner.notice.set(result.message);
      shouldLoadAndroidFallback = loadAndroidFallback && !result.devices.some(
        (device) => device.platform === 'android' && device.available,
      );
      if (!shouldLoadAndroidFallback) {
        this.androidEmulators.set([]);
        this.androidEmulatorMessage.set(null);
      }
    } catch (error) {
      this.runner.error.set(error instanceof Error ? error.message : 'Não foi possível consultar os devices Flutter.');
    } finally {
      this.flutterDevicesLoading.set(false);
    }
    if (shouldLoadAndroidFallback) {
      await this.refreshAndroidEmulators(workspaceId, projectId);
    }
  }

  async refreshAndroidEmulators(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    this.androidEmulatorsLoading.set(true);
    this.androidEmulatorMessage.set(null);
    try {
      const result = await this.runner.listAndroidEmulators(workspaceId, projectId);
      this.androidEmulators.set(result.emulators);
      this.androidEmulatorMessage.set(result.message ?? null);
    } catch (error) {
      this.androidEmulators.set([]);
      this.androidEmulatorMessage.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os Android Virtual Devices.',
      );
    } finally {
      this.androidEmulatorsLoading.set(false);
    }
  }

  betaTechnologyNames(catalog: WorkspaceCatalog): string {
    return catalog.betaEcosystems
      .map((item) => item.technology)
      .join(', ');
  }

  closeProjectSettings(): void {
    this.projectDialogContext.set(null);
  }

  async saveProjectSettings(change: ProjectSettingsChange): Promise<void> {
    const context = this.projectDialogContext();
    if (!context) return;
    await this.runner.updateProject(
      context.catalog.workspace.id,
      context.project.id,
      change.nodePolicy,
      change.defaultScript,
      change.libraryLinkScripts,
      change.startupOrder,
      change.executionPolicies,
      change.defaultCommandId,
      change.healthCheck,
      change.flutterTarget,
    );
    if (!this.runner.error()) this.closeProjectSettings();
  }

  inspectLogs(projectId?: string, workspaceId = this.currentWorkspaceId()): void {
    this.selectedLogProjectId.set(projectId);
    this.selectedLogWorkspaceId.set(workspaceId);
    this.selectSection('logs');
  }

  processAction(
    action: 'start' | 'stop' | 'restart',
    request: ProcessRequest,
  ): Promise<void> {
    if (action === 'start') {
      const catalog = this.runner.snapshot().workspaces.find(
        (item) => item.workspace.id === request.workspaceId,
      );
      const project = catalog?.projects.find(
        (item) => item.id === request.projectId,
      );
      if (catalog && project?.ecosystem === 'flutter') {
        const command = project.commands.find(
          (item) => item.id === request.commandId,
        );
        const flutterAction = command?.category;
        if (
          flutterAction === 'run' ||
          flutterAction === 'test' ||
          flutterAction === 'build'
        ) {
          this.androidEmulatorPollGeneration += 1;
          this.flutterDevices.set([]);
          this.androidEmulators.set([]);
          this.androidEmulatorMessage.set(null);
          this.androidEmulatorStarting.set(false);
          this.androidEmulatorBooting.set(false);
          this.flutterLaunchContext.set({
            catalog,
            project,
            action: flutterAction,
          });
          void this.refreshFlutterDevices(
            catalog.workspace.id,
            project.id,
            true,
          );
          return Promise.resolve();
        }
      }
      return this.runner.startProject(request);
    }
    if (action === 'stop') return this.runner.stopProject(request);
    return this.runner.restartProject(request);
  }

  async openNgrokDialog(projectId: string): Promise<void> {
    const catalog = this.selectedCatalog();
    const project = catalog?.projects.find((item) => item.id === projectId);
    if (!catalog || !project) return;
    this.runner.ngrokDomains.set([]);
    this.runner.ngrokDomainsMessage.set(null);
    this.ngrokDialogContext.set({
      catalog,
      project,
      targetId: project.id,
      targetName: project.displayName,
    });
    await this.runner.refreshNgrokStatus();
    if (this.runner.ngrokStatus().available) {
      await this.runner.refreshNgrokDomains();
    }
  }

  async openExternalNgrokDialog(serviceId: string): Promise<void> {
    const catalog = this.selectedCatalog();
    const service = catalog?.workspace.externalServices?.find(
      (item) => item.id === serviceId,
    );
    if (!catalog || !service) return;
    this.runner.ngrokDomains.set([]);
    this.runner.ngrokDomainsMessage.set(null);
    this.ngrokDialogContext.set({
      catalog,
      targetId: service.id,
      targetName: service.name,
    });
    await this.runner.refreshNgrokStatus();
    if (this.runner.ngrokStatus().available) {
      await this.runner.refreshNgrokDomains();
    }
  }

  closeNgrokDialog(): void {
    if (!this.runner.loading() && !this.ngrokCreating()) {
      this.ngrokDialogContext.set(null);
    }
  }

  async createNgrokDomain(input: {
    name: string;
    suffix: NgrokManagedDomainSuffix;
    description?: string;
  }): Promise<void> {
    if (this.ngrokCreating()) return;
    this.ngrokCreating.set(true);
    try {
      const domain = await this.runner.createNgrokDomain(
        input.name,
        input.suffix,
        input.description,
      );
      if (domain) {
        this.runner.notice.set(
          `Domínio ${domain.domain} criado. Se houver CNAME, configure o DNS antes de iniciar o túnel.`,
        );
      }
    } finally {
      this.ngrokCreating.set(false);
    }
  }

  async startNgrokTunnel(selection: NgrokTunnelSelection): Promise<void> {
    const context = this.ngrokDialogContext();
    if (!context) return;
    await this.runner.startNgrokTunnel({
      workspaceId: context.catalog.workspace.id,
      projectId: context.targetId,
      domainId: selection.domainId,
      domain: selection.domain,
    });
    if (!this.runner.error()) this.ngrokDialogContext.set(null);
  }

  async openExternalServiceDialog(): Promise<void> {
    const workspaceId = this.currentWorkspaceId();
    if (!workspaceId) return;
    this.runner.error.set(null);
    this.runner.externalServicesCatalog.set({
      candidates: [],
      docker: { available: false, message: 'Docker ainda não consultado.' },
      processMessage: null,
    });
    this.externalServiceDialogOpen.set(true);
    await this.runner.discoverExternalServices(workspaceId);
  }

  closeExternalServiceDialog(): void {
    if (!this.externalServiceSubmitting() && !this.runner.externalServicesLoading()) {
      this.externalServiceDialogOpen.set(false);
    }
  }

  async refreshExternalServices(): Promise<void> {
    const workspaceId = this.currentWorkspaceId();
    if (workspaceId) await this.runner.discoverExternalServices(workspaceId);
  }

  async chooseExternalLogFile(): Promise<void> {
    try {
      const result = await this.runner.chooseExternalLogFile();
      if (!result.canceled && result.filePath) {
        this.externalServiceDialog?.setLogFile(result.filePath);
      }
    } catch {
      this.runner.error.set('Não foi possível selecionar o arquivo de log.');
    }
  }

  async addExternalService(input: ExternalServiceCreateInput): Promise<void> {
    if (this.externalServiceSubmitting()) return;
    this.externalServiceSubmitting.set(true);
    try {
      await this.runner.addExternalService(input);
      if (!this.runner.error()) this.externalServiceDialogOpen.set(false);
    } finally {
      this.externalServiceSubmitting.set(false);
    }
  }

  externalAddress(service: ExternalServiceConfig): string {
    return `${service.scheme}://${service.host}:${service.port}`;
  }

  async stopNgrokTunnel(projectId: string): Promise<void> {
    const workspaceId = this.currentWorkspaceId();
    if (workspaceId) await this.runner.stopNgrokTunnel(workspaceId, projectId);
  }

  openNgrokTunnel(projectId: string): Promise<void> {
    const workspaceId = this.currentWorkspaceId();
    return workspaceId
      ? this.runner.openNgrokTunnel(workspaceId, projectId)
      : Promise.resolve();
  }

  openNgrokSettings(): void {
    this.ngrokDialogContext.set(null);
    this.selectSection('settings');
  }

  closeFlutterLaunch(): void {
    if (!this.runner.loading() && !this.androidEmulatorStarting()) {
      this.androidEmulatorPollGeneration += 1;
      this.androidEmulatorBooting.set(false);
      this.flutterLaunchContext.set(null);
    }
  }

  async startAndroidEmulator(emulatorId: string): Promise<void> {
    const context = this.flutterLaunchContext();
    if (!context || this.androidEmulatorStarting() || this.androidEmulatorBooting()) return;
    const generation = ++this.androidEmulatorPollGeneration;
    const existingDeviceIds = new Set(
      this.flutterDevices()
        .filter((device) => device.platform === 'android')
        .map((device) => device.id),
    );
    this.androidEmulatorStarting.set(true);
    this.androidEmulatorMessage.set(null);
    try {
      await this.runner.launchAndroidEmulator(
        context.catalog.workspace.id,
        context.project.id,
        emulatorId,
      );
    } catch (error) {
      this.androidEmulatorMessage.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o Android Emulator.',
      );
      return;
    } finally {
      this.androidEmulatorStarting.set(false);
    }
    if (generation !== this.androidEmulatorPollGeneration) return;
    this.androidEmulatorBooting.set(true);
    this.androidEmulatorMessage.set(
      'Aguardando o Android Emulator ficar disponível no Flutter…',
    );
    try {
      for (let attempt = 0; attempt < ANDROID_EMULATOR_POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await this.waitForAndroidEmulatorPoll();
        if (generation !== this.androidEmulatorPollGeneration) return;
        const result = await this.runner.listFlutterDevices(
          context.catalog.workspace.id,
          context.project.id,
        );
        if (generation !== this.androidEmulatorPollGeneration) return;
        this.flutterDevices.set(result.devices);
        const candidates = result.devices.filter(
          (device) =>
            device.platform === 'android' &&
            device.available &&
            device.emulator &&
            !existingDeviceIds.has(device.id),
        );
        if (candidates.length === 1) {
          const device = candidates[0];
          this.androidEmulatorBooting.set(false);
          this.androidEmulatorMessage.set(null);
          await this.launchFlutter({
            action: context.action,
            target: {
              platform: 'android',
              deviceId: device.id,
              deviceName: device.name,
            },
          });
          return;
        }
        if (candidates.length > 1) {
          this.androidEmulatorMessage.set(
            'Mais de um emulator Android ficou disponível. Selecione o dispositivo desejado.',
          );
          return;
        }
      }
      this.androidEmulatorMessage.set(
        'O Android Emulator não ficou disponível no Flutter dentro de 120 segundos.',
      );
    } catch (error) {
      this.androidEmulatorMessage.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o Android Emulator no Flutter.',
      );
    } finally {
      if (generation === this.androidEmulatorPollGeneration) {
        this.androidEmulatorBooting.set(false);
      }
    }
  }

  async launchFlutter(selection: FlutterLaunchSelection): Promise<void> {
    const context = this.flutterLaunchContext();
    if (!context) return;
    const targetId = selection.action === 'test'
      ? 'test'
      : selection.action === 'build'
        ? `build-${selection.target.platform}`
        : selection.target.platform;
    const command = context.project.commands.find(
      (item) => item.flutterTarget === targetId,
    );
    if (!command) {
      this.runner.error.set(
        `O comando Flutter ${selection.action} para ${selection.target.platform} não está disponível.`,
      );
      return;
    }
    await this.runner.startProject({
      workspaceId: context.catalog.workspace.id,
      projectId: context.project.id,
      commandId: command.id,
      flutterTarget: this.normalizedFlutterTarget(selection.target),
    });
    if (!this.runner.error()) this.flutterLaunchContext.set(null);
  }

  private normalizedFlutterTarget(
    target: FlutterProjectTarget,
  ): FlutterProjectTarget {
    return target.platform === 'web'
      ? { platform: 'web' }
      : target;
  }

  private waitForAndroidEmulatorPoll(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ANDROID_EMULATOR_POLL_INTERVAL_MS);
    });
  }

  linkLibraries(libraryId?: string, projectId?: string): void {
    const workspaceId = this.currentWorkspaceId();
    if (!workspaceId) return;
    void this.runner.linkLibraries({
      workspaceId,
      ...(libraryId ? { libraryIds: [libraryId] } : {}),
      ...(projectId ? { projectIds: [projectId] } : {}),
    });
  }

  async updateGlobalNodeMode(
    mode: Exclude<NodePolicyMode, 'inherit'>,
  ): Promise<void> {
    await this.runner.updateSettings({
      globalNodePolicy: {
        mode,
        ...(mode === 'explicit'
          ? { version: this.globalVersionDraft() || '24.15.0' }
          : {}),
      },
    });
  }

  async saveGlobalVersion(): Promise<void> {
    if (!this.globalVersionDraft().trim()) return;
    await this.runner.updateSettings({
      globalNodePolicy: {
        mode: 'explicit',
        version: this.globalVersionDraft().trim(),
      },
    });
  }

  globalExecutionPolicy(
    ecosystem: Ecosystem,
    component: PolicyComponent,
  ) {
    return this.runner.settings().executionPolicies[ecosystem]?.[component] ??
      { mode: 'auto' as const };
  }

  globalExecutionMode(
    ecosystem: Ecosystem,
    component: PolicyComponent,
  ): 'auto' | 'explicit' {
    const key = `${ecosystem}:${component}`;
    return this.pendingExplicitPolicies()[key]
      ? 'explicit'
      : this.globalExecutionPolicy(ecosystem, component).mode === 'explicit'
        ? 'explicit'
        : 'auto';
  }

  globalPolicyDraft(
    ecosystem: Ecosystem,
    component: PolicyComponent,
  ): string {
    return this.globalPolicyPathDrafts()[`${ecosystem}:${component}`] ?? '';
  }

  updateGlobalPolicyDraft(
    ecosystem: Ecosystem,
    component: PolicyComponent,
    value: string,
  ): void {
    this.globalPolicyPathDrafts.update((drafts) => ({
      ...drafts,
      [`${ecosystem}:${component}`]: value,
    }));
  }

  async updateGlobalExecutionMode(
    ecosystem: Ecosystem,
    component: PolicyComponent,
    value: string,
  ): Promise<void> {
    const mode = value as 'auto' | 'explicit';
    if (ecosystem === 'node' && component === 'runtime') {
      await this.updateGlobalNodeMode(mode);
      return;
    }
    const key = `${ecosystem}:${component}`;
    if (mode === 'explicit') {
      this.runner.error.set(null);
      this.pendingExplicitPolicies.update((policies) => ({
        ...policies,
        [key]: true,
      }));
      await this.runner.refreshRuntimeInstallations(ecosystem, component);
      return;
    }
    this.pendingExplicitPolicies.update((policies) => {
      const { [key]: _removed, ...remaining } = policies;
      return remaining;
    });
    const current = this.runner.settings().executionPolicies;
    await this.runner.updateSettings({
      executionPolicies: this.mergeExecutionPolicy(current, ecosystem, component, {
        mode,
      }),
    });
  }

  async saveGlobalExecutionPath(
    ecosystem: Ecosystem,
    component: PolicyComponent,
  ): Promise<void> {
    const path = this.globalPolicyDraft(ecosystem, component).trim();
    if (!path) return;
    await this.runner.updateSettings({
      executionPolicies: this.mergeExecutionPolicy(
        this.runner.settings().executionPolicies,
        ecosystem,
        component,
        { mode: 'explicit', path },
      ),
    }, 'Política de runtime atualizada.');
    if (!this.runner.error()) {
      const key = `${ecosystem}:${component}`;
      this.pendingExplicitPolicies.update((policies) => {
        const { [key]: _removed, ...remaining } = policies;
        return remaining;
      });
    }
  }

  selectRuntimeInstallation(
    ecosystem: Ecosystem,
    component: PolicyComponent,
    selectedPath: string,
  ): void {
    if (selectedPath) {
      this.updateGlobalPolicyDraft(ecosystem, component, selectedPath);
    }
  }

  async browseRuntimePath(
    ecosystem: Ecosystem,
    component: PolicyComponent,
  ): Promise<void> {
    const selectedPath = await this.runner.chooseRuntimePath(
      ecosystem,
      component,
      this.globalPolicyDraft(ecosystem, component) || undefined,
    );
    if (selectedPath) {
      this.updateGlobalPolicyDraft(ecosystem, component, selectedPath);
    }
  }

  runtimeInstallationLabel(
    ecosystem: Ecosystem,
    component: PolicyComponent,
  ): string {
    const count = this.runner.runtimeInstallationCatalog(
      ecosystem,
      component,
    ).installations.length;
    return count
      ? 'Selecionar uma instalação detectada'
      : 'Nenhuma instalação encontrada';
  }

  resolvedEcosystemSummary(ecosystem: Ecosystem): string {
    const projects = this.runner.workspaces()
      .flatMap((catalog) => catalog.projects)
      .filter((project) => project.ecosystem === ecosystem);
    if (!projects.length) return 'Nenhum projeto detectado neste ecossistema.';
    const versions = new Set(projects.flatMap((project) =>
      Object.values(project.runtime.components)
        .map((component) => component?.version)
        .filter((version): version is string => !!version)
    ));
    return versions.size
      ? `Detectado nos projetos: ${[...versions].join(', ')}.`
      : 'Projetos detectados; runtime ainda não resolvido.';
  }

  private mergeExecutionPolicy(
    policies: ExecutionPolicies,
    ecosystem: Ecosystem,
    component: PolicyComponent,
    value: { mode: 'auto' | 'explicit'; path?: string },
  ): ExecutionPolicies {
    return {
      ...policies,
      [ecosystem]: {
        ...(policies[ecosystem] ?? {}),
        [component]: value,
      },
    };
  }

  async updateExitBehavior(event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).value;
    await this.runner.updateSettings(
      { stopProcessesOnExit: value === 'stop' },
      value === 'stop'
        ? 'Ao fechar, o Runner encerrará todos os processos gerenciados.'
        : 'Os processos continuarão executando quando a interface for fechada.',
    );
  }

  async updateTheme(theme: AppTheme): Promise<void> {
    this.applyTheme(theme);
    await this.runner.updateSettings(
      { theme },
      'Tema atualizado.',
    );
    if (this.runner.error()) {
      this.applyTheme(this.runner.settings().theme);
    }
  }

  private applyTheme(theme: AppTheme): void {
    const root = this.document.documentElement;
    const body = this.document.body;
    const resolvedTheme = theme === 'system'
      ? (this.systemThemeQuery?.matches ? 'dark' : 'light')
      : theme;

    root.dataset['themePreference'] = theme;
    root.dataset['theme'] = resolvedTheme;
    root.style.colorScheme = resolvedTheme;

    body.dataset['themePreference'] = theme;
    body.dataset['theme'] = resolvedTheme;
    body.style.colorScheme = resolvedTheme;

    this.effectiveTheme.set(resolvedTheme);
  }

  isValidLogLimit(value: string): boolean {
    const logLimit = Number(value);
    return Number.isInteger(logLimit) && logLimit >= 200 && logLimit <= 10000;
  }

  async saveLogLimit(): Promise<void> {
    const value = this.logLimitDraft();
    if (!this.isValidLogLimit(value)) return;
    await this.runner.updateSettings(
      { logLimit: Number(value) },
      'Limite de logs atualizado.',
    );
  }

  async confirmDownloadUpdate(): Promise<void> {
    const update = this.runner.updateState();
    const confirmed = window.confirm(
      `Baixar a atualização ${update.availableVersion ?? ''} agora?\n\n` +
      'O aplicativo continuará aberto durante o download.',
    );
    if (confirmed) await this.runner.downloadUpdate();
  }

  async confirmInstallUpdate(): Promise<void> {
    if (this.installingUpdate()) return;
    const keepProcesses = !this.runner.settings().stopProcessesOnExit;
    const confirmed = window.confirm(
      'Reiniciar o MFE Runner e instalar a atualização agora?\n\n' +
      (keepProcesses
        ? 'Os projetos em execução serão mantidos pelo supervisor.'
        : 'Os projetos gerenciados serão encerrados antes da atualização.'),
    );
    if (!confirmed) return;

    this.installingUpdate.set(true);
    const installStarted = await this.runner.installUpdate();
    if (!installStarted) this.installingUpdate.set(false);
  }

  async selectIde(id: string): Promise<void> {
    const ide = this.runner.developerTools().ideApplications.find(
      (item) => item.id === id,
    );
    if (ide) {
      await this.runner.saveIde({
        id: ide.id,
        name: ide.name,
        executablePath: ide.executablePath,
      });
    }
  }

  async browseCustomIde(): Promise<void> {
    const current = this.runner.settings().ide;
    const executablePath = await this.runner.chooseIdeExecutable(
      current?.executablePath,
    );
    if (!executablePath) return;
    const name = executablePath.split(/[\\/]/).filter(Boolean).at(-1) ??
      'IDE personalizada';
    const preference: IdePreference = {
      id: 'custom',
      name,
      executablePath,
    };
    await this.runner.saveIde(preference);
  }

  async browseNgrokExecutable(): Promise<void> {
    const current = this.runner.settings().ngrok.executablePath ?? undefined;
    const executablePath = await this.runner.chooseNgrokExecutable(current);
    if (!executablePath) return;
    await this.runner.updateSettings(
      { ngrok: { executablePath } },
      'Executável do ngrok atualizado.',
    );
    await this.runner.refreshNgrokStatus();
  }

  async useAutomaticNgrokDetection(): Promise<void> {
    await this.runner.updateSettings(
      { ngrok: { executablePath: null } },
      'Detecção automática do ngrok restaurada.',
    );
    await this.runner.refreshNgrokStatus();
  }

  async testNgrokApi(): Promise<void> {
    const domains = await this.runner.refreshNgrokDomains();
    if (!this.runner.ngrokDomainsMessage()) {
      this.runner.notice.set(
        `Acesso à API do ngrok confirmado: ${domains.length} domínio(s).`,
      );
    }
  }

  async copyNgrokConfigCommand(command: NgrokConfigCommand): Promise<void> {
    this.clearNgrokCopyNoticeTimer();
    try {
      await this.runner.copyText(NGROK_CONFIG_COMMANDS[command]);
      this.copiedNgrokCommand.set(command);
      this.ngrokCopyNoticeTimer = setTimeout(() => {
        this.copiedNgrokCommand.set(null);
        this.ngrokCopyNoticeTimer = undefined;
      }, 2_500);
    } catch {
      this.copiedNgrokCommand.set(null);
      this.runner.error.set('Não foi possível copiar o comando do ngrok.');
    }
  }

  private clearNgrokCopyNoticeTimer(): void {
    if (this.ngrokCopyNoticeTimer) {
      clearTimeout(this.ngrokCopyNoticeTimer);
      this.ngrokCopyNoticeTimer = undefined;
    }
  }

  ngrokInstallCommand(): string {
    const platform = this.runner.snapshot().platform;
    if (platform === 'darwin') return 'brew install ngrok';
    if (platform === 'win32') return 'winget install ngrok -s msstore';
    return 'sudo snap install ngrok';
  }

  copyLocalAddress(port: number): Promise<void> {
    return this.runner.copyText(`http://127.0.0.1:${port}`);
  }

  workspaceRows(): string {
    const share = this.processAreaPercent();
    return `minmax(${AppComponent.MIN_PROCESS_AREA_PX}px, ${share}fr) ` +
      `${AppComponent.SPLITTER_HEIGHT_PX}px ` +
      `minmax(${AppComponent.MIN_LOG_AREA_PX}px, ${100 - share}fr)`;
  }

  startResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    const splitter = event.currentTarget as HTMLElement;
    this.workspaceBounds = splitter.parentElement?.getBoundingClientRect() ?? null;
    if (!this.workspaceBounds) return;
    splitter.setPointerCapture(event.pointerId);
    this.resizing.set(true);
    this.updateSplit(event.clientY);
    event.preventDefault();
  }

  continueResize(event: PointerEvent): void {
    if (this.resizing()) this.updateSplit(event.clientY);
  }

  finishResize(event: PointerEvent): void {
    if (!this.resizing()) return;
    const splitter = event.currentTarget as HTMLElement;
    if (splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
    this.resizing.set(false);
    this.workspaceBounds = null;
    this.persistSplitPreference();
  }

  resizeWithKeyboard(event: KeyboardEvent): void {
    const delta = event.shiftKey ? 5 : 2;
    let next: number | null = null;
    if (event.key === 'ArrowUp') next = this.processAreaPercent() - delta;
    if (event.key === 'ArrowDown') next = this.processAreaPercent() + delta;
    if (event.key === 'Home') next = 30;
    if (event.key === 'End') next = 80;
    if (next === null) return;
    this.processAreaPercent.set(this.clampSplit(next));
    this.persistSplitPreference();
    event.preventDefault();
  }

  resetSplit(): void {
    this.processAreaPercent.set(AppComponent.DEFAULT_SPLIT);
    this.persistSplitPreference();
  }

  sectionTitle(): string {
    return this.navigation.find((item) => item.id === this.section())?.label ??
      'MFE Runner';
  }

  currentWorkspaceId(): string | undefined {
    return this.selectedCatalog()?.workspace.id;
  }

  private workspaceInput(
    workspace: WorkspaceConfig,
    changes: Partial<WorkspaceInput> = {},
  ): WorkspaceInput {
    return {
      name: workspace.name,
      projectSources: workspace.projectSources.map((source) => ({
        id: source.id,
        rootPath: source.rootPath,
        projects: source.projects,
      })),
      environment: workspace.environment,
      nodePolicy: workspace.nodePolicy,
      executionPolicies: workspace.executionPolicies,
      ...changes,
    };
  }

  private activateWorkspace(workspaceId: string): void {
    this.selectedWorkspaceId.set(workspaceId);
    try {
      localStorage.setItem(AppComponent.WORKSPACE_STORAGE_KEY, workspaceId);
    } catch {
      // A preferência de workspace é opcional.
    }
  }

  private readWorkspacePreference(): string | null {
    try {
      return localStorage.getItem(AppComponent.WORKSPACE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private updateSplit(clientY: number): void {
    const bounds = this.workspaceBounds;
    if (!bounds) return;
    const available = bounds.height - AppComponent.SPLITTER_HEIGHT_PX;
    const minimum = Math.min(AppComponent.MIN_PROCESS_AREA_PX, available / 2);
    const maximum = Math.max(
      minimum,
      available - Math.min(AppComponent.MIN_LOG_AREA_PX, available / 2),
    );
    const height = Math.min(maximum, Math.max(minimum, clientY - bounds.top));
    this.processAreaPercent.set(this.clampSplit((height / available) * 100));
  }

  private clampSplit(value: number): number {
    return Math.round(Math.min(80, Math.max(30, value)));
  }

  private readSplitPreference(): number {
    try {
      const value = Number.parseFloat(
        localStorage.getItem(AppComponent.SPLIT_STORAGE_KEY) ?? '',
      );
      return Number.isFinite(value)
        ? this.clampSplit(value)
        : AppComponent.DEFAULT_SPLIT;
    } catch {
      return AppComponent.DEFAULT_SPLIT;
    }
  }

  private persistSplitPreference(): void {
    try {
      localStorage.setItem(
        AppComponent.SPLIT_STORAGE_KEY,
        String(this.processAreaPercent()),
      );
    } catch {
      // A preferência visual é opcional.
    }
  }
}
