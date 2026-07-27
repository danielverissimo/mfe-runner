import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActionTooltipDirective } from './action-tooltip.directive';

@Component({
  standalone: true,
  imports: [ActionTooltipDirective],
  template: `
    <button class="text-action">＋ Nova workspace</button>
    <button class="icon-action" aria-label="Configurar projeto">⚙</button>
    <button class="explicit-action" title="Abrir endereço local">↗</button>
  `,
})
class TooltipHostComponent {}

describe('ActionTooltipDirective', () => {
  let fixture: ComponentFixture<TooltipHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TooltipHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(TooltipHostComponent);
    fixture.detectChanges();
  });

  it('uses readable text for labeled actions', () => {
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.text-action');

    expect(button.title).toBe('Nova workspace');
  });

  it('prefers the accessible label for icon actions', () => {
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-action');

    expect(button.title).toBe('Configurar projeto');
  });

  it('preserves an explicit contextual tooltip', () => {
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.explicit-action');

    expect(button.title).toBe('Abrir endereço local');
  });
});
