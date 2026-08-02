import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExternalServiceDialogComponent } from './external-service-dialog.component';

describe('ExternalServiceDialogComponent', () => {
  let fixture: ComponentFixture<ExternalServiceDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExternalServiceDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ExternalServiceDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('workspaceId', 'workspace-1');
    fixture.componentRef.setInput('catalog', {
      candidates: [{
        id: 'docker:container-1:4310',
        provider: 'docker',
        name: 'api',
        host: 'localhost',
        port: 4310,
        pid: null,
        containerId: 'container-1',
        image: 'api:latest',
        canTerminate: true,
        ports: [{ host: 'localhost', port: 4310, containerPort: 8080 }],
      }],
      docker: { available: true, message: '1 container encontrado.' },
      processMessage: null,
    });
    fixture.detectChanges();
  });

  it('imports a discovered Docker port using only the candidate identity', () => {
    const component = fixture.componentInstance;
    spyOn(component.addService, 'emit');
    component.selectCandidate(component.catalog.candidates[0]);
    component.discoveredScheme = 'https';
    component.submitDiscovered();

    expect(component.addService.emit).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      candidateId: 'docker:container-1:4310',
      name: 'api',
      scheme: 'https',
      host: 'localhost',
      port: 4310,
    });
    expect(fixture.nativeElement.textContent).toContain('container:8080');
  });

  it('supports manual HTTPS services and an optional chosen log file', () => {
    const component = fixture.componentInstance;
    spyOn(component.addService, 'emit');
    component.setTab('manual');
    component.manualName = 'Remote API';
    component.manualScheme = 'https';
    component.manualHost = 'api.internal';
    component.manualPort = 8443;
    component.setLogFile('/tmp/application.log');
    component.submitManual();

    expect(component.addService.emit).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      name: 'Remote API',
      scheme: 'https',
      host: 'api.internal',
      port: 8443,
      logFilePath: '/tmp/application.log',
    });
  });

  it('filters discovered processes by name, provider, host and port', async () => {
    fixture.componentRef.setInput('catalog', {
      candidates: [
        fixture.componentInstance.catalog.candidates[0],
        {
          id: 'process:123:5000',
          provider: 'process',
          name: 'ControlCenter',
          host: '127.0.0.1',
          port: 5000,
          pid: 123,
          owner: 'developer',
          canTerminate: true,
          ports: [{ host: '127.0.0.1', port: 5000 }],
        },
      ],
      docker: { available: true, message: '1 container encontrado.' },
      processMessage: null,
    });
    const search: HTMLInputElement = fixture.nativeElement.querySelector(
      '.candidate-search input',
    );
    search.value = 'processo 5000';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const candidates: HTMLElement[] = [
      ...fixture.nativeElement.querySelectorAll('.candidate'),
    ];
    expect(candidates.length).toBe(1);
    expect(candidates[0].textContent).toContain('ControlCenter');

    search.value = 'inexistente';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent)
      .toContain('Nenhum processo ou container corresponde ao filtro');
  });

  it('explains IntelliJ log limitations and uses light theme tokens', () => {
    const tabs = fixture.nativeElement.querySelectorAll('.tabs button') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();
    fixture.nativeElement.setAttribute('data-theme', 'light');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'configure a aplicação para gravar os logs em arquivo',
    );
    const dialog: HTMLElement = fixture.nativeElement.querySelector('.dialog');
    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)');
  });
});
