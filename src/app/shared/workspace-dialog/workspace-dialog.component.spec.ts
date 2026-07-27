import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkspaceDialogComponent } from './workspace-dialog.component';
import { snapshotFixture } from '../../../testing/runner-fixtures';

describe('WorkspaceDialogComponent', () => {
  let fixture: ComponentFixture<WorkspaceDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkspaceDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('nodeVersions', {
      detected: true,
      manager: 'nvm-sh',
      versions: ['24.15.0'],
      message: '1 versão instalada.',
    });
    fixture.detectChanges();
  });

  it('requires a shell and at least one MFE path', () => {
    fixture.componentInstance.name = 'Workspace';
    fixture.componentInstance.shellRootPath = '/workspace/shell';
    expect(fixture.componentInstance.valid()).toBeFalse();
    fixture.componentInstance.setMfePath(0, '/workspace/mfes');
    expect(fixture.componentInstance.valid()).toBeTrue();
  });

  it('supports multiple dynamic MFE paths and emits one workspace input', () => {
    spyOn(fixture.componentInstance.saveWorkspace, 'emit');
    fixture.componentInstance.name = 'Workspace';
    fixture.componentInstance.shellRootPath = '/workspace/shell';
    fixture.componentInstance.setMfePath(0, '/workspace/mfes-a');
    fixture.componentInstance.addMfePath();
    fixture.componentInstance.setMfePath(1, '/workspace/mfes-b');
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.saveWorkspace.emit).toHaveBeenCalledWith({
      name: 'Workspace',
      shellRootPath: '/workspace/shell',
      mfeRootPaths: ['/workspace/mfes-a', '/workspace/mfes-b'],
      libraries: [],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
    });
  });

  it('adds an inspected library without accepting paths inferred by the renderer', () => {
    spyOn(fixture.componentInstance.browseLibrary, 'emit');
    fixture.componentInstance.addLibrary();
    fixture.componentInstance.setLibraryInspection(
      0,
      {
        rootPath: '/workspace/web-common',
        angularProject: 'web-common-lib',
        packageName: 'web-common-lib',
        scripts: ['watch', 'build'],
        developmentScript: 'watch',
        artifactRelativePath: 'dist/web-common-lib',
        preferredLinkScript: 'link:web-common',
      },
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.libraries[0]).toEqual(jasmine.objectContaining({
      rootPath: '/workspace/web-common',
      developmentScript: 'watch',
      artifactRelativePath: 'dist/web-common-lib',
      preferredLinkScript: 'link:web-common',
    }));
  });

  it('loads an existing workspace for editing', () => {
    fixture.componentRef.setInput(
      'workspace',
      snapshotFixture.workspaces[0].workspace,
    );
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.shellRootPath).toBe('/workspace/plataforma');
    expect(fixture.componentInstance.mfeRootPaths).toEqual(['/workspace/mfes']);
  });

  it('sends each existing path when opening its native directory picker', () => {
    spyOn(fixture.componentInstance.browseShell, 'emit');
    spyOn(fixture.componentInstance.browseMfe, 'emit');
    fixture.componentInstance.shellRootPath = '/workspace/plataforma';
    fixture.componentInstance.setMfePath(0, '/workspace/mfes');
    fixture.detectChanges();
    const chooseButtons: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('.path-field button:first-of-type'),
    ];
    chooseButtons[0].click();
    chooseButtons[1].click();
    expect(fixture.componentInstance.browseShell.emit)
      .toHaveBeenCalledOnceWith('/workspace/plataforma');
    expect(fixture.componentInstance.browseMfe.emit).toHaveBeenCalledOnceWith({
      index: 0,
      initialPath: '/workspace/mfes',
    });
  });

  it('closes the modal with Escape only while it is open', () => {
    spyOn(fixture.componentInstance.dismiss, 'emit');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismiss.emit).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismiss.emit).toHaveBeenCalledTimes(1);
  });
});
