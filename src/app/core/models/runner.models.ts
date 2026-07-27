export type NodePolicyMode = 'inherit' | 'auto' | 'explicit';
export type ExecutionPolicyMode = NodePolicyMode;
export type Ecosystem =
  | 'node'
  | 'java-maven'
  | 'java-gradle'
  | 'dotnet'
  | 'python'
  | 'rust'
  | 'go';
export type SupportLevel = 'stable' | 'beta';
export type CompatibilityStatus =
  | 'ready'
  | 'warning'
  | 'incompatible'
  | 'unavailable'
  | 'unknown';
export type RunnerEnvironment = 'local' | 'des' | 'hom' | 'prod';
export type AppTheme = 'system' | 'light' | 'dark';
export type ProjectKind = 'project' | 'library';
export type ProjectSourceType = 'project' | 'root' | 'monorepo';
export type ProjectCapability = 'angular' | 'host' | 'mfe';
export type ProjectRole =
  | 'library'
  | 'mfe'
  | 'shell'
  | 'application'
  | 'template';
export type ProcessStatus =
  | 'stopped'
  | 'starting'
  | 'linking'
  | 'running'
  | 'healthy'
  | 'degraded'
  | 'stopping'
  | 'failed'
  | 'conflict';

export interface NodePolicy {
  mode: NodePolicyMode;
  version?: string;
}

export interface SelectionPolicy {
  mode: ExecutionPolicyMode;
  version?: string;
  path?: string;
}

export type ExecutionPolicies = Partial<Record<
  Ecosystem,
  Partial<Record<'runtime' | 'tool' | 'packageManager', SelectionPolicy>>
>>;

export interface RuntimeComponent {
  available: boolean;
  path: string | null;
  version: string | null;
  source: string;
  home?: string | null;
  id?: string;
  reason?: string;
  rawVersion?: string | null;
}

export interface RuntimeResolution {
  ecosystem: Ecosystem;
  supportLevel: SupportLevel;
  available: boolean;
  compatibility: CompatibilityStatus;
  reason: string | null;
  requirements: Record<string, unknown>;
  components: {
    runtime?: RuntimeComponent;
    tool?: RuntimeComponent;
    packageManager?: RuntimeComponent;
  };
  environment?: Record<string, string>;
}

export interface CommandProfile {
  id: string;
  label: string;
  category: 'run' | 'build' | 'test' | 'link' | 'other';
  longRunning: boolean;
  task: string;
  args: string[];
}

export interface NodeVersionCatalog {
  detected: boolean;
  manager: 'nvm-sh' | 'nvm-windows' | null;
  versions: string[];
  message: string;
}

export interface RuntimeInstallation {
  id: string;
  label: string;
  version: string | null;
  rawVersion: string | null;
  path: string;
  source: string;
}

export interface RuntimeInstallationCatalog {
  ecosystem: Ecosystem;
  component: 'runtime' | 'tool' | 'packageManager';
  installations: RuntimeInstallation[];
}

export interface RunnerSettings {
  globalNodePolicy: NodePolicy;
  executionPolicies: ExecutionPolicies;
  theme: AppTheme;
  stopProcessesOnExit: boolean;
  logLimit: number;
  ide: IdePreference | null;
}

export interface IdePreference {
  id: string;
  name: string;
  executablePath: string;
}

export interface DeveloperApplication extends IdePreference {
  custom: boolean;
}

export interface DeveloperToolCatalog {
  ideApplications: DeveloperApplication[];
  selectedIdeId: string | null;
  terminal: {
    id: string | null;
    name: string;
    available: boolean;
  };
}

export interface ProjectOverride {
  nodePolicy?: NodePolicy;
  executionPolicies?: ExecutionPolicies;
  defaultCommandId?: string;
  defaultScript?: string;
  libraryLinkScripts?: Record<string, string>;
  startupOrder?: number;
  healthCheck?: ProjectHealthCheck;
}

export interface ProjectHealthCheck {
  type: 'none' | 'process' | 'tcp' | 'http';
  port?: number;
  path?: string;
}

export interface LocalLibraryLinkConfig {
  enabled: boolean;
  packageName: string;
  developmentScript: string;
  artifactRelativePath: string;
  preferredLinkScript: string;
}

export interface ProjectSourceProjectConfig {
  relativePath: string;
  kind: ProjectKind;
  kindSource: 'detected' | 'user';
  localLibraryLink?: LocalLibraryLinkConfig;
}

export interface ProjectSourceConfig {
  id: string;
  rootPath: string;
  rootProjectId: string;
  projects: ProjectSourceProjectConfig[];
}

export interface ProjectSourceProjectInput {
  relativePath: string;
  kind: ProjectKind;
  kindSource: 'detected' | 'user';
  localLibraryLink?: LocalLibraryLinkConfig;
}

export interface ProjectSourceInput {
  id?: string;
  rootPath: string;
  projects: ProjectSourceProjectInput[];
}

export interface DetectedProjectCandidate {
  name: string;
  relativePath: string;
  technology: string;
  ecosystem: Ecosystem;
  supportLevel: SupportLevel;
  commands: CommandProfile[];
  defaultCommandId: string | null;
  runtimeRequirements: Record<string, unknown>;
  suggestedKind: ProjectKind | null;
  evidence: string[];
  capabilities: ProjectCapability[];
  scripts: string[];
  localLinkSuggestion: Omit<LocalLibraryLinkConfig, 'enabled'> | null;
  status?: 'existing' | 'new';
  configuredKind?: ProjectKind;
  kindSource?: 'detected' | 'user';
  localLibraryLink?: LocalLibraryLinkConfig;
}

export interface ProjectSourceInspection {
  rootPath: string;
  sourceType: ProjectSourceType;
  projects: DetectedProjectCandidate[];
  warnings: string[];
}

export interface ProjectSourceInspectionProgress {
  requestId: string;
  phase: 'preparing' | 'scanning' | 'analyzing' | 'complete';
  percent: number;
  directoriesScanned: number;
  projectsFound: number;
  processedProjects?: number;
  totalProjects?: number;
  currentPath: string;
}

export interface WorkspaceReview {
  workspaceId: string;
  sources: Array<ProjectSourceInspection & {
    sourceId: string;
    status: 'existing' | 'new';
  }>;
  missingProjects: Array<{
    projectId: string;
    name: string;
    relativePath: string;
  }>;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  projectSources: ProjectSourceConfig[];
  environment: RunnerEnvironment;
  nodePolicy: NodePolicy;
  executionPolicies: ExecutionPolicies;
  projectOverrides: Record<string, ProjectOverride>;
  projectOrder?: string[];
  excludedProjectIds: string[];
}

export interface RunnerConfig {
  version: 6;
  settings: RunnerSettings;
  workspaces: WorkspaceConfig[];
}

export interface NodeRuntime {
  available: boolean;
  version: string | null;
  source: 'explicit' | 'nvmrc' | 'path';
  sourcePath?: string;
  reason?: string;
}

export interface FederationInfo {
  name: string | null;
  exposes: string[];
}

export interface ManifestRegistration {
  tenantId: string;
  tenantName: string;
  remoteId: string;
  remoteName?: string;
  routePath?: string;
  type: string;
  enabled: boolean;
  localPort: number | null;
}

export interface DiscoveredProject {
  id: string;
  name: string;
  displayName: string;
  relativePath: string;
  absolutePath: string;
  role: ProjectRole;
  ecosystem: Ecosystem;
  technology: string;
  supportLevel: SupportLevel;
  kind: ProjectKind;
  kindSource: 'detected' | 'user';
  capabilities: ProjectCapability[];
  sourceId: string;
  startupOrder: number;
  scripts: Record<string, string>;
  scriptNames: string[];
  defaultScript: string | null;
  commands: CommandProfile[];
  commandIds: string[];
  defaultCommandId: string | null;
  port: number | null;
  healthCheck: ProjectHealthCheck | null;
  federation: FederationInfo | null;
  packageEngines: Record<string, string>;
  registrations: ManifestRegistration[];
  node: NodeRuntime;
  runtime: RuntimeResolution;
  runtimeRequirements: Record<string, unknown>;
  git: GitContext;
  library?: LibraryMetadata;
  libraryLinks: LibraryLinkStatus[];
  warnings: string[];
  orphaned?: boolean;
}

export interface LibraryMetadata {
  libraryId: string;
  packageName: string;
  artifactPath: string;
  artifactRelativePath: string;
  artifactAvailable: boolean;
  developmentScript: string;
  preferredLinkScript: string;
}

export type LibraryLinkState =
  | 'linked'
  | 'not-linked'
  | 'stale'
  | 'unavailable';

export interface LibraryLinkStatus {
  libraryId: string;
  libraryName: string;
  packageName: string;
  state: LibraryLinkState;
  script: string | null;
  message: string;
}

export interface GitContext {
  available: boolean;
  repository: boolean;
  branch: string | null;
  detached: boolean;
  commit: string | null;
  dirty: boolean;
  changedFiles: number;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  compatibleWithShell: boolean | null;
  message: string;
}

export interface ManifestSummary {
  tenantId: string;
  tenantName: string;
  remoteCount: number;
}

export interface WorkspaceCatalog {
  workspace: WorkspaceConfig;
  projects: DiscoveredProject[];
  manifests: ManifestSummary[];
  warnings: string[];
  betaEcosystems: Array<{
    ecosystem: Ecosystem;
    technology: string;
  }>;
  discoveredAt: string | null;
  gitUpdatedAt: string | null;
}

export type LogLevel = 'info' | 'warning' | 'error';
export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error';

export interface UpdateState {
  supported: boolean;
  userInitiated: boolean;
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  checkedAt: string | null;
  message: string;
}

export interface LogEntry {
  id: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  stream: 'stdout' | 'stderr' | 'system';
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface ManagedProcess {
  key: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  script: string;
  commandId?: string;
  status: ProcessStatus;
  pid: number | null;
  port: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  message: string;
  logs: LogEntry[];
}

export interface SystemInfo {
  platform: string;
  platformName: string;
  operatingSystem: {
    type: string;
    release: string;
    version: string;
    architecture: string;
  };
  hardware: {
    cpuModel: string;
    logicalCores: number;
    totalMemoryBytes: number;
  };
  runtime: {
    app: string;
    node: string;
    electron: string | null;
    chrome: string | null;
    v8: string;
  };
}

export interface RunnerSnapshot {
  config: RunnerConfig;
  workspaces: WorkspaceCatalog[];
  processes: ManagedProcess[];
  platform: string;
  systemInfo: SystemInfo;
  supervisorConnected: boolean;
}

export interface WorkspaceInput {
  name: string;
  projectSources: ProjectSourceInput[];
  environment: RunnerEnvironment;
  nodePolicy: NodePolicy;
  executionPolicies: ExecutionPolicies;
}

export interface ProcessRequest {
  workspaceId: string;
  projectId: string;
  script?: string;
  commandId?: string;
}

export interface LibraryLinkRequest {
  workspaceId: string;
  libraryIds?: string[];
  projectIds?: string[];
}

export interface LibraryLinkItemResult {
  libraryId: string;
  projectId: string;
  status: 'linked' | 'skipped' | 'failed';
  message: string;
}

export interface LibraryLinkResult {
  snapshot: RunnerSnapshot;
  results: LibraryLinkItemResult[];
}

export interface DiagnosticExportRequest {
  workspaceId: string;
  entryIds?: string[];
  includeAbsolutePaths: boolean;
}

export interface DiagnosticExportResult {
  canceled: boolean;
  filePath: string | null;
}

export interface RunnerBridge {
  getSnapshot(): Promise<RunnerSnapshot>;
  listNodeVersions(): Promise<NodeVersionCatalog>;
  listRuntimeInstallations(input: {
    ecosystem: Ecosystem;
    component: 'runtime' | 'tool' | 'packageManager';
  }): Promise<RuntimeInstallationCatalog>;
  chooseRuntimePath(input: {
    ecosystem: Ecosystem;
    component: 'runtime' | 'tool' | 'packageManager';
    initialPath?: string;
  }): Promise<string | null>;
  openRuntimeDownload(input: {
    ecosystem: Ecosystem;
    component: 'runtime' | 'tool' | 'packageManager';
  }): Promise<void>;
  chooseProjectDirectory(input?: {
    initialPath?: string;
  }): Promise<string | null>;
  inspectProjectSource(input: {
    rootPath: string;
    requestId: string;
  }): Promise<ProjectSourceInspection>;
  onProjectSourceInspectionProgress(
    callback: (progress: ProjectSourceInspectionProgress) => void,
  ): () => void;
  reviewWorkspace(input: { workspaceId: string }): Promise<WorkspaceReview>;
  addWorkspace(input: WorkspaceInput): Promise<RunnerSnapshot>;
  updateWorkspace(
    input: WorkspaceInput & { workspaceId: string },
  ): Promise<RunnerSnapshot>;
  removeWorkspace(input: { workspaceId: string }): Promise<RunnerSnapshot>;
  startWorkspace(input: {
    workspaceId: string;
  }): Promise<{ snapshot: RunnerSnapshot; failures: unknown[] }>;
  stopWorkspace(input: { workspaceId: string }): Promise<RunnerSnapshot>;
  restartWorkspace(input: {
    workspaceId: string;
  }): Promise<{ snapshot: RunnerSnapshot; failures: unknown[] }>;
  linkLibraries(input: LibraryLinkRequest): Promise<LibraryLinkResult>;
  openLocalAddress(input: { port: number }): Promise<void>;
  copyText(input: { text: string }): Promise<void>;
  listDeveloperTools(): Promise<DeveloperToolCatalog>;
  chooseIdeExecutable(input?: {
    initialPath?: string;
  }): Promise<string | null>;
  openProjectInIde(input: {
    workspaceId: string;
    projectId: string;
  }): Promise<void>;
  openProjectFolder(input: {
    workspaceId: string;
    projectId: string;
  }): Promise<void>;
  openProjectTerminal(input: {
    workspaceId: string;
    projectId: string;
  }): Promise<void>;
  refreshWorkspaceGit(input: {
    workspaceId: string;
  }): Promise<RunnerSnapshot>;
  exportDiagnostics(
    input: DiagnosticExportRequest,
  ): Promise<DiagnosticExportResult>;
  updateSettings(input: Partial<RunnerSettings>): Promise<RunnerSnapshot>;
  updateProject(input: {
    workspaceId: string;
    projectId: string;
    nodePolicy?: NodePolicy;
    executionPolicies?: ExecutionPolicies;
    defaultCommandId?: string;
    defaultScript?: string;
    libraryLinkScripts?: Record<string, string>;
    startupOrder?: number;
    healthCheck?: ProjectHealthCheck;
  }): Promise<RunnerSnapshot>;
  updateProjectOrder(input: {
    workspaceId: string;
    projectIds: string[];
  }): Promise<RunnerSnapshot>;
  excludeProject(input: {
    workspaceId: string;
    projectId: string;
  }): Promise<RunnerSnapshot>;
  startProject(input: ProcessRequest): Promise<RunnerSnapshot>;
  stopProject(input: ProcessRequest): Promise<RunnerSnapshot>;
  restartProject(input: ProcessRequest): Promise<RunnerSnapshot>;
  terminateExternalProcess(input: {
    workspaceId: string;
    projectId: string;
  }): Promise<RunnerSnapshot>;
  clearLogs(input: {
    workspaceId?: string;
    projectId?: string;
  }): Promise<RunnerSnapshot>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<UpdateState>;
  onSnapshot(listener: (snapshot: RunnerSnapshot) => void): () => void;
  onLog(listener: (entry: LogEntry) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
}
