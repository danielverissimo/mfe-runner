import { ComponentFixture, TestBed } from '@angular/core/testing';
import { projectFixture } from '../../../testing/runner-fixtures';
import { NgrokStatus } from '../../core/models/runner.models';
import { NgrokDialogComponent } from './ngrok-dialog.component';

describe('NgrokDialogComponent', () => {
  let fixture: ComponentFixture<NgrokDialogComponent>;
  const status: NgrokStatus = {
    installed: true,
    available: true,
    executablePath: '/opt/homebrew/bin/ngrok',
    source: 'homebrew',
    version: '3.22.1',
    configValid: true,
    configPath: '/Users/dev/Library/Application Support/ngrok/ngrok.yml',
    message: 'ngrok disponível.',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgrokDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(NgrokDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('project', projectFixture);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('domains', [{
      id: 'rd_123',
      domain: 'app.example.com',
      description: 'App',
      createdAt: null,
      cnameTarget: 'target.ngrok.io',
      certificateStatus: 'ready',
      dnsStatus: 'ready',
      wildcard: false,
      compatible: true,
    }, {
      id: 'rd_wildcard',
      domain: '*.example.com',
      description: '',
      createdAt: null,
      cnameTarget: null,
      certificateStatus: 'none',
      dnsStatus: null,
      wildcard: true,
      compatible: false,
    }]);
    fixture.detectChanges();
  });

  it('disables wildcard domains and emits only the selected domain identity', () => {
    const options: HTMLOptionElement[] = [
      ...fixture.nativeElement.querySelectorAll('option'),
    ];
    expect(options.find((option) => option.value === 'rd_wildcard')?.disabled)
      .toBeTrue();
    spyOn(fixture.componentInstance.launch, 'emit');
    fixture.componentInstance.selectedDomainId = 'rd_123';
    fixture.componentInstance.submit();

    expect(fixture.componentInstance.launch.emit).toHaveBeenCalledOnceWith({
      domainId: 'rd_123',
      domain: 'app.example.com',
    });
  });

  it('shows CNAME instructions and domain creation billing warning', () => {
    fixture.componentInstance.selectedDomainId = 'rd_123';
    fixture.componentInstance.createExpanded = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('target.ngrok.io');
    expect(fixture.nativeElement.textContent).toContain('podem exigir plano pago');
  });

  it('accepts only a short name and emits an allowlisted domain option', () => {
    spyOn(fixture.componentInstance.createDomain, 'emit');
    fixture.componentInstance.createExpanded = true;
    fixture.componentInstance.updateDomainName('Minha-App');
    fixture.componentInstance.selectedSuffix = 'ngrok-free.dev';
    fixture.componentInstance.descriptionDraft = 'Ambiente local';
    fixture.detectChanges();

    expect(fixture.componentInstance.domainDraft).toBe('minha-app');
    expect(fixture.nativeElement.textContent).toContain(
      'minha-app.ngrok-free.dev',
    );
    fixture.componentInstance.submitCreate();
    expect(fixture.componentInstance.createDomain.emit).toHaveBeenCalledOnceWith({
      name: 'minha-app',
      suffix: 'ngrok-free.dev',
      description: 'Ambiente local',
    });

    fixture.componentInstance.updateDomainName('app.example.com');
    expect(fixture.componentInstance.canCreate()).toBeFalse();
  });

  it('marks a rejected suffix unavailable without exposing raw IPC details', () => {
    fixture.componentInstance.createExpanded = true;
    fixture.componentInstance.updateDomainName('ocupado');
    fixture.componentInstance.selectedSuffix = 'ngrok.app';
    fixture.componentRef.setInput(
      'message',
      'Este domínio não está disponível. Escolha outra opção.',
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.unavailableSuffixes.has('ngrok.app'))
      .toBeTrue();
    expect(fixture.componentInstance.selectedSuffix).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Indisponível');
  });

  it('renders API errors and missing local configuration', () => {
    fixture.componentRef.setInput('message', 'API key ausente.');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('API key ausente');

    fixture.componentRef.setInput('status', {
      ...status,
      available: false,
      configValid: false,
      message: 'Configure o ngrok.',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ngrok indisponível');
    expect(fixture.nativeElement.textContent).toContain('Abrir configurações');
  });

  it('uses light theme tokens when the app is configured as light', () => {
    fixture.nativeElement.setAttribute('data-theme', 'light');
    fixture.detectChanges();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('.dialog');
    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(dialog).color).toBe('rgb(24, 32, 51)');
  });
});
