import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  inject,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Ecosystem,
  ExecutionPolicies,
  ExecutionPolicyMode,
  LocalLibraryLinkConfig,
  NodePolicyMode,
  NodeVersionCatalog,
  ProjectKind,
  ProjectSourceInspection,
  ProjectSourceInspectionProgress,
  RunnerEnvironment,
  WorkspaceConfig,
  WorkspaceInput,
} from '../../core/models/runner.models';
import { NodeVersionPickerComponent } from '../node-version-picker/node-version-picker.component';

interface EditableProject {
  name: string;
  relativePath: string;
  technology: string;
  ecosystem: Ecosystem;
  supportLevel: 'stable' | 'beta';
  evidence: string[];
  capabilities: string[];
  scripts: string[];
  kind: ProjectKind | '';
  kindSource: 'detected' | 'user';
  status: 'existing' | 'new';
  linkEnabled: boolean;
  localLink: Omit<LocalLibraryLinkConfig, 'enabled'> | null;
}

interface EditableSource {
  id?: string;
  rootPath: string;
  sourceType: ProjectSourceInspection['sourceType'];
  projects: EditableProject[];
  warnings: string[];
  loading: boolean;
  progress: ProjectSourceInspectionProgress | null;
  error: string;
}

@Component({
  selector: 'app-workspace-dialog',
  standalone: true,
  imports: [FormsModule, NodeVersionPickerComponent],
  templateUrl: './workspace-dialog.component.html',
  styleUrl: './workspace-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceDialogComponent implements OnChanges {
  private readonly changeDetector = inject(ChangeDetectorRef);

  @Input() open = false;
  @Input() workspace: WorkspaceConfig | null = null;
  @Input() reviewMode = false;
  @Input({ required: true }) nodeVersions!: NodeVersionCatalog;
  @Input() nodeVersionsLoading = false;
  @Output() dismiss = new EventEmitter<void>();
  @Output() addPath = new EventEmitter<void>();
  @Output() saveWorkspace = new EventEmitter<WorkspaceInput>();
  @Output() refreshNodeVersions = new EventEmitter<void>();

  name = '';
  sources: EditableSource[] = [];
  environment: RunnerEnvironment = 'local';
  nodeMode: NodePolicyMode = 'inherit';
  nodeVersion = '';
  executionPolicies: ExecutionPolicies = {};
  missingProjects: Array<{
    projectId: string;
    name: string;
    relativePath: string;
  }> = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue && !changes['open']?.previousValue) {
      this.resetFromWorkspace();
    }
  }

  beginInspection(rootPath: string, id?: string): number {
    const index = this.sources.length;
    this.sources = [...this.sources, {
      id,
      rootPath,
      sourceType: 'project',
      projects: [],
      warnings: [],
      loading: true,
      progress: {
        requestId: '',
        phase: 'preparing',
        percent: 3,
        directoriesScanned: 0,
        projectsFound: 0,
        currentPath: '.',
      },
      error: '',
    }];
    return index;
  }

  startInspection(index: number): void {
    const source = this.sources[index];
    if (!source) return;
    this.sources[index] = {
      ...source,
      loading: true,
      progress: {
        requestId: '',
        phase: 'preparing',
        percent: 3,
        directoriesScanned: 0,
        projectsFound: 0,
        currentPath: '.',
      },
      error: '',
    };
    this.sources = [...this.sources];
    this.changeDetector.markForCheck();
  }

  setInspectionProgress(
    index: number,
    progress: ProjectSourceInspectionProgress,
  ): void {
    const source = this.sources[index];
    if (!source || !source.loading) return;
    this.sources[index] = { ...source, progress };
    this.sources = [...this.sources];
    this.changeDetector.markForCheck();
  }

  setInspection(
    index: number,
    inspection: ProjectSourceInspection,
  ): void {
    const previous = this.sources[index];
    const configured = new Map(
      (previous?.projects ?? []).map((project) => [project.relativePath, project]),
    );
    this.sources[index] = {
      ...previous,
      rootPath: inspection.rootPath,
      sourceType: inspection.sourceType,
      warnings: inspection.warnings,
      loading: false,
      progress: null,
      error: '',
      projects: inspection.projects.map((candidate) => {
        const current = configured.get(candidate.relativePath);
        const userKind =
          current?.kindSource === 'user'
            ? current.kind
            : candidate.kindSource === 'user'
              ? candidate.configuredKind
              : undefined;
        const kind = userKind ?? candidate.suggestedKind ?? '';
        const localLink = this.mergeLocalLink(
          current?.localLink ??
            (candidate.localLibraryLink
              ? {
                  packageName: candidate.localLibraryLink.packageName,
                  developmentScript:
                    candidate.localLibraryLink.developmentScript,
                  artifactRelativePath:
                    candidate.localLibraryLink.artifactRelativePath,
                  preferredLinkScript:
                    candidate.localLibraryLink.preferredLinkScript,
                }
              : null),
          candidate.localLinkSuggestion,
        );
        const automaticallyLinkable =
          kind === 'library' &&
          candidate.suggestedKind === 'library' &&
          candidate.ecosystem === 'node' &&
          !!candidate.localLinkSuggestion;
        return {
          name: candidate.name,
          relativePath: candidate.relativePath,
          technology: candidate.technology,
          ecosystem: candidate.ecosystem,
          supportLevel: candidate.supportLevel,
          evidence: candidate.evidence,
          capabilities: candidate.capabilities,
          scripts: candidate.scripts,
          kind,
          kindSource: userKind ? 'user' : 'detected',
          status: candidate.status ?? (current ? 'existing' : 'new'),
          linkEnabled: current?.localLink
            ? current.linkEnabled
            : candidate.localLibraryLink
              ? candidate.localLibraryLink.enabled
              : automaticallyLinkable,
          localLink,
        };
      }),
    };
    this.sources = [...this.sources];
    this.changeDetector.markForCheck();
    if (!this.name.trim()) {
      this.name = this.pathName(inspection.rootPath);
    }
  }

  setInspectionError(index: number, message: string): void {
    this.sources[index] = {
      ...this.sources[index],
      loading: false,
      progress: null,
      error: message,
    };
    this.sources = [...this.sources];
    this.changeDetector.markForCheck();
  }

  setMissingProjects(
    projects: Array<{
      projectId: string;
      name: string;
      relativePath: string;
    }>,
  ): void {
    this.missingProjects = [...projects];
  }

  removeSource(index: number): void {
    this.sources = this.sources.filter((_, item) => item !== index);
  }

  setKind(sourceIndex: number, projectIndex: number, kind: ProjectKind): void {
    const project = this.sources[sourceIndex].projects[projectIndex];
    this.sources[sourceIndex].projects[projectIndex] = {
      ...project,
      kind,
      kindSource: 'user',
      linkEnabled: kind === 'library' ? project.linkEnabled : false,
    };
    this.sources = [...this.sources];
  }

  setLinkEnabled(
    sourceIndex: number,
    projectIndex: number,
    enabled: boolean,
  ): void {
    const project = this.sources[sourceIndex].projects[projectIndex];
    const packageName = project.name;
    const unscopedName = packageName.replace(/^@[^/]+\//, '');
    this.sources[sourceIndex].projects[projectIndex] = {
      ...project,
      linkEnabled: enabled,
      localLink: project.localLink ?? {
        packageName,
        developmentScript:
          project.scripts.includes('watch')
            ? 'watch'
            : project.scripts.includes('build')
              ? 'build'
              : project.scripts[0] ?? '',
        artifactRelativePath: `dist/${unscopedName}`,
        preferredLinkScript: `link:${unscopedName.replace(/-lib$/, '')}`,
      },
    };
    this.sources = [...this.sources];
  }

  valid(): boolean {
    const explicitPoliciesValid = this.detectedEcosystems().every(
      (ecosystem) => {
        const policy = this.executionPolicies[ecosystem];
        const runtimeValid =
          policy?.runtime?.mode !== 'explicit' ||
          ecosystem === 'node' ||
          !!policy.runtime.path?.trim();
        const toolValid =
          !ecosystem.startsWith('java-') ||
          policy?.tool?.mode !== 'explicit' ||
          !!policy.tool.path?.trim();
        return runtimeValid && toolValid;
      },
    );
    return !!this.name.trim() &&
      this.sources.length > 0 &&
      this.sources.every((source) =>
        !source.loading &&
        !source.error &&
        source.projects.length > 0 &&
        source.projects.every((project) =>
          !!project.kind &&
          (!project.linkEnabled ||
            (!!project.localLink?.packageName &&
              !!project.localLink.developmentScript &&
              !!project.localLink.artifactRelativePath &&
              project.localLink.preferredLinkScript.startsWith('link:')))
        )
      ) &&
      (this.nodeMode !== 'explicit' || !!this.nodeVersion.trim()) &&
      explicitPoliciesValid;
  }

  detectedEcosystems(): Ecosystem[] {
    return [...new Set(this.sources.flatMap((source) =>
      source.projects.map((project) => project.ecosystem)
    ))];
  }

  ecosystemLabel(ecosystem: Ecosystem): string {
    return {
      node: 'Node.js',
      'java-maven': 'Java / Maven',
      'java-gradle': 'Java / Gradle',
      dotnet: '.NET',
      python: 'Python',
      rust: 'Rust',
      go: 'Go',
    }[ecosystem];
  }

  policyMode(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool',
  ): ExecutionPolicyMode {
    return this.executionPolicies[ecosystem]?.[component]?.mode ?? 'inherit';
  }

  policyPath(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool',
  ): string {
    return this.executionPolicies[ecosystem]?.[component]?.path ?? '';
  }

  setPolicyMode(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool',
    mode: ExecutionPolicyMode,
  ): void {
    const current = this.executionPolicies[ecosystem]?.[component];
    this.executionPolicies = {
      ...this.executionPolicies,
      [ecosystem]: {
        ...(this.executionPolicies[ecosystem] ?? {}),
        [component]: {
          mode,
          ...(mode === 'explicit' && current?.path
            ? { path: current.path }
            : {}),
          ...(ecosystem === 'node' &&
              component === 'runtime' &&
              mode === 'explicit' &&
              this.nodeVersion.trim()
            ? { version: this.nodeVersion.trim() }
            : {}),
        },
      },
    };
    if (ecosystem === 'node' && component === 'runtime') {
      this.nodeMode = mode;
    }
  }

  setPolicyPath(
    ecosystem: Ecosystem,
    component: 'runtime' | 'tool',
    path: string,
  ): void {
    this.executionPolicies = {
      ...this.executionPolicies,
      [ecosystem]: {
        ...(this.executionPolicies[ecosystem] ?? {}),
        [component]: {
          mode: 'explicit',
          path,
        },
      },
    };
  }

  submit(): void {
    if (!this.valid()) return;
    this.saveWorkspace.emit({
      name: this.name.trim(),
      projectSources: this.sources.map((source) => ({
        ...(source.id ? { id: source.id } : {}),
        rootPath: source.rootPath,
        projects: source.projects.map((project) => ({
          relativePath: project.relativePath,
          kind: project.kind as ProjectKind,
          kindSource: project.kindSource,
          ...(project.kind === 'library' &&
          project.localLink
            ? {
                localLibraryLink: {
                  enabled: project.linkEnabled,
                  ...project.localLink,
                },
              }
            : {}),
        })),
      })),
      environment: this.environment,
      nodePolicy: {
        mode: this.nodeMode,
        ...(this.nodeMode === 'explicit'
          ? { version: this.nodeVersion.trim() }
          : {}),
      },
      executionPolicies: {
        ...this.executionPolicies,
        node: {
          ...(this.executionPolicies.node ?? {}),
          runtime: {
            mode: this.nodeMode,
            ...(this.nodeMode === 'explicit'
              ? { version: this.nodeVersion.trim() }
              : {}),
          },
        },
      },
    });
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.open) this.dismiss.emit();
  }

  private resetFromWorkspace(): void {
    const workspace = this.workspace;
    this.name = workspace?.name ?? '';
    this.sources = workspace?.projectSources.map((source) => ({
      id: source.id,
      rootPath: source.rootPath,
      sourceType: 'project',
      projects: source.projects.map((project) => ({
        name: this.pathName(project.relativePath === '.' ? source.rootPath : project.relativePath),
        relativePath: project.relativePath,
        technology: 'Node.js',
        ecosystem: 'node',
        supportLevel: 'stable',
        evidence: [],
        capabilities: [],
        scripts: [],
        kind: project.kind,
        kindSource: project.kindSource,
        status: 'existing',
        linkEnabled: project.localLibraryLink?.enabled === true,
        localLink: project.localLibraryLink
          ? {
              packageName: project.localLibraryLink.packageName,
              developmentScript: project.localLibraryLink.developmentScript,
              artifactRelativePath: project.localLibraryLink.artifactRelativePath,
              preferredLinkScript: project.localLibraryLink.preferredLinkScript,
            }
          : null,
      })),
      warnings: [],
      loading: false,
      progress: null,
      error: '',
    })) ?? [];
    this.environment = workspace?.environment ?? 'local';
    this.nodeMode = workspace?.nodePolicy.mode ?? 'inherit';
    this.nodeVersion = workspace?.nodePolicy.version ?? '';
    this.executionPolicies = structuredClone(
      workspace?.executionPolicies ?? {},
    );
    this.missingProjects = [];
  }

  private pathName(value: string): string {
    return value.split(/[\\/]/).filter(Boolean).pop() ?? '';
  }

  private mergeLocalLink(
    configured: Omit<LocalLibraryLinkConfig, 'enabled'> | null,
    suggested: Omit<LocalLibraryLinkConfig, 'enabled'> | null,
  ): Omit<LocalLibraryLinkConfig, 'enabled'> | null {
    if (!configured) return suggested;
    if (!suggested) return configured;
    return {
      packageName: configured.packageName || suggested.packageName,
      developmentScript:
        configured.developmentScript || suggested.developmentScript,
      artifactRelativePath:
        configured.artifactRelativePath || suggested.artifactRelativePath,
      preferredLinkScript:
        configured.preferredLinkScript || suggested.preferredLinkScript,
    };
  }
}
