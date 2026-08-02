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
  ExecutionPolicies,
  ExecutionPolicyMode,
  FlutterDevice,
  FlutterProjectTarget,
  NodePolicy,
  NodePolicyMode,
  NodeVersionCatalog,
  ProjectHealthCheck,
  WorkspaceConfig,
} from '../../core/models/runner.models';
import { NodeVersionPickerComponent } from '../node-version-picker/node-version-picker.component';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';

export interface ProjectSettingsChange {
  nodePolicy: NodePolicy;
  executionPolicies: ExecutionPolicies;
  defaultCommandId?: string;
  defaultScript?: string;
  libraryLinkScripts: Record<string, string>;
  startupOrder: number;
  healthCheck: ProjectHealthCheck;
  flutterTarget?: FlutterProjectTarget | null;
}

@Component({
  selector: 'app-project-settings-dialog',
  standalone: true,
  imports: [
    FormsModule,
    NodeVersionPickerComponent,
    ActionTooltipDirective,
    RunnerSelectComponent,
  ],
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
  @Input() flutterDevices: FlutterDevice[] = [];
  @Input() flutterDevicesLoading = false;
  @Output() dismiss = new EventEmitter<void>();
  @Output() saveSettings = new EventEmitter<ProjectSettingsChange>();
  @Output() refreshNodeVersions = new EventEmitter<void>();
  @Output() refreshFlutterDevices = new EventEmitter<void>();

  nodeMode: NodePolicyMode = 'inherit';
  nodeVersion = '';
  defaultScript = '';
  defaultCommandId = '';
  runtimeMode: ExecutionPolicyMode = 'inherit';
  runtimePath = '';
  toolMode: ExecutionPolicyMode = 'inherit';
  toolPath = '';
  libraryLinkScripts: Record<string, string> = {};
  startupOrder = 500;
  healthCheckType: ProjectHealthCheck['type'] = 'process';
  healthCheckPort: number | null = null;
  healthCheckPath = '/';
  flutterPlatform: FlutterProjectTarget['platform'] = 'web';
  flutterDeviceId = '';
  flutterDeviceName = '';

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
    if (
      this.runtimeMode === 'explicit' &&
      !(this.project.ecosystem === 'node'
        ? this.nodeVersion.trim()
        : this.runtimePath.trim())
    ) return;
    const runtimePolicy = {
      mode: this.runtimeMode,
      ...(this.runtimeMode === 'explicit'
        ? this.project.ecosystem === 'node'
          ? { version: this.nodeVersion.trim() }
          : { path: this.runtimePath.trim() }
        : {}),
    };
    const executionPolicies: ExecutionPolicies = {
      [this.project.ecosystem]: {
        runtime: runtimePolicy,
        ...(this.project.ecosystem.startsWith('java-')
          ? {
              tool: {
                mode: this.toolMode,
                ...(this.toolMode === 'explicit'
                  ? { path: this.toolPath.trim() }
                  : {}),
              },
            }
          : {}),
      },
    };
    const selectedCommand = this.project.commands.find(
      (command) => command.id === this.defaultCommandId,
    );
    this.saveSettings.emit({
      nodePolicy: {
        mode: this.project.ecosystem === 'node'
          ? this.runtimeMode
          : this.nodeMode,
        ...(this.project.ecosystem === 'node' && this.runtimeMode === 'explicit'
          ? { version: this.nodeVersion.trim() }
          : {}),
      },
      executionPolicies,
      ...(this.defaultCommandId
        ? { defaultCommandId: this.defaultCommandId }
        : {}),
      ...(selectedCommand?.task
        ? { defaultScript: selectedCommand.task }
        : this.defaultScript
          ? { defaultScript: this.defaultScript }
          : {}),
      libraryLinkScripts: { ...this.libraryLinkScripts },
      startupOrder: Math.max(0, Math.min(999, Math.round(this.startupOrder))),
      healthCheck: {
        type: this.healthCheckType,
        ...((this.healthCheckType === 'tcp' || this.healthCheckType === 'http')
          ? { port: Number(this.healthCheckPort) }
          : {}),
        ...(this.healthCheckType === 'http' && this.healthCheckPath.trim()
          ? { path: this.healthCheckPath.trim() }
          : {}),
      },
      ...(this.project.ecosystem === 'flutter'
        ? {
            flutterTarget: {
              platform: this.flutterPlatform,
              ...(this.flutterDeviceId.trim() ? { deviceId: this.flutterDeviceId.trim() } : {}),
              ...(this.flutterDeviceName.trim() ? { deviceName: this.flutterDeviceName.trim() } : {}),
            },
          }
        : {}),
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
    const ecosystemPolicy =
      override?.executionPolicies?.[this.project.ecosystem];
    this.runtimeMode =
      ecosystemPolicy?.runtime?.mode ??
      (this.project.ecosystem === 'node'
        ? override?.nodePolicy?.mode
        : undefined) ??
      'inherit';
    this.runtimePath =
      ecosystemPolicy?.runtime?.path ??
      this.project.runtime.components.runtime?.path ??
      '';
    this.toolMode = ecosystemPolicy?.tool?.mode ?? 'inherit';
    this.toolPath =
      ecosystemPolicy?.tool?.path ??
      this.project.runtime.components.tool?.path ??
      '';
    this.nodeMode = this.runtimeMode;
    this.nodeVersion =
      override?.nodePolicy?.version ??
      this.project.node.version ??
      '';
    this.defaultScript =
      override?.defaultScript ??
      this.project.defaultScript ??
      this.project.scriptNames[0] ??
      '';
    this.defaultCommandId =
      override?.defaultCommandId ??
      this.project.defaultCommandId ??
      this.project.commands[0]?.id ??
      '';
    this.startupOrder =
      override?.startupOrder ??
      this.project.startupOrder;
    const healthCheck = override?.healthCheck ?? this.project.healthCheck ?? {
      type: this.project.port ? 'tcp' : 'process',
      ...(this.project.port ? { port: this.project.port } : {}),
    };
    this.healthCheckType = healthCheck.type;
    this.healthCheckPort = healthCheck.port ?? this.project.port;
    this.healthCheckPath = healthCheck.path ?? '/';
    this.flutterPlatform = override?.flutterTarget?.platform ?? 'web';
    this.flutterDeviceId = override?.flutterTarget?.deviceId ?? '';
    this.flutterDeviceName = override?.flutterTarget?.deviceName ?? '';
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
