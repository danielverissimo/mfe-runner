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
  DiscoveredProject,
  NodePolicy,
  NodePolicyMode,
  NodeVersionCatalog,
  WorkspaceConfig,
} from '../../core/models/runner.models';
import { NodeVersionPickerComponent } from '../node-version-picker/node-version-picker.component';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';

export interface ProjectSettingsChange {
  nodePolicy: NodePolicy;
  defaultScript?: string;
  libraryLinkScripts: Record<string, string>;
  startupOrder: number;
}

@Component({
  selector: 'app-project-settings-dialog',
  standalone: true,
  imports: [FormsModule, NodeVersionPickerComponent, ActionTooltipDirective],
  templateUrl: './project-settings-dialog.component.html',
  styleUrl: './project-settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsDialogComponent implements OnChanges {
  @Input() open = false;
  @Input({ required: true }) workspace!: WorkspaceConfig;
  @Input({ required: true }) project!: DiscoveredProject;
  @Input({ required: true }) nodeVersions!: NodeVersionCatalog;
  @Input() nodeVersionsLoading = false;
  @Input() saving = false;
  @Output() dismiss = new EventEmitter<void>();
  @Output() saveSettings = new EventEmitter<ProjectSettingsChange>();
  @Output() refreshNodeVersions = new EventEmitter<void>();

  nodeMode: NodePolicyMode = 'inherit';
  nodeVersion = '';
  defaultScript = '';
  libraryLinkScripts: Record<string, string> = {};
  startupOrder = 500;

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['open']?.currentValue && !changes['open']?.previousValue) ||
      changes['project'] ||
      changes['workspace']
    ) {
      this.resetDraft();
    }
  }

  submit(): void {
    if (this.nodeMode === 'explicit' && !this.nodeVersion.trim()) return;
    this.saveSettings.emit({
      nodePolicy: {
        mode: this.nodeMode,
        ...(this.nodeMode === 'explicit'
          ? { version: this.nodeVersion.trim() }
          : {}),
      },
      ...(this.defaultScript ? { defaultScript: this.defaultScript } : {}),
      libraryLinkScripts: { ...this.libraryLinkScripts },
      startupOrder: Math.max(0, Math.min(999, Math.round(this.startupOrder))),
    });
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.open) this.dismiss.emit();
  }

  roleLabel(): string {
    return {
      library: 'Biblioteca',
      mfe: 'Projeto · MFE',
      shell: 'Projeto · Host',
      application: 'Projeto',
      template: 'Projeto',
    }[this.project.role];
  }

  availableLinkScripts(): string[] {
    return this.project.scriptNames.filter((script) =>
      script.startsWith('link:')
    );
  }

  libraryName(libraryId: string): string {
    return this.project.libraryLinks.find(
      (link) => link.libraryId === libraryId,
    )?.libraryName ?? 'Biblioteca';
  }

  setLibraryLinkScript(libraryId: string, script: string): void {
    this.libraryLinkScripts = {
      ...this.libraryLinkScripts,
      [libraryId]: script,
    };
  }

  private resetDraft(): void {
    if (!this.project || !this.workspace) return;
    const override = this.workspace.projectOverrides[this.project.id];
    this.nodeMode = override?.nodePolicy?.mode ?? 'inherit';
    this.nodeVersion =
      override?.nodePolicy?.version ??
      this.project.node.version ??
      '';
    this.defaultScript =
      override?.defaultScript ??
      this.project.defaultScript ??
      this.project.scriptNames[0] ??
      '';
    this.startupOrder =
      override?.startupOrder ??
      this.project.startupOrder;
    this.libraryLinkScripts = {
      ...(override?.libraryLinkScripts ?? {}),
    };
    for (const link of this.project.libraryLinks) {
      if (link.script && !this.libraryLinkScripts[link.libraryId]) {
        this.libraryLinkScripts[link.libraryId] = link.script;
      }
    }
  }
}
