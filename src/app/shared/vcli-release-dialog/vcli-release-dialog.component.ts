import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  EventEmitter, HostListener, Input, OnDestroy, Output, inject,
} from '@angular/core';
import { I18nRootDirective } from '../../core/i18n/i18n-root.directive';
import { FormsModule } from '@angular/forms';
import { GitHubAccountCatalog, VcliReleaseOptions } from '../../core/models/runner.models';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';

@Component({
  selector: 'app-vcli-release-dialog',
  standalone: true,
  imports: [FormsModule, RunnerSelectComponent],
  hostDirectives: [I18nRootDirective],
  templateUrl: './vcli-release-dialog.component.html',
  styleUrl: './vcli-release-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VcliReleaseDialogComponent implements AfterViewInit, OnDestroy {
  @Input() platform = 'darwin';
  @Input() starting = false;
  @Input() error: string | null = null;
  @Input() accounts: GitHubAccountCatalog | null = null;
  @Input() accountsLoading = false;
  @Output() refreshAccounts = new EventEmitter<void>();
  @Output() dismiss = new EventEmitter<void>();
  @Output() launch = new EventEmitter<VcliReleaseOptions>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private previousFocus?: HTMLElement;
  version = '';
  target: VcliReleaseOptions['target'] = 'all';
  mode: VcliReleaseOptions['mode'] = 'local';
  operation = 'validate';
  includeUntracked = false;
  ghUser = '';
  publicKeyFile = '';
  notesFile = '';
  readonly targets: VcliReleaseOptions['target'][] = [
    'all', 'macos-arm64', 'macos-x64', 'windows-arm64', 'windows-x64', 'linux-arm64', 'linux-x64',
  ];

  ngAfterViewInit(): void {
    this.previousFocus = document.activeElement as HTMLElement;
    this.element.nativeElement.querySelector<HTMLInputElement>('#release-version')?.focus();
  }

  ngOnDestroy(): void { this.previousFocus?.focus(); }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.starting) this.dismiss.emit();
    if (event.key !== 'Tab') return;
    const controls = [...this.element.nativeElement.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
    )].filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if ((event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }

  canLaunch(): boolean {
    return !this.starting && !this.accountsLoading &&
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(this.version.trim()) &&
      this.version.trim().length <= 40 &&
      (!this.ghUser || this.selectedAccountAvailable()) &&
      (this.platform === 'darwin' ||
        (this.mode === 'actions' && this.target !== 'all' && !this.target.startsWith('macos-')));
  }

  selectedAccountAvailable(): boolean {
    return this.selectedAccount()?.state === 'success';
  }

  selectedAccount() {
    return this.accounts?.accounts.find((account) => account.login === this.ghUser);
  }

  hasUnavailableAccounts(): boolean {
    return !!this.accounts?.accounts.some((account) => account.state !== 'success');
  }

  submit(): void {
    if (!this.canLaunch()) return;
    this.launch.emit({
      version: this.version.trim(), target: this.target, mode: this.mode,
      dryRun: this.operation === 'validate', includeUntracked: this.includeUntracked,
      ...(this.ghUser.trim() ? { ghUser: this.ghUser.trim() } : {}),
      ...(this.publicKeyFile.trim() ? { publicKeyFile: this.publicKeyFile.trim() } : {}),
      ...(this.notesFile.trim() ? { notesFile: this.notesFile.trim() } : {}),
    });
  }
}
