import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  DiscoveredProject,
  ManagedProcess,
  ProcessRequest,
} from '../../core/models/runner.models';
import { StatusPillComponent } from '../status-pill/status-pill.component';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';
import { RunnerIconComponent } from '../runner-icon/runner-icon.component';

@Component({
  selector: 'app-process-table',
  standalone: true,
  imports: [
    CommonModule,
    StatusPillComponent,
    ActionTooltipDirective,
    RunnerIconComponent,
  ],
  templateUrl: './process-table.component.html',
  styleUrl: './process-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessTableComponent {
  @Input({ required: true }) workspaceId = '';
  @Input({ required: true }) projects: DiscoveredProject[] = [];
  @Input() processes: ManagedProcess[] = [];
  @Input() emptyMessage =
    'Nenhum projeto executável foi descoberto nestes paths.';
  @Input() busy = false;
  @Input() reorderEnabled = true;
  @Output() startProject = new EventEmitter<ProcessRequest>();
  @Output() stopProject = new EventEmitter<ProcessRequest>();
  @Output() restartProject = new EventEmitter<ProcessRequest>();
  @Output() terminateExternalProcess = new EventEmitter<string>();
  @Output() inspectLogs = new EventEmitter<string>();
  @Output() configureProject = new EventEmitter<string>();
  @Output() excludeProject = new EventEmitter<string>();
  @Output() moveProject = new EventEmitter<{
    projectId: string;
    direction: 'up' | 'down';
  }>();
  @Output() openAddress = new EventEmitter<number>();
  @Output() openIde = new EventEmitter<string>();
  @Output() openFolder = new EventEmitter<string>();
  @Output() openTerminal = new EventEmitter<string>();
  @Output() copyPath = new EventEmitter<string>();
  @Output() copyAddress = new EventEmitter<number>();
  @Output() linkLibrary = new EventEmitter<{
    libraryId: string;
    projectId?: string;
  }>();

  private readonly selectedCommands = new Map<string, string>();
  toolsProjectId: string | null = null;
  libraryProjectId: string | null = null;
  menuPosition: {
    top: number | null;
    right: number;
    bottom: number | null;
    maxHeight: number;
  } = {
    top: null,
    right: 12,
    bottom: null,
    maxHeight: 320,
  };

  @HostListener('document:keydown.escape')
  closeToolMenuOnEscape(): void {
    this.closeMenus();
  }

  @HostListener('document:click')
  closeToolMenuOnOutsideClick(): void {
    this.closeMenus();
  }

  @HostListener('window:resize')
  closeToolMenuOnResize(): void {
    this.closeMenus();
  }

  processFor(projectId: string): ManagedProcess | undefined {
    return this.processes.find(
      (process) =>
        process.workspaceId === this.workspaceId &&
        process.projectId === projectId,
    );
  }

  selectedScript(project: DiscoveredProject): string {
    const command = this.selectedCommand(project);
    if (command) return command.task;
    const selected = this.selectedCommands.get(this.scriptSelectionKey(project.id));
    if (selected && project.scriptNames.includes(selected)) {
      return selected;
    }

    return project.defaultScript ?? project.scriptNames[0] ?? '';
  }

  selectedCommand(project: DiscoveredProject) {
    const selected = this.selectedCommands.get(
      this.scriptSelectionKey(project.id),
    );
    return project.commands.find((command) => command.id === selected) ??
      project.commands.find(
        (command) => command.id === project.defaultCommandId,
      ) ??
      project.commands[0];
  }

  selectedCommandId(project: DiscoveredProject): string {
    return this.selectedCommand(project)?.id ?? this.selectedScript(project);
  }

  setScript(projectId: string, event: Event): void {
    this.selectedCommands.set(
      this.scriptSelectionKey(projectId),
      (event.target as HTMLSelectElement).value,
    );
  }

  start(project: DiscoveredProject): void {
    this.startProject.emit({
      workspaceId: this.workspaceId,
      projectId: project.id,
      commandId: this.selectedCommand(project)?.id,
      script: this.selectedScript(project),
    });
  }

  stop(project: DiscoveredProject): void {
    this.stopProject.emit({
      workspaceId: this.workspaceId,
      projectId: project.id,
    });
  }

  restart(project: DiscoveredProject): void {
    this.restartProject.emit({
      workspaceId: this.workspaceId,
      projectId: project.id,
    });
  }

  terminateExternal(project: DiscoveredProject): void {
    this.terminateExternalProcess.emit(project.id);
  }

  isActive(status?: string): boolean {
    return !!status &&
      ['starting', 'linking', 'running', 'healthy', 'degraded', 'stopping']
        .includes(status);
  }

  roleLabel(role: string): string {
    return {
      library: 'Biblioteca',
      mfe: 'Projeto · MFE',
      shell: 'Projeto · Host',
      application: 'Projeto',
      template: 'Projeto',
    }[role] ?? role;
  }

  runtimeLabel(project: DiscoveredProject): string {
    const runtime = project.runtime.components.runtime;
    if (!runtime) return 'Indisponível';
    return runtime.version ? `v${runtime.version}` : 'PATH';
  }

  runtimeSource(project: DiscoveredProject): string {
    const runtime = project.runtime.components.runtime;
    if (project.ecosystem === 'node' && project.node.source === 'nvmrc') {
      return '.nvmrc';
    }
    return runtime?.source ?? project.runtime.compatibility;
  }

  uptime(process?: ManagedProcess): string {
    if (!process?.startedAt || !this.isActive(process.status)) return '—';
    const elapsed = Math.max(
      0,
      Date.now() - new Date(process.startedAt).getTime(),
    );
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  warningLabel(warning: string): string {
    if (warning.includes('não associado a um manifest')) {
      return 'Não associado a um manifest';
    }
    return warning;
  }

  toggleTools(projectId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.toolsProjectId === projectId) {
      this.closeTools();
      return;
    }

    this.positionMenu(event.currentTarget as HTMLElement, 320);
    this.toolsProjectId = projectId;
    this.libraryProjectId = null;
  }

  toggleLibraries(projectId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.libraryProjectId === projectId) {
      this.closeLibraries();
      return;
    }

    this.positionMenu(event.currentTarget as HTMLElement, 360);
    this.libraryProjectId =
      projectId;
    this.toolsProjectId = null;
  }

  closeLibraries(): void {
    this.libraryProjectId = null;
  }

  linkStateLabel(state: string): string {
    return {
      linked: 'Vinculada',
      'not-linked': 'Não vinculada',
      stale: 'Desatualizada',
      unavailable: 'Indisponível',
    }[state] ?? state;
  }

  linkOne(libraryId: string, projectId: string): void {
    this.linkLibrary.emit({ libraryId, projectId });
    this.closeLibraries();
  }

  closeTools(): void {
    this.toolsProjectId = null;
  }

  closeMenus(): void {
    this.closeTools();
    this.closeLibraries();
  }

  canMove(project: DiscoveredProject, direction: 'up' | 'down'): boolean {
    if (!this.reorderEnabled || project.orphaned) return false;
    const configurable = this.projects.filter((item) => !item.orphaned);
    const index = configurable.findIndex((item) => item.id === project.id);
    return direction === 'up'
      ? index > 0
      : index >= 0 && index < configurable.length - 1;
  }

  move(projectId: string, direction: 'up' | 'down'): void {
    this.moveProject.emit({ projectId, direction });
    this.closeTools();
  }

  runTool(action: 'ide' | 'folder' | 'terminal' | 'path', project: DiscoveredProject): void {
    if (action === 'ide') this.openIde.emit(project.id);
    if (action === 'folder') this.openFolder.emit(project.id);
    if (action === 'terminal') this.openTerminal.emit(project.id);
    if (action === 'path') this.copyPath.emit(project.absolutePath);
    this.closeTools();
  }

  gitTitle(project: DiscoveredProject): string {
    const git = project.git;
    if (!git.available || !git.repository) return git.message;
    return [
      git.detached ? 'HEAD destacado' : `Branch: ${git.branch}`,
      `Commit: ${git.commit ?? 'sem commit'}`,
      `Alterados: ${git.changedFiles}`,
      git.upstream ? `Upstream: ${git.upstream}` : 'Sem upstream',
      git.ahead === null ? '' : `Ahead: ${git.ahead}`,
      git.behind === null ? '' : `Behind: ${git.behind}`,
      git.message,
    ].filter(Boolean).join('\n');
  }

  private scriptSelectionKey(projectId: string): string {
    return `${this.workspaceId}\u0000${projectId}`;
  }

  private positionMenu(trigger: HTMLElement, preferredHeight: number): void {
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight =
      document.documentElement.clientHeight || window.innerHeight;
    const edge = 12;
    const gap = 6;
    const spaceBelow = viewportHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    const openBelow =
      spaceBelow >= Math.min(preferredHeight, 220) || spaceBelow >= spaceAbove;

    this.menuPosition = {
      top: openBelow ? rect.bottom + gap : null,
      right: Math.max(edge, viewportWidth - rect.right),
      bottom: openBelow ? null : viewportHeight - rect.top + gap,
      maxHeight: Math.max(120, openBelow ? spaceBelow : spaceAbove),
    };
  }
}
