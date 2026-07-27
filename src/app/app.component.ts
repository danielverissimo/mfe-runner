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
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DiscoveredProject,
  IdePreference,
  NodePolicyMode,
  ProcessStatus,
  ProcessRequest,
  RunnerEnvironment,
  WorkspaceCatalog,
  WorkspaceConfig,
  WorkspaceInput,
} from './core/models/runner.models';
import { RunnerApiService } from './core/services/runner-api.service';
import { LogPanelComponent } from './shared/log-panel/log-panel.component';
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
import { I18nRootDirective } from './core/i18n/i18n-root.directive';
import {
  AppLanguage,
  I18nService,
} from './core/i18n/i18n.service';

type Section = 'projects' | 'workspaces' | 'logs' | 'settings';

interface ProjectDialogContext {
  catalog: WorkspaceCatalog;
  project: DiscoveredProject;
}

type ProjectVisibility = 'all' | 'running';

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
    LogPanelComponent,
    NodeVersionPickerComponent,
    ProcessTableComponent,
    ProjectSettingsDialogComponent,
    RunnerIconComponent,
    SystemInfoDialogComponent,
    WorkspaceDialogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private static readonly SPLIT_STORAGE_KEY =
    'mfe-runner.projects.process-area-percent';
  private static readonly DEFAULT_SPLIT = 68;
  private static readonly MIN_PROCESS_AREA_PX = 180;
  private static readonly MIN_LOG_AREA_PX = 150;
  private static readonly SPLITTER_HEIGHT_PX = 12;

  readonly runner = inject(RunnerApiService);
  readonly i18n = inject(I18nService);
  readonly section = signal<Section>('projects');
  readonly sectionBeforeLogs = signal<Section>('projects');
  readonly selectedWorkspaceId = signal<string | null>(null);
  readonly selectedLogProjectId = signal<string | undefined>(undefined);
  readonly selectedLogWorkspaceId = signal<string | undefined>(undefined);
  readonly workspaceDialogOpen = signal(false);
  readonly workspaceDialogTarget = signal<WorkspaceConfig | null>(null);
  readonly projectDialogContext = signal<ProjectDialogContext | null>(null);
  readonly systemInfoDialogOpen = signal(false);
  readonly projectVisibility = signal<ProjectVisibility>('all');
  readonly projectNameFilter = signal('');
  readonly globalVersionDraft = signal('');
  readonly logLimitDraft = signal('');
  readonly processAreaPercent = signal(this.readSplitPreference());
  readonly resizing = signal(false);
  readonly updateNoticeDismissed = signal(false);
  @ViewChild(WorkspaceDialogComponent)
  private workspaceDialog?: WorkspaceDialogComponent;
  private workspaceBounds: DOMRect | null = null;
  private updateNoticeTimer?: ReturnType<typeof setTimeout>;
  private syncedLogLimit?: number;

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

  readonly projectEmptyMessage = computed(() => {
    if (normalizeProjectSearch(this.projectNameFilter())) {
      return this.projectVisibility() === 'running'
        ? 'Nenhum projeto em execução corresponde à busca.'
        : 'Nenhum projeto corresponde à busca.';
    }
    return this.projectVisibility() === 'running'
      ? 'Nenhum projeto está em execução.'
      : 'Nenhum projeto Angular executável foi descoberto nestes paths.';
  });

  readonly workspaceMetrics = computed(() => {
    const catalog = this.selectedCatalog();
    if (!catalog) {
      return { projects: 0, running: 0, attention: 0, manifests: 0 };
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
        this.selectedWorkspaceId.set(workspaces[0].workspace.id);
      }
      if (!workspaces.length) this.selectedWorkspaceId.set(null);
      const globalPolicy = this.runner.settings().globalNodePolicy;
      if (globalPolicy.version && !this.globalVersionDraft()) {
        this.globalVersionDraft.set(globalPolicy.version);
      }
      const logLimit = this.runner.settings().logLimit;
      if (
        this.syncedLogLimit === undefined ||
        this.logLimitDraft() === String(this.syncedLogLimit)
      ) {
        this.logLimitDraft.set(String(logLimit));
      }
      this.syncedLogLimit = logLimit;
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
    await this.runner.initialize();
  }

  ngOnDestroy(): void {
    this.clearUpdateNoticeTimer();
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
    if (section === 'projects' && previous !== 'projects') {
      const workspaceId = this.currentWorkspaceId();
      if (workspaceId) void this.runner.refreshWorkspaceGit(workspaceId);
    }
  }

  backFromLogs(): void {
    const destination = this.sectionBeforeLogs();
    this.section.set(destination === 'logs' ? 'projects' : destination);
  }

  selectWorkspace(event: Event): void {
    this.selectedWorkspaceId.set((event.target as HTMLSelectElement).value);
    this.selectedLogProjectId.set(undefined);
    this.selectedLogWorkspaceId.set(undefined);
  }

  changeLanguage(language: AppLanguage): void {
    this.i18n.setLanguage(language);
  }

  openWorkspaceDialog(workspace: WorkspaceConfig | null = null): void {
    this.workspaceDialogTarget.set(workspace);
    this.workspaceDialogOpen.set(true);
  }

  closeWorkspaceDialog(): void {
    this.workspaceDialogOpen.set(false);
    this.workspaceDialogTarget.set(null);
  }

  async browseShell(initialPath: string): Promise<void> {
    const path = await this.runner.chooseShellDirectory(initialPath);
    if (path) this.workspaceDialog?.setShellPath(path);
  }

  async browseMfe(
    request: { index: number; initialPath: string },
  ): Promise<void> {
    const path = await this.runner.chooseMfeDirectory(request.initialPath);
    if (path) this.workspaceDialog?.setMfePath(request.index, path);
  }

  async browseLibrary(
    request: { index: number; initialPath: string },
  ): Promise<void> {
    const selectedPath = await this.runner.chooseLibraryDirectory(
      request.initialPath,
    );
    if (!selectedPath) return;
    try {
      const inspection = await this.runner.inspectLibraryDirectory(
        selectedPath,
      );
      this.workspaceDialog?.setLibraryInspection(request.index, inspection);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível analisar a biblioteca.',
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
        (catalog) => catalog.workspace.shellRootPath === input.shellRootPath,
      );
      if (created) this.selectedWorkspaceId.set(created.workspace.id);
      this.section.set('projects');
    }
  }

  async removeWorkspace(catalog: WorkspaceCatalog): Promise<void> {
    const confirmed = window.confirm(
      `Remover a workspace "${catalog.workspace.name}" do Runner?\n\n` +
      'Os processos serão parados. Nenhum arquivo será apagado.',
    );
    if (!confirmed) return;
    await this.runner.removeWorkspace(catalog.workspace.id);
  }

  openProjects(catalog: WorkspaceCatalog): void {
    this.selectedWorkspaceId.set(catalog.workspace.id);
    this.section.set('projects');
  }

  async updateEnvironment(
    catalog: WorkspaceCatalog,
    event: Event,
  ): Promise<void> {
    const environment = (event.target as HTMLSelectElement)
      .value as RunnerEnvironment;
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
    if (!project || project.role !== 'mfe') return;
    const confirmed = window.confirm(
      `Ocultar "${project.displayName}" do MFE Runner?\n\n` +
      'O processo será parado e nenhum arquivo será apagado. ' +
      'O projeto poderá ser adicionado novamente ao redescobrir a workspace.',
    );
    if (confirmed) {
      await this.runner.excludeProject(catalog.workspace.id, project.id);
    }
  }

  openProjectSettings(projectId: string): void {
    const catalog = this.selectedCatalog();
    const project = catalog?.projects.find((item) => item.id === projectId);
    if (catalog && project) this.projectDialogContext.set({ catalog, project });
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
    if (action === 'start') return this.runner.startProject(request);
    if (action === 'stop') return this.runner.stopProject(request);
    return this.runner.restartProject(request);
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

  async updateGlobalNodeMode(event: Event): Promise<void> {
    const mode = (event.target as HTMLSelectElement).value as
      Exclude<NodePolicyMode, 'inherit'>;
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

  async updateExitBehavior(event: Event): Promise<void> {
    const value = (event.target as HTMLInputElement).value;
    await this.runner.updateSettings(
      { stopProcessesOnExit: value === 'stop' },
      value === 'stop'
        ? 'Ao fechar, o Runner encerrará todos os processos gerenciados.'
        : 'Os processos continuarão executando quando a interface for fechada.',
    );
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
    const keepProcesses = !this.runner.settings().stopProcessesOnExit;
    const confirmed = window.confirm(
      'Reiniciar o MFE Runner e instalar a atualização agora?\n\n' +
      (keepProcesses
        ? 'Os projetos em execução serão mantidos pelo supervisor.'
        : 'Os projetos gerenciados serão encerrados antes da atualização.'),
    );
    if (confirmed) await this.runner.installUpdate();
  }

  async selectIde(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
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
      shellRootPath: workspace.shellRootPath,
      mfeRootPaths: workspace.mfeRoots.map((root) => root.rootPath),
      libraries: workspace.libraries.map((library) => ({
        rootPath: library.rootPath,
        developmentScript: library.developmentScript,
        artifactRelativePath: library.artifactRelativePath,
        preferredLinkScript: library.preferredLinkScript,
      })),
      environment: workspace.environment,
      nodePolicy: workspace.nodePolicy,
      ...changes,
    };
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
