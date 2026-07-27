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
    expect(text).toContain('Política de Node');
    expect(text).toContain('Nenhum arquivo do projeto será alterado');
  });

  it('emits the command and explicit Node version selected for the project', () => {
    spyOn(fixture.componentInstance.saveSettings, 'emit');
    fixture.componentInstance.defaultScript = 'start';
    fixture.componentInstance.nodeMode = 'explicit';
    fixture.componentInstance.nodeVersion = '22.12.0';

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.saveSettings.emit).toHaveBeenCalledWith({
      defaultScript: 'start',
      nodePolicy: { mode: 'explicit', version: '22.12.0' },
      libraryLinkScripts: {},
    });
  });

  it('preserves a project command override after discovery', () => {
    fixture.componentRef.setInput('workspace', {
      ...snapshotFixture.workspaces[0].workspace,
      projectOverrides: {
        [projectFixture.id]: { defaultScript: 'test' },
      },
    });
    fixture.detectChanges();

    const commandSelect: HTMLSelectElement =
      fixture.nativeElement.querySelector('select[name="defaultScript"]');

    expect(fixture.componentInstance.defaultScript).toBe('test');
    expect(commandSelect.disabled).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain(
      'npm run start` é priorizado',
    );
  });

  it('closes the project settings modal with Escape', () => {
    spyOn(fixture.componentInstance.dismiss, 'emit');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismiss.emit).toHaveBeenCalledOnceWith();
  });
});
