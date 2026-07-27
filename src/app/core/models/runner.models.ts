export type NodePolicyMode = 'inherit' | 'auto' | 'explicit';
export type RunnerEnvironment = 'local' | 'des' | 'hom' | 'prod';
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

export interface NodeVersionCatalog {
  detected: boolean;
  manager: 'nvm-sh' | 'nvm-windows' | null;
  versions: string[];
  message: string;
}

export interface RunnerSettings {
  globalNodePolicy: NodePolicy;
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
  defaultScript?: string;
  libraryLinkScripts?: Record<string, string>;
}

export interface WorkspaceMfeRoot {
  id: string;
  rootPath: string;
}

export interface WorkspaceLibraryInput {
  rootPath: string;
  developmentScript: string;
  artifactRelativePath: string;
  preferredLinkScript: string;
}

export interface WorkspaceLibraryConfig extends WorkspaceLibraryInput {
  id: string;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  shellRootPath: string;
  mfeRoots: WorkspaceMfeRoot[];
  libraries: WorkspaceLibraryConfig[];
  environment: RunnerEnvironment;
  nodePolicy: NodePolicy;
  projectOverrides: Record<string, ProjectOverride>;
  excludedProjectIds: string[];
}

export interface RunnerConfig {
  version: 4;
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
  scripts: Record<string, string>;
  scriptNames: string[];
  defaultScript: string | null;
  port: number | null;
  federation: FederationInfo | null;
  packageEngines: Record<string, string>;
  registrations: ManifestRegistration[];
  node: NodeRuntime;
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
  shellRootPath: string;
  mfeRootPaths: string[];
  libraries: WorkspaceLibraryInput[];
  environment: RunnerEnvironment;
  nodePolicy: NodePolicy;
}

export interface ProcessRequest {
  workspaceId: string;
  projectId: string;
  script?: string;
}

export interface LibraryInspection {
  rootPath: string;
  packageName: string;
  angularProject: string;
  scripts: string[];
  developmentScript: string;
  artifactRelativePath: string;
  preferredLinkScript: string;
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
  chooseShellDirectory(input?: {
    initialPath?: string;
  }): Promise<string | null>;
  chooseMfeDirectory(input?: {
    initialPath?: string;
  }): Promise<string | null>;
  chooseLibraryDirectory(input?: {
    initialPath?: string;
  }): Promise<string | null>;
  inspectLibraryDirectory(input: {
    rootPath: string;
  }): Promise<LibraryInspection>;
  addWorkspace(input: WorkspaceInput): Promise<RunnerSnapshot>;
  updateWorkspace(
    input: WorkspaceInput & { workspaceId: string },
  ): Promise<RunnerSnapshot>;
  removeWorkspace(input: { workspaceId: string }): Promise<RunnerSnapshot>;
  refreshWorkspace(input: { workspaceId: string }): Promise<RunnerSnapshot>;
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
    defaultScript?: string;
    libraryLinkScripts?: Record<string, string>;
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
