import { TestBed } from '@angular/core/testing';
import { I18nService, normalizeLanguage } from './i18n.service';

describe('I18nService', () => {
  beforeEach(() => localStorage.clear());

  it('normalizes the four supported locale families', () => {
    expect(normalizeLanguage('pt-BR')).toBe('pt-BR');
    expect(normalizeLanguage('es-MX')).toBe('es');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('fr-FR')).toBe('fr');
    expect(normalizeLanguage('de-DE')).toBeNull();
  });

  it('translates known copy and persists the selected language', () => {
    const service = TestBed.inject(I18nService);
    service.setLanguage('en');

    expect(service.translate('Projetos')).toBe('Projects');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('mfe-runner.language')).toBe('en');
  });

  it('keeps technical and unknown content unchanged', () => {
    const service = TestBed.inject(I18nService);
    service.setLanguage('fr');

    expect(service.translate('npm run start')).toBe('npm run start');
  });

  it('translates the external-service flow in every secondary language', () => {
    const service = TestBed.inject(I18nService);

    expect(service.translate('Vincular serviço externo', 'es'))
      .toBe('Vincular servicio externo');
    expect(service.translate('Vincular serviço externo', 'en'))
      .toBe('Link external service');
    expect(service.translate('Vincular serviço externo', 'fr'))
      .toBe('Associer un service externe');
    expect(service.translate('Identidade alterada', 'en'))
      .toBe('Identity changed');
  });
});
