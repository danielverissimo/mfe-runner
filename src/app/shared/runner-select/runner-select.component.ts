import {
  AfterContentChecked,
  AfterViewInit,
  booleanAttribute,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { RunnerIconComponent } from '../runner-icon/runner-icon.component';

export type RunnerSelectSize = 'default' | 'compact';

interface RunnerSelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

@Component({
  selector: 'app-runner-select',
  standalone: true,
  imports: [RunnerIconComponent],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => RunnerSelectComponent),
    multi: true,
  }],
  templateUrl: './runner-select.component.html',
  styleUrl: './runner-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.runner-select--compact]': "size === 'compact'",
    '[class.runner-select--disabled]': 'effectiveDisabled',
    '[class.runner-select--open]': 'open',
  },
})
export class RunnerSelectComponent
  implements ControlValueAccessor, AfterViewInit, AfterContentChecked, OnDestroy {
  private static nextId = 0;
  private static readonly menuThemeTokens = [
    '--runner-border',
    '--runner-control-raised',
    '--runner-primary',
    '--runner-primary-bright',
    '--runner-text',
    '--runner-text-secondary',
  ];

  @ViewChild('nativeSelect', { static: true })
  private readonly nativeSelect!: ElementRef<HTMLSelectElement>;

  @ViewChild('trigger', { static: true })
  private readonly trigger!: ElementRef<HTMLButtonElement>;

  @ViewChild('menu', { static: true })
  private readonly menu!: ElementRef<HTMLElement>;

  private readonly instanceId = RunnerSelectComponent.nextId++;
  private readonly optionObserver: MutationObserver;
  private inputValue: string | null = '';
  private formDisabled = false;
  private optionsSignature = '';
  private typeahead = '';
  private typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly listboxId = `runner-select-listbox-${this.instanceId}`;
  optionItems: RunnerSelectOption[] = [];
  currentValue = '';
  activeIndex = -1;
  open = false;
  menuTop = 0;
  menuLeft = 0;
  menuWidth = 0;
  menuMaxHeight = 240;

  constructor(
    private readonly changeDetector: ChangeDetectorRef,
    private readonly zone: NgZone,
    private readonly hostElement: ElementRef<HTMLElement>,
  ) {
    this.optionObserver = new MutationObserver(() => {
      this.zone.run(() => {
        this.refreshOptions();
        this.changeDetector.markForCheck();
      });
    });
  }

  @Input()
  get value(): string | null {
    return this.inputValue;
  }

  set value(value: string | null) {
    this.inputValue = value;
    this.setCurrentValue(value);
  }

  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) autofocus = false;
  @Input() name: string | null = null;
  @Input() id: string | null = null;
  @Input() ariaLabel: string | null = null;
  @Input() ariaDescribedBy: string | null = null;
  @Input() size: RunnerSelectSize = 'default';
  @Output() valueChange = new EventEmitter<string>();

  get effectiveDisabled(): boolean {
    return this.disabled || this.formDisabled;
  }

  get selectedLabel(): string {
    return this.optionItems.find((option) => option.value === this.currentValue)?.label
      ?? this.currentValue;
  }

  get activeOptionId(): string | null {
    return this.open && this.activeIndex >= 0
      ? this.getOptionId(this.activeIndex)
      : null;
  }

  ngAfterViewInit(): void {
    this.refreshOptions();
    this.syncNativeValue();
    this.optionObserver.observe(this.nativeSelect.nativeElement, {
      attributes: true,
      attributeFilter: ['disabled', 'label', 'value'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    document.body.appendChild(this.menu.nativeElement);
    this.syncMenuTheme();
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.addEventListener('scroll', this.handleDocumentScroll, true);
    window.addEventListener('resize', this.handleWindowResize);

    if (this.autofocus && !this.effectiveDisabled) {
      queueMicrotask(() => this.trigger.nativeElement.focus());
    }
  }

  ngAfterContentChecked(): void {
    this.refreshOptions();
    this.syncNativeValue();
    if (this.effectiveDisabled && this.open) {
      this.closeMenu();
    }
  }

  ngOnDestroy(): void {
    this.optionObserver.disconnect();
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.removeEventListener('scroll', this.handleDocumentScroll, true);
    window.removeEventListener('resize', this.handleWindowResize);
    this.menu.nativeElement.remove();
    if (this.typeaheadTimer) {
      clearTimeout(this.typeaheadTimer);
    }
  }

  handleNativeChange(event: Event): void {
    this.commitValue((event.target as HTMLSelectElement).value);
  }

  handleTriggerClick(): void {
    if (this.open) {
      this.closeMenu();
      return;
    }
    this.openMenu();
  }

  handleTriggerKeydown(event: KeyboardEvent): void {
    if (this.effectiveDisabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open) this.openMenu();
        else this.moveActiveOption(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open) this.openMenu(true);
        else this.moveActiveOption(-1);
        break;
      case 'Home':
        if (!this.open) return;
        event.preventDefault();
        this.activeIndex = this.findEnabledOption(0, 1);
        break;
      case 'End':
        if (!this.open) return;
        event.preventDefault();
        this.activeIndex = this.findEnabledOption(this.optionItems.length - 1, -1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!this.open) this.openMenu();
        else if (this.activeIndex >= 0) this.selectOption(this.activeIndex);
        break;
      case 'Escape':
        if (!this.open) return;
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu();
        break;
      case 'Tab':
        this.closeMenu(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.handleTypeahead(event.key);
        }
    }
  }

  handleTriggerBlur(): void {
    this.onTouched();
  }

  selectOption(index: number): void {
    const option = this.optionItems[index];
    if (!option || option.disabled) return;

    this.commitValue(option.value);
    this.closeMenu(false);
    queueMicrotask(() => {
      if (!this.menu.nativeElement.isConnected) return;
      this.closeMenu(false);
      this.trigger.nativeElement.focus();
    });
  }

  setActiveIndex(index: number): void {
    if (!this.optionItems[index]?.disabled) {
      this.activeIndex = index;
    }
  }

  getOptionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }

  writeValue(value: unknown): void {
    this.setCurrentValue(typeof value === 'string' ? value : '');
  }

  registerOnChange(callback: (value: string) => void): void {
    this.onChange = callback;
  }

  registerOnTouched(callback: () => void): void {
    this.onTouched = callback;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled = disabled;
    if (disabled) this.closeMenu();
    this.changeDetector.markForCheck();
  }

  focus(): void {
    this.trigger.nativeElement.focus();
  }

  private readonly handleDocumentScroll = (event: Event): void => {
    const menu = this.menu?.nativeElement;
    const target = event.target;
    if (menu && target instanceof Node && (target === menu || menu.contains(target))) {
      return;
    }
    if (this.open) this.zone.run(() => this.closeMenu(false));
  };

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.open) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.trigger.nativeElement.contains(target) || this.menu.nativeElement.contains(target)) {
      return;
    }
    this.zone.run(() => this.closeMenu(false));
  };

  private readonly handleWindowResize = (): void => {
    if (this.open) this.zone.run(() => this.closeMenu(false));
  };

  private openMenu(preferLast = false): void {
    this.refreshOptions();
    if (this.effectiveDisabled || this.optionItems.length === 0) return;

    this.syncMenuTheme();
    this.positionMenu();
    const selectedIndex = this.optionItems.findIndex(
      (option) => option.value === this.currentValue && !option.disabled,
    );
    this.activeIndex = selectedIndex >= 0
      ? selectedIndex
      : this.findEnabledOption(preferLast ? this.optionItems.length - 1 : 0, preferLast ? -1 : 1);

    const menu = this.menu.nativeElement;
    menu.hidden = false;
    this.open = true;
    this.changeDetector.markForCheck();
    queueMicrotask(() => this.scrollActiveOptionIntoView());
  }

  private closeMenu(restoreFocus = true): void {
    const menu = this.menu?.nativeElement;
    if (menu) menu.hidden = true;
    this.open = false;
    this.activeIndex = -1;
    this.changeDetector.markForCheck();
    if (restoreFocus && document.activeElement !== this.trigger?.nativeElement) {
      this.trigger?.nativeElement.focus();
    }
  }

  private positionMenu(): void {
    const rect = this.trigger.nativeElement.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 6;
    const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
    this.menuWidth = Math.min(rect.width, availableWidth);
    this.menuLeft = Math.min(
      Math.max(rect.left, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - this.menuWidth - viewportPadding),
    );
    this.menuTop = rect.bottom + gap;
    this.menuMaxHeight = Math.max(
      80,
      Math.min(280, window.innerHeight - this.menuTop - viewportPadding),
    );
  }

  private syncMenuTheme(): void {
    const hostStyles = getComputedStyle(this.hostElement.nativeElement);
    const menu = this.menu.nativeElement;
    for (const token of RunnerSelectComponent.menuThemeTokens) {
      menu.style.setProperty(token, hostStyles.getPropertyValue(token));
    }
    menu.style.colorScheme = hostStyles.colorScheme;
  }

  private moveActiveOption(direction: 1 | -1): void {
    if (this.optionItems.length === 0) return;
    const start = this.activeIndex < 0
      ? (direction === 1 ? 0 : this.optionItems.length - 1)
      : this.activeIndex + direction;
    const next = this.findEnabledOption(start, direction, true);
    if (next >= 0) {
      this.activeIndex = next;
      this.changeDetector.markForCheck();
      queueMicrotask(() => this.scrollActiveOptionIntoView());
    }
  }

  private findEnabledOption(start: number, direction: 1 | -1, wrap = false): number {
    if (this.optionItems.length === 0) return -1;
    let index = start;
    let inspected = 0;
    while (inspected < this.optionItems.length) {
      if (index < 0 || index >= this.optionItems.length) {
        if (!wrap) return -1;
        index = direction === 1 ? 0 : this.optionItems.length - 1;
      }
      if (!this.optionItems[index].disabled) return index;
      index += direction;
      inspected += 1;
    }
    return -1;
  }

  private handleTypeahead(character: string): void {
    this.typeahead += character.toLocaleLowerCase();
    if (this.typeaheadTimer) clearTimeout(this.typeaheadTimer);
    this.typeaheadTimer = setTimeout(() => {
      this.typeahead = '';
      this.typeaheadTimer = null;
    }, 600);

    const match = this.optionItems.findIndex((option) =>
      !option.disabled && option.label.toLocaleLowerCase().startsWith(this.typeahead));
    if (match < 0) return;
    if (!this.open) this.openMenu();
    this.activeIndex = match;
    this.changeDetector.markForCheck();
    queueMicrotask(() => this.scrollActiveOptionIntoView());
  }

  private scrollActiveOptionIntoView(): void {
    if (this.activeIndex < 0) return;
    const menu = this.menu.nativeElement;
    const option = document.getElementById(this.getOptionId(this.activeIndex));
    if (!option) return;

    const optionTop = option.offsetTop;
    const optionBottom = optionTop + option.offsetHeight;
    if (optionTop < menu.scrollTop) {
      menu.scrollTop = optionTop;
    } else if (optionBottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = optionBottom - menu.clientHeight;
    }
  }

  private commitValue(value: string): void {
    this.inputValue = value;
    this.currentValue = value;
    this.syncNativeValue();
    this.valueChange.emit(value);
    this.onChange(value);
    this.changeDetector.markForCheck();
  }

  private setCurrentValue(value: string | null): void {
    this.currentValue = value ?? '';
    this.syncNativeValue();
    this.changeDetector.markForCheck();
  }

  private refreshOptions(): void {
    const select = this.nativeSelect?.nativeElement;
    if (!select) return;

    const nextOptions = Array.from(select.options).map((option) => ({
      value: option.value,
      label: (option.label || option.textContent || '').trim(),
      disabled: option.disabled,
    }));
    const signature = JSON.stringify(nextOptions);
    if (signature === this.optionsSignature) return;

    this.optionsSignature = signature;
    this.optionItems = nextOptions;
    this.syncNativeValue();
    this.changeDetector.markForCheck();
  }

  private syncNativeValue(): void {
    const select = this.nativeSelect?.nativeElement;
    if (select && select.value !== this.currentValue) {
      select.value = this.currentValue;
    }
  }
}
