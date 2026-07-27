import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NodePolicyMode,
  NodeVersionCatalog,
  RunnerEnvironment,
  LibraryInspection,
  WorkspaceConfig,
  WorkspaceInput,
} from '../../core/models/runner.models';
import { NodeVersionPickerComponent } from '../node-version-picker/node-version-picker.component';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';

@Component({
  selector: 'app-workspace-dialog',
  standalone: true,
  imports: [FormsModule, NodeVersionPickerComponent, ActionTooltipDirective],
  templateUrl: './workspace-dialog.component.html',
  styleUrl: './workspace-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceDialogComponent implements OnChanges {
  @Input() open = false;
  @Input() workspace: WorkspaceConfig | null = null;
  @Input({ required: true }) nodeVersions!: NodeVersionCatalog;
  @Input() nodeVersionsLoading = false;
  @Output() dismiss = new EventEmitter<void>();
  @Output() browseShell = new EventEmitter<string>();
  @Output() browseMfe = new EventEmitter<{
    index: number;
    initialPath: string;
  }>();
  @Output() browseLibrary = new EventEmitter<{
    index: number;
    initialPath: string;
  }>();
  @Output() saveWorkspace = new EventEmitter<WorkspaceInput>();
  @Output() refreshNodeVersions = new EventEmitter<void>();

  name = '';
  shellRootPath = '';
  mfeRootPaths = [''];
  libraries: Array<{
    rootPath: string;
    packageName: string;
    scripts: string[];
    developmentScript: string;
    artifactRelativePath: string;
    preferredLinkScript: string;
  }> = [];
  environment: RunnerEnvironment = 'local';
  nodeMode: NodePolicyMode = 'inherit';
  nodeVersion = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue && !changes['open']?.previousValue) {
      this.resetFromWorkspace();
    }
  }

  setShellPath(path: string): void {
    this.shellRootPath = path;
    if (!this.name.trim()) {
      this.name = this.pathName(path);
    }
  }

  setMfePath(index: number, path: string): void {
    this.mfeRootPaths[index] = path;
    this.mfeRootPaths = [...this.mfeRootPaths];
  }

  addMfePath(): void {
    this.mfeRootPaths = [...this.mfeRootPaths, ''];
  }

  removeMfePath(index: number): void {
    if (this.mfeRootPaths.length === 1) {
      this.mfeRootPaths = [''];
      return;
    }
    this.mfeRootPaths = this.mfeRootPaths.filter((_, item) => item !== index);
  }

  addLibrary(): void {
    this.libraries = [...this.libraries, {
      rootPath: '',
      packageName: '',
      scripts: [],
      developmentScript: '',
      artifactRelativePath: '',
      preferredLinkScript: 'link:web-common',
    }];
  }

  removeLibrary(index: number): void {
    this.libraries = this.libraries.filter((_, item) => item !== index);
  }

  setLibraryInspection(index: number, inspection: LibraryInspection): void {
    this.libraries[index] = {
      rootPath: inspection.rootPath,
      packageName: inspection.packageName,
      scripts: inspection.scripts,
      developmentScript: inspection.developmentScript,
      artifactRelativePath: inspection.artifactRelativePath,
      preferredLinkScript: inspection.preferredLinkScript,
    };
    this.libraries = [...this.libraries];
  }

  updateLibrary(
    index: number,
    field: 'developmentScript' | 'artifactRelativePath' | 'preferredLinkScript',
    value: string,
  ): void {
    this.libraries[index] = { ...this.libraries[index], [field]: value };
    this.libraries = [...this.libraries];
  }

  valid(): boolean {
    return !!this.name.trim() &&
      !!this.shellRootPath.trim() &&
      this.mfeRootPaths.some((path) => path.trim()) &&
      this.libraries.every((library) =>
        !!library.rootPath.trim() &&
        !!library.developmentScript.trim() &&
        !!library.artifactRelativePath.trim() &&
        library.preferredLinkScript.startsWith('link:')
      ) &&
      (this.nodeMode !== 'explicit' || !!this.nodeVersion.trim());
  }

  submit(): void {
    if (!this.valid()) return;
    this.saveWorkspace.emit({
      name: this.name.trim(),
      shellRootPath: this.shellRootPath.trim(),
      mfeRootPaths: this.mfeRootPaths
        .map((path) => path.trim())
        .filter(Boolean),
      libraries: this.libraries.map((library) => ({
        rootPath: library.rootPath.trim(),
        developmentScript: library.developmentScript.trim(),
        artifactRelativePath: library.artifactRelativePath.trim(),
        preferredLinkScript: library.preferredLinkScript.trim(),
      })),
      environment: this.environment,
      nodePolicy: {
        mode: this.nodeMode,
        ...(this.nodeMode === 'explicit'
          ? { version: this.nodeVersion.trim() }
          : {}),
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
    this.shellRootPath = workspace?.shellRootPath ?? '';
    this.mfeRootPaths = workspace?.mfeRoots.map((root) => root.rootPath) ?? [''];
    this.libraries = workspace?.libraries.map((library) => ({
      rootPath: library.rootPath,
      packageName: '',
      scripts: [library.developmentScript],
      developmentScript: library.developmentScript,
      artifactRelativePath: library.artifactRelativePath,
      preferredLinkScript: library.preferredLinkScript,
    })) ?? [];
    this.environment = workspace?.environment ?? 'local';
    this.nodeMode = workspace?.nodePolicy.mode ?? 'inherit';
    this.nodeVersion = workspace?.nodePolicy.version ?? '';
  }

  private pathName(value: string): string {
    return value.split(/[\\/]/).filter(Boolean).pop() ?? '';
  }
}
