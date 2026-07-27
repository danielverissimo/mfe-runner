import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18nRootDirective } from './i18n-root.directive';
import { I18nService } from './i18n.service';

@Component({
  standalone: true,
  imports: [I18nRootDirective],
  template: `
    <main appI18nRoot>
      <h1>Projetos</h1>
      <button aria-label="Limpar">Limpar</button>
      <code>Limpar</code>
    </main>
  `,
})
class TestHostComponent {}

describe('I18nRootDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let i18n: I18nService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [TestHostComponent] })
      .compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    i18n = TestBed.inject(I18nService);
    fixture.detectChanges();
  });

  it('translates copy and accessible attributes while preserving code', () => {
    i18n.setLanguage('en');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Projects');
    expect(fixture.nativeElement.querySelector('button').textContent).toBe('Clear');
    expect(fixture.nativeElement.querySelector('button').ariaLabel).toBe('Clear');
    expect(fixture.nativeElement.querySelector('code').textContent).toBe('Limpar');
  });

  it('can switch repeatedly and restore Brazilian Portuguese', () => {
    const heading = fixture.nativeElement.querySelector('h1');

    i18n.setLanguage('en');
    fixture.detectChanges();
    expect(heading.textContent).toBe('Projects');

    i18n.setLanguage('fr');
    fixture.detectChanges();
    expect(heading.textContent).toBe('Projets');

    i18n.setLanguage('pt-BR');
    fixture.detectChanges();
    expect(heading.textContent).toBe('Projetos');
  });
});
