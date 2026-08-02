import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectSettingsDialogComponent } from './project-settings-dialog.component';
import {
  projectFixture,
  snapshotFixture,
} from '../../../testing/runner-fixtures';

describe('ProjectSettingsDialogComponent', () => {
  let fixture: ComponentFixture<ProjectSettingsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectSettingsDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ProjectSettingsDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput(
      'workspace',
      snapshotFixture.workspaces[0].workspace,
    );
    fixture.componentRef.setInput('project', projectFixture);
    fixture.componentRef.setInput('nodeVersions', {
      detected: true,
      manager: 'nvm-sh',
      versions: ['24.15.0', '22.12.0'],
      message: '2 versões encontradas.',
    });
    fixture.detectChanges();
  });

  it('shows only Runner-owned project settings and discovered context', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain(projectFixture.displayName);
    expect(text).toContain('Comando padrão');
    expect(text).toContain('Runtime Node.js');
    expect(text).toContain('Ordem de inicialização');
    expect(text).toContain('Nenhum arquivo do projeto será alterado');
  });

  it('emits the command and explicit Node version selected for the project', () => {
    spyOn(fixture.componentInstance.saveSettings, 'emit');
    fixture.componentInstance.defaultScript = 'start';
    fixture.componentInstance.runtimeMode = 'explicit';
    fixture.componentInstance.nodeVersion = '22.12.0';

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.saveSettings.emit).toHaveBeenCalledWith({
      defaultCommandId: 'node:script:start',
      defaultScript: 'start',
      nodePolicy: { mode: 'explicit', version: '22.12.0' },
      executionPolicies: {
        node: {
          runtime: { mode: 'explicit', version: '22.12.0' },
        },
      },
      libraryLinkScripts: {},
      startupOrder: projectFixture.startupOrder,
      healthCheck: {
        type: 'tcp',
        port: projectFixture.port!,
      },
    });
  });

  it('preserves a project command override after discovery', () => {
    fixture.componentRef.setInput('workspace', {
      ...snapshotFixture.workspaces[0].workspace,
      projectOverrides: {
        [projectFixture.id]: {
          defaultCommandId: 'node:script:test',
          defaultScript: 'test',
        },
      },
    });
    fixture.detectChanges();

    const commandSelect: HTMLSelectElement =
      fixture.nativeElement.querySelector('select[name="defaultCommandId"]');

    expect(fixture.componentInstance.defaultScript).toBe('test');
    expect(fixture.componentInstance.defaultCommandId)
      .toBe('node:script:test');
    expect(commandSelect.disabled).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain(
      'comando foi descoberto estaticamente pelo adaptador Node.js',
    );
  });

  it('closes the project settings modal with Escape', () => {
    spyOn(fixture.componentInstance.dismiss, 'emit');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismiss.emit).toHaveBeenCalledOnceWith();
  });

  it('uses light theme tokens for modal surfaces and controls', () => {
    fixture.nativeElement.setAttribute('data-theme', 'light');
    fixture.detectChanges();

    const dialog: HTMLElement = fixture.nativeElement.querySelector('.dialog');
    const section: HTMLElement = fixture.nativeElement.querySelector('.form-section');
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="startupOrder"]',
    );

    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(dialog).color).toBe('rgb(24, 32, 51)');
    expect(getComputedStyle(section).backgroundColor).toBe('rgb(238, 241, 246)');
    expect(getComputedStyle(input).backgroundColor).not.toBe('rgb(9, 13, 20)');
  });
});
