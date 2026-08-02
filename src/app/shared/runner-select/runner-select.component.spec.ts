import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RunnerSelectComponent } from './runner-select.component';

@Component({
  standalone: true,
  imports: [FormsModule, RunnerSelectComponent],
  template: `
    <app-runner-select
      name="choice"
      ariaLabel="Escolha"
      ariaDescribedBy="choice-help"
      [size]="size"
      [disabled]="disabled"
      [autofocus]="autofocus"
      [(ngModel)]="value"
    >
      <option value="">Selecione</option>
      @for (option of options; track option.value) {
        <option [value]="option.value" [disabled]="option.disabled">
          {{ option.label }}
        </option>
      }
    </app-runner-select>
  `,
})
class TestHostComponent {
  value = 'one';
  size: 'default' | 'compact' = 'default';
  disabled = false;
  autofocus = false;
  options = [
    { value: 'one', label: 'Primeira', disabled: false },
    { value: 'two', label: 'Segunda', disabled: true },
  ];
}

describe('RunnerSelectComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  const getMenu = (): HTMLElement => {
    const component: RunnerSelectComponent = fixture.debugElement.children[0]
      .componentInstance;
    return document.getElementById(component.listboxId) as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => delete document.documentElement.dataset['theme']);

  it('projects options and synchronizes ngModel changes', async () => {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('one');
    expect(select.options[2].disabled).toBeTrue();

    select.value = 'two';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.value).toBe('two');
  });

  it('keeps the selected value after projected options change', async () => {
    fixture.componentInstance.value = 'three';
    fixture.componentInstance.options = [
      ...fixture.componentInstance.options,
      { value: 'three', label: 'Terceira', disabled: false },
    ];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('three');
  });

  it('forwards disabled and accessibility attributes', () => {
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    expect(select.disabled).toBeTrue();
    expect(select.name).toBe('choice');
    expect(trigger.disabled).toBeTrue();
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-label')).toBe('Escolha');
    expect(trigger.getAttribute('aria-describedby')).toBe('choice-help');
  });

  it('marks the control as touched when the trigger loses focus', () => {
    const component: RunnerSelectComponent = fixture.debugElement.children[0]
      .componentInstance;
    const touched = jasmine.createSpy('touched');
    component.registerOnTouched(touched);

    fixture.nativeElement.querySelector('.runner-select__trigger')
      .dispatchEvent(new Event('blur'));

    expect(touched).toHaveBeenCalledTimes(1);
  });

  it('renders the normal and compact visual variants', () => {
    const host: HTMLElement = fixture.nativeElement.querySelector('app-runner-select');
    let indicator: HTMLElement = fixture.nativeElement.querySelector(
      '.runner-select__indicator',
    );
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    expect(getComputedStyle(trigger).fontSize).toBe('12px');
    expect(getComputedStyle(indicator).width).toBe('32px');
    expect(getComputedStyle(indicator).height).toBe('26px');
    expect(getComputedStyle(indicator).right).toBe('14px');

    fixture.componentInstance.size = 'compact';
    fixture.detectChanges();
    indicator = fixture.nativeElement.querySelector('.runner-select__indicator');
    expect(host.classList).toContain('runner-select--compact');
    expect(getComputedStyle(trigger).fontSize).toBe('11px');
    expect(getComputedStyle(indicator).width).toBe('30px');
    expect(getComputedStyle(indicator).height).toBe('24px');
  });

  it('uses semantic colors in light and dark themes', () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    document.documentElement.dataset['theme'] = 'light';
    fixture.detectChanges();
    const lightBackground = getComputedStyle(trigger).backgroundColor;

    document.documentElement.dataset['theme'] = 'dark';
    fixture.detectChanges();
    const darkBackground = getComputedStyle(trigger).backgroundColor;

    expect(lightBackground).toBe('rgb(247, 248, 251)');
    expect(darkBackground).toBe('rgb(10, 15, 23)');
  });

  it('carries locally scoped theme tokens into the portaled listbox', () => {
    const host: HTMLElement = fixture.nativeElement.querySelector('app-runner-select');
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    const menu = getMenu();
    host.style.setProperty('--runner-control-raised', '#ffffff');
    host.style.setProperty('--runner-text-secondary', '#344054');
    host.style.setProperty('--runner-border', '#ccd3df');

    trigger.click();
    fixture.detectChanges();

    expect(getComputedStyle(menu).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(menu).color).toBe('rgb(52, 64, 84)');
    expect(getComputedStyle(menu).borderColor).toBe('rgb(204, 211, 223)');
  });

  it('keeps the portaled listbox light when a local light theme overrides a dark root', () => {
    document.documentElement.dataset['theme'] = 'dark';
    const host: HTMLElement = fixture.nativeElement.querySelector(
      'app-runner-select',
    );
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    const menu = getMenu();
    host.setAttribute('data-theme', 'light');
    fixture.detectChanges();

    trigger.click();
    fixture.detectChanges();

    expect(getComputedStyle(trigger).backgroundColor).not.toBe('rgb(10, 15, 23)');
    expect(getComputedStyle(menu).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(menu).color).toBe('rgb(52, 64, 84)');
  });

  it('focuses the combobox trigger when autofocus is enabled', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.autofocus = true;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('.runner-select__trigger'),
    );
  });

  it('opens a custom listbox below the trigger on the first click', async () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    const menu = getMenu();
    spyOn(trigger, 'getBoundingClientRect').and.returnValue({
      x: 120,
      y: 40,
      top: 40,
      right: 420,
      bottom: 80,
      left: 120,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    });

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBeFalse();
    expect(menu.style.top).toBe('86px');
    expect(menu.style.left).toBe('120px');
    expect(menu.style.width).toBe('300px');
    expect(menu.querySelectorAll('[role="option"]').length).toBe(3);
  });

  it('keeps the listbox open while its own options are scrolled', async () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    const menu = getMenu();

    trigger.click();
    fixture.detectChanges();
    menu.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(menu.hidden).toBeFalse();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('selects an option from the custom listbox', async () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    trigger.click();
    fixture.detectChanges();

    const menu = getMenu();
    const options: HTMLElement[] = Array.from(menu.querySelectorAll('.runner-select__option'));
    options[0].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.value).toBe('');
    expect(trigger.textContent).toContain('Selecione');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBeTrue();
  });

  it('keeps the listbox closed after the selected value propagates', async () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    const menu = getMenu();
    trigger.click();
    fixture.detectChanges();

    const options: HTMLElement[] = Array.from(menu.querySelectorAll('.runner-select__option'));
    options[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.value).toBe('');
    expect(menu.hidden).toBeTrue();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the custom listbox when clicking outside', async () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    const menu = getMenu();
    trigger.click();
    fixture.detectChanges();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(menu.hidden).toBeTrue();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('supports keyboard selection and skips disabled options', async () => {
    fixture.componentInstance.options = [
      ...fixture.componentInstance.options,
      { value: 'three', label: 'Terceira', disabled: false },
    ];
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.runner-select__trigger',
    );
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.value).toBe('three');
    expect(trigger.textContent).toContain('Terceira');
  });
});
