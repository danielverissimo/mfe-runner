import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  LogEntry,
  LogLevel,
  ManagedProcess,
} from '../../core/models/runner.models';
import { RunnerApiService } from '../../core/services/runner-api.service';
import { LogViewStateService } from './log-view-state.service';
import { ActionTooltipDirective } from '../action-tooltip/action-tooltip.directive';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';

type CopyState = 'idle' | 'copying' | 'copied' | 'error';
type ExportState = 'idle' | 'exporting' | 'exported' | 'error';
type ExportScope = 'workspace' | 'filtered' | 'range';

@Component({
  selector: 'app-log-panel',
  standalone: true,
  imports: [DatePipe, ActionTooltipDirective, RunnerSelectComponent],
  templateUrl: './log-panel.component.html',
  styleUrl: './log-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogPanelComponent
  implements AfterViewChecked, OnChanges, OnDestroy {
  private readonly runner = inject(RunnerApiService);
  readonly viewState = inject(LogViewStateService);

  @Input() processes: ManagedProcess[] = [];
  @Input() workspaceId?: string;
  @Input() projectId?: string;
  @Input() expanded = false;
  @Input() openable = false;
  @Output() clear = new EventEmitter<void>();
  @Output() open = new EventEmitter<void>();

  @ViewChild('console') private console?: ElementRef<HTMLElement>;

  followOutput = true;
  visualPaused = false;
  copyState: CopyState = 'idle';
  exportState: ExportState = 'idle';
  sourceFilterOpen = false;
  showAllSources = true;
  readonly selectedSourceIds = new Set<string>();
  readonly selectedLevels = new Set<LogLevel>(['info', 'warning', 'error']);
  readonly levels: LogLevel[] = ['info', 'warning', 'error'];
  searchInput = '';
  searchQuery = '';
  regexMode = false;
  regexError = '';
  bookmarkedOnly = false;
  activeErrorId?: string;
  rangeMode = false;
  rangeStartId?: string;
  rangeEndId?: string;
  exportOpen = false;
  exportScope: ExportScope = 'workspace';
  includeAbsolutePaths = false;
  exportedPath?: string;

  private searchExpression?: RegExp;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private frozenEntries: LogEntry[] = [];
  private lastFollowedEntryId?: string;

  get sourceOptions(): Array<{ id: string; name: string; logCount: number }> {
    const options = new Map<string, { id: string; name: string; logCount: number }>();
    for (const process of this.processes) {
      if (
        (this.workspaceId && process.workspaceId !== this.workspaceId) ||
        (this.projectId && process.projectId !== this.projectId) ||
        process.logs.length === 0
      ) {
        continue;
      }
      const current = options.get(process.projectId);
      options.set(process.projectId, {
        id: process.projectId,
        name: process.projectName,
        logCount: (current?.logCount ?? 0) + process.logs.length,
      });
    }
    return [...options.values()];
  }

  get scopedEntries(): LogEntry[] {
    return this.processes
      .filter((process) =>
        (!this.workspaceId || process.workspaceId === this.workspaceId) &&
        (!this.projectId || process.projectId === this.projectId)
      )
      .flatMap((process) => process.logs)
      .sort(
        (left, right) =>
          new Date(left.timestamp).getTime() -
          new Date(right.timestamp).getTime(),
      );
  }

  get entries(): LogEntry[] {
    return this.filteredEntries.slice(this.expanded ? -2500 : -250);
  }

  get filteredEntries(): LogEntry[] {
    const source = this.visualPaused ? this.frozenEntries : this.scopedEntries;
    return this.applyFilters(source);
  }

  get sourceFilterLabel(): string {
    if (this.showAllSources) return 'Todos';
    const count = this.selectedSourceIds.size;
    return `${count} selecionado${count === 1 ? '' : 's'}`;
  }

  get newEntriesCount(): number {
    if (!this.visualPaused) return 0;
    const frozenIds = new Set(this.frozenEntries.map((entry) => entry.id));
    return this.scopedEntries.filter((entry) => !frozenIds.has(entry.id)).length;
  }

  get errorEntries(): LogEntry[] {
    return this.entries.filter((entry) => entry.level === 'error');
  }

  get errorPosition(): string {
    if (!this.errorEntries.length) return '0/0';
    const index = this.errorEntries.findIndex(
      (entry) => entry.id === this.activeErrorId,
    );
    return `${index < 0 ? 0 : index + 1}/${this.errorEntries.length}`;
  }

  get rangeEntries(): LogEntry[] {
    if (!this.rangeStartId || !this.rangeEndId) return [];
    const start = this.entries.findIndex((entry) => entry.id === this.rangeStartId);
    const end = this.entries.findIndex((entry) => entry.id === this.rangeEndId);
    if (start < 0 || end < 0) return [];
    return this.entries.slice(Math.min(start, end), Math.max(start, end) + 1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['workspaceId'] && !changes['workspaceId'].firstChange) ||
      (changes['projectId'] && !changes['projectId'].firstChange)
    ) {
      this.selectAllSources();
      this.sourceFilterOpen = false;
      this.resumeVisualization();
      this.clearRange();
    }
    if (changes['processes']) {
      if (!this.showAllSources) {
        const availableIds = new Set(
          this.sourceOptions.map((option) => option.id),
        );
        for (const sourceId of this.selectedSourceIds) {
          if (!availableIds.has(sourceId)) this.selectedSourceIds.delete(sourceId);
        }
        if (this.selectedSourceIds.size === 0) this.showAllSources = true;
      }
      this.viewState.prune(
        new Set(
          this.processes.flatMap((process) =>
            process.logs.map((entry) => entry.id)
          ),
        ),
      );
      if (
        this.activeErrorId &&
        !this.errorEntries.some((entry) => entry.id === this.activeErrorId)
      ) {
        this.activeErrorId = undefined;
      }
    }
  }

  ngAfterViewChecked(): void {
    if (!this.followOutput || this.visualPaused) return;
    const latestEntryId = this.entries.at(-1)?.id;
    if (!latestEntryId || latestEntryId === this.lastFollowedEntryId) return;
    this.scrollToLatest();
    this.lastFollowedEntryId = latestEntryId;
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    if (this.exportOpen) this.exportOpen = false;
    else if (this.sourceFilterOpen) this.sourceFilterOpen = false;
    else if (this.rangeMode) this.rangeMode = false;
  }

  updateSearch(value: string): void {
    this.searchInput = value.slice(0, 200);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchQuery = this.searchInput.trim();
      this.compileSearch();
      this.resetFollowPosition();
    }, 180);
  }

  toggleRegex(): void {
    this.regexMode = !this.regexMode;
    this.compileSearch();
  }

  toggleLevel(level: LogLevel): void {
    if (this.selectedLevels.has(level) && this.selectedLevels.size > 1) {
      this.selectedLevels.delete(level);
    } else {
      this.selectedLevels.add(level);
    }
    this.activeErrorId = undefined;
    this.resetFollowPosition();
  }

  toggleFollowOutput(): void {
    this.followOutput = !this.followOutput;
    if (this.followOutput && !this.visualPaused) {
      this.scrollToLatest();
      this.lastFollowedEntryId = this.entries.at(-1)?.id;
    }
  }

  toggleVisualization(): void {
    if (this.visualPaused) {
      this.resumeVisualization();
    } else {
      this.frozenEntries = this.scopedEntries;
      this.visualPaused = true;
      this.followOutput = false;
    }
  }

  resumeVisualization(): void {
    this.visualPaused = false;
    this.frozenEntries = [];
    this.lastFollowedEntryId = undefined;
  }

  toggleSourceFilter(): void {
    this.sourceFilterOpen = !this.sourceFilterOpen;
  }

  selectAllSources(): void {
    this.showAllSources = true;
    this.selectedSourceIds.clear();
    this.resetFollowPosition();
  }

  toggleSource(sourceId: string): void {
    if (this.showAllSources) {
      this.showAllSources = false;
      this.selectedSourceIds.clear();
      this.selectedSourceIds.add(sourceId);
    } else if (this.selectedSourceIds.has(sourceId)) {
      this.selectedSourceIds.delete(sourceId);
      if (this.selectedSourceIds.size === 0) this.showAllSources = true;
    } else {
      this.selectedSourceIds.add(sourceId);
    }
    this.resetFollowPosition();
  }

  isSourceSelected(sourceId: string): boolean {
    return !this.showAllSources && this.selectedSourceIds.has(sourceId);
  }

  toggleBookmark(entryId: string, event: Event): void {
    event.stopPropagation();
    this.viewState.toggle(entryId);
  }

  toggleBookmarkedOnly(): void {
    this.bookmarkedOnly = !this.bookmarkedOnly;
    this.resetFollowPosition();
  }

  navigateError(direction: -1 | 1): void {
    const errors = this.errorEntries;
    if (!errors.length) return;
    const current = errors.findIndex((entry) => entry.id === this.activeErrorId);
    const next = current < 0
      ? direction > 0 ? 0 : errors.length - 1
      : (current + direction + errors.length) % errors.length;
    this.activeErrorId = errors[next].id;
    setTimeout(() => this.scrollEntryIntoView(this.activeErrorId));
  }

  toggleRangeMode(): void {
    this.rangeMode = !this.rangeMode;
    if (this.rangeMode) this.clearRange();
  }

  selectRangeEntry(entry: LogEntry): void {
    if (!this.rangeMode) return;
    if (!this.rangeStartId || this.rangeEndId) {
      this.rangeStartId = entry.id;
      this.rangeEndId = undefined;
    } else {
      this.rangeEndId = entry.id;
      this.rangeMode = false;
      this.exportScope = 'range';
    }
  }

  isInRange(entryId: string): boolean {
    return this.rangeEntries.some((entry) => entry.id === entryId);
  }

  clearRange(): void {
    this.rangeStartId = undefined;
    this.rangeEndId = undefined;
  }

  async copyLogs(): Promise<void> {
    const text =
      this.selectedConsoleText() ||
      (this.rangeEntries.length
        ? this.logText(this.rangeEntries)
        : this.logText(this.entries));
    if (!text) return;

    this.copyState = 'copying';
    try {
      await this.runner.copyText(text);
      this.copyState = 'copied';
    } catch {
      this.copyState = 'error';
    }
  }

  get copyLabel(): string {
    switch (this.copyState) {
      case 'copying': return 'Copiando…';
      case 'copied': return 'Copiado';
      case 'error': return 'Falhou';
      default: return this.rangeEntries.length ? 'Copiar intervalo' : 'Copiar';
    }
  }

  openExport(): void {
    if (!this.workspaceId) return;
    this.exportState = 'idle';
    this.exportedPath = undefined;
    this.exportScope = this.rangeEntries.length ? 'range' : 'workspace';
    this.includeAbsolutePaths = false;
    this.exportOpen = true;
  }

  setExportScope(value: string): void {
    if (value === 'workspace' || value === 'filtered' || value === 'range') {
      this.exportScope = value;
    }
  }

  async exportDiagnostics(): Promise<void> {
    if (!this.workspaceId) return;
    const selectedEntries = this.exportScope === 'workspace'
      ? undefined
      : this.exportScope === 'range'
        ? this.rangeEntries
        : this.filteredEntries;
    if (this.exportScope !== 'workspace' && !selectedEntries?.length) return;
    this.exportState = 'exporting';
    try {
      const result = await this.runner.exportDiagnostics({
        workspaceId: this.workspaceId,
        ...(selectedEntries
          ? { entryIds: selectedEntries.map((entry) => entry.id) }
          : {}),
        includeAbsolutePaths: this.includeAbsolutePaths,
      });
      if (result.canceled) {
        this.exportState = 'idle';
        return;
      }
      this.exportedPath = result.filePath ?? undefined;
      this.exportState = 'exported';
    } catch {
      this.exportState = 'error';
    }
  }

  private applyFilters(entries: LogEntry[]): LogEntry[] {
    return entries.filter((entry) => {
      if (!this.showAllSources && !this.selectedSourceIds.has(entry.projectId)) {
        return false;
      }
      if (!this.selectedLevels.has(entry.level)) return false;
      if (this.bookmarkedOnly && !this.viewState.has(entry.id)) return false;
      if (!this.searchQuery) return true;
      const searchable = `${entry.projectName} ${entry.message}`;
      return this.regexMode
        ? !!this.searchExpression?.test(searchable)
        : searchable.toLocaleLowerCase('pt-BR').includes(
            this.searchQuery.toLocaleLowerCase('pt-BR'),
          );
    });
  }

  private compileSearch(): void {
    this.regexError = '';
    this.searchExpression = undefined;
    if (!this.regexMode || !this.searchQuery) return;
    try {
      this.searchExpression = new RegExp(this.searchQuery, 'i');
    } catch {
      this.regexError = 'Expressão regular inválida.';
    }
  }

  private selectedConsoleText(): string {
    const console = this.console?.nativeElement;
    const selection = window.getSelection();
    if (
      !console ||
      !selection ||
      selection.isCollapsed ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !console.contains(selection.anchorNode) ||
      !console.contains(selection.focusNode)
    ) {
      return '';
    }
    return selection.toString().trim();
  }

  private logText(entries: LogEntry[]): string {
    return entries.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString('pt-BR', {
        hour12: false,
      });
      return `${time} [${entry.level.toUpperCase()}] ` +
        `[${entry.projectName}] ${entry.message}`;
    }).join('\n');
  }

  private resetFollowPosition(): void {
    this.lastFollowedEntryId = undefined;
    if (this.followOutput && !this.visualPaused) this.scrollToLatest();
  }

  private scrollToLatest(): void {
    const console = this.console?.nativeElement;
    if (console) console.scrollTop = console.scrollHeight;
  }

  private scrollEntryIntoView(entryId?: string): void {
    if (!entryId) return;
    const lines = this.console?.nativeElement.querySelectorAll<HTMLElement>(
      '[data-entry-id]',
    );
    const line = [...(lines ?? [])].find(
      (element) => element.dataset['entryId'] === entryId,
    );
    line?.scrollIntoView({ block: 'center' });
  }
}
