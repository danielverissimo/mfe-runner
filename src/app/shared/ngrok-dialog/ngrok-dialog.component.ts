import {
  ChangeDetectionStrategy,
  Component,
  AfterViewInit,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunnerSelectComponent } from '../runner-select/runner-select.component';
import {
  DiscoveredProject,
  NGROK_MANAGED_DOMAIN_SUFFIXES,
  NgrokDomain,
  NgrokManagedDomainSuffix,
  NgrokStatus,
} from '../../core/models/runner.models';

export interface NgrokTunnelSelection {
  domainId: string;
  domain: string;
}

@Component({
  selector: 'app-ngrok-dialog',
  standalone: true,
  imports: [FormsModule, RunnerSelectComponent],
  templateUrl: './ngrok-dialog.component.html',
  styleUrl: './ngrok-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgrokDialogComponent implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Input() project?: DiscoveredProject;
  @Input() targetName = '';
  @Input({ required: true }) status!: NgrokStatus;
  @Input() domains: NgrokDomain[] = [];
  @Input() loading = false;
  @Input() creating = false;
  @Input() starting = false;
  @Input() message: string | null = null;
  @Output() dismiss = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();
  @Output() createDomain = new EventEmitter<{
    name: string;
    suffix: NgrokManagedDomainSuffix;
    description?: string;
  }>();
  @Output() launch = new EventEmitter<NgrokTunnelSelection>();
  @Output() openSettings = new EventEmitter<void>();
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  selectedDomainId = '';
  createExpanded = false;
  domainDraft = '';
  selectedSuffix: NgrokManagedDomainSuffix | '' = '';
  descriptionDraft = '';
  readonly domainSuffixes = NGROK_MANAGED_DOMAIN_SUFFIXES;
  readonly unavailableSuffixes = new Set<NgrokManagedDomainSuffix>();

  ngAfterViewInit(): void {
    queueMicrotask(() => this.focusFirstControl());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue && !changes['open']?.previousValue) {
      this.selectedDomainId = '';
      this.createExpanded = false;
      this.domainDraft = '';
      this.selectedSuffix = '';
      this.descriptionDraft = '';
      this.unavailableSuffixes.clear();
    }
    if (changes['domains'] && !this.selectedDomain()) {
      this.selectedDomainId = '';
    }
    if (changes['domains']) {
      const owned = this.ownedDraftDomain();
      if (owned) {
        this.selectedDomainId = owned.id;
        this.createExpanded = false;
      }
    }
    if (
      changes['message']?.currentValue &&
      this.selectedSuffix &&
      /não está disponível/i.test(changes['message'].currentValue)
    ) {
      this.unavailableSuffixes.add(this.selectedSuffix);
      this.selectedSuffix = '';
    }
  }

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

  compatibleDomains(): NgrokDomain[] {
    return this.domains.filter((domain) => domain.compatible);
  }

  selectedDomain(): NgrokDomain | undefined {
    return this.compatibleDomains().find(
      (domain) => domain.id === this.selectedDomainId,
    );
  }

  busy(): boolean {
    return this.loading || this.creating || this.starting;
  }

  canCreate(): boolean {
    return !this.busy() && this.validDomainName() && !!this.selectedSuffix;
  }

  updateDomainName(value: string): void {
    this.domainDraft = value.toLowerCase();
    this.selectedSuffix = '';
    this.unavailableSuffixes.clear();
  }

  validDomainName(): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      this.domainDraft.trim().toLowerCase(),
    );
  }

  candidateDomain(suffix: NgrokManagedDomainSuffix): string {
    return `${this.domainDraft.trim().toLowerCase()}.${suffix}`;
  }

  ownedDomain(suffix: NgrokManagedDomainSuffix): NgrokDomain | undefined {
    const candidate = this.candidateDomain(suffix);
    return this.domains.find((domain) =>
      domain.compatible && domain.domain === candidate
    );
  }

  submitCreate(): void {
    if (!this.canCreate()) return;
    this.createDomain.emit({
      name: this.domainDraft.trim().toLowerCase(),
      suffix: this.selectedSuffix as NgrokManagedDomainSuffix,
      ...(this.descriptionDraft.trim()
        ? { description: this.descriptionDraft.trim() }
        : {}),
    });
  }

  private ownedDraftDomain(): NgrokDomain | undefined {
    if (!this.selectedSuffix || !this.validDomainName()) return undefined;
    return this.ownedDomain(this.selectedSuffix);
  }

  submit(): void {
    const domain = this.selectedDomain();
    if (!domain || this.busy()) return;
    this.launch.emit({ domainId: domain.id, domain: domain.domain });
  }

  private focusFirstControl(): void {
    this.focusableControls()[0]?.focus();
  }

  private focusableControls(): HTMLElement[] {
    return [...(this.dialog?.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled])',
    ) ?? [])];
  }
}
