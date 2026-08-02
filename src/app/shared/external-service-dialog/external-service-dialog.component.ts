import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ExternalServiceCandidate,
  ExternalServiceCatalog,
  ExternalServiceCreateInput,
  ExternalServiceScheme,
} from '../../core/models/runner.models';
import { RunnerIconComponent } from '../runner-icon/runner-icon.component';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';

type ExternalServiceTab = 'discovered' | 'manual';

function normalizeCandidateSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

@Component({
  selector: 'app-external-service-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RunnerIconComponent, RunnerSelectComponent],
  templateUrl: './external-service-dialog.component.html',
  styleUrl: './external-service-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExternalServiceDialogComponent {
  @Input() open = false;
  @Input({ required: true }) workspaceId = '';
  @Input({ required: true }) catalog!: ExternalServiceCatalog;
  @Input() loading = false;
  @Input() submitting = false;
  @Input() message: string | null = null;
  @Output() dismiss = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();
  @Output() requestLogFile = new EventEmitter<void>();
  @Output() addService = new EventEmitter<ExternalServiceCreateInput>();
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  tab: ExternalServiceTab = 'discovered';
  candidateFilter = '';
  selectedCandidateId = '';
  discoveredName = '';
  discoveredScheme: ExternalServiceScheme = 'http';
  manualName = '';
  manualScheme: ExternalServiceScheme = 'http';
  manualHost = 'localhost';
  manualPort: number | null = null;
  logFilePath = '';

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.open && !this.busy()) this.dismiss.emit();
  }

  @HostListener('document:keydown.tab', ['$event'])
  trapFocus(event: Event): void {
    if (!this.open || !(event instanceof KeyboardEvent)) return;
    const controls = this.focusableControls();
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  busy(): boolean {
    return this.loading || this.submitting;
  }

  selectedCandidate(): ExternalServiceCandidate | undefined {
    return this.catalog.candidates.find(
      (candidate) => candidate.id === this.selectedCandidateId,
    );
  }

  filteredCandidates(): ExternalServiceCandidate[] {
    const terms = normalizeCandidateSearch(this.candidateFilter)
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) return this.catalog.candidates;

    return this.catalog.candidates.filter((candidate) => {
      const searchable = normalizeCandidateSearch([
        candidate.name,
        candidate.provider === 'docker' ? 'Docker container' : 'Processo',
        candidate.owner,
        candidate.image,
        candidate.containerId,
        candidate.host,
        candidate.port,
        candidate.pid,
      ].filter((value) => value !== null && value !== undefined).join(' '));
      return terms.every((term) => searchable.includes(term));
    });
  }

  setCandidateFilter(value: string): void {
    this.candidateFilter = value.slice(0, 120);
    if (
      this.selectedCandidateId &&
      !this.filteredCandidates().some(
        (candidate) => candidate.id === this.selectedCandidateId,
      )
    ) {
      this.selectedCandidateId = '';
      this.discoveredName = '';
      this.logFilePath = '';
    }
  }

  selectCandidate(candidate: ExternalServiceCandidate): void {
    this.selectedCandidateId = candidate.id;
    this.discoveredName = candidate.name;
    this.logFilePath = '';
  }

  setTab(tab: ExternalServiceTab): void {
    this.tab = tab;
    queueMicrotask(() => this.focusableControls()[0]?.focus());
  }

  setLogFile(filePath: string): void {
    this.logFilePath = filePath;
  }

  clearLogFile(): void {
    this.logFilePath = '';
  }

  submitDiscovered(): void {
    const candidate = this.selectedCandidate();
    if (!candidate || !this.discoveredName.trim() || this.busy()) return;
    this.addService.emit({
      workspaceId: this.workspaceId,
      candidateId: candidate.id,
      name: this.discoveredName.trim(),
      scheme: this.discoveredScheme,
      host: candidate.host,
      port: candidate.port,
      ...(candidate.provider === 'process' && this.logFilePath
        ? { logFilePath: this.logFilePath }
        : {}),
    });
  }

  submitManual(): void {
    if (!this.canSubmitManual()) return;
    this.addService.emit({
      workspaceId: this.workspaceId,
      name: this.manualName.trim(),
      scheme: this.manualScheme,
      host: this.manualHost.trim(),
      port: Number(this.manualPort),
      ...(this.logFilePath ? { logFilePath: this.logFilePath } : {}),
    });
  }

  canSubmitManual(): boolean {
    return !this.busy() &&
      !!this.manualName.trim() &&
      !!this.manualHost.trim() &&
      Number.isInteger(Number(this.manualPort)) &&
      Number(this.manualPort) >= 1 &&
      Number(this.manualPort) <= 65535;
  }

  candidateDetails(candidate: ExternalServiceCandidate): string {
    if (candidate.provider === 'docker') {
      const mapped = candidate.ports.find((port) => port.port === candidate.port);
      return `${candidate.image || 'Imagem não informada'} · ` +
        `${candidate.host}:${candidate.port}` +
        (mapped?.containerPort ? ` → container:${mapped.containerPort}` : '');
    }
    return `${candidate.owner || 'Processo local'} · PID ${candidate.pid ?? '—'} · ` +
      `${candidate.host}:${candidate.port}`;
  }

  private focusableControls(): HTMLElement[] {
    return [...(this.dialog?.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])',
    ) ?? [])];
  }
}
