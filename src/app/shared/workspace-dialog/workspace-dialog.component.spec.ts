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

  it('requires at least one inspected and classified project source', () => {
    fixture.componentInstance.name = 'Workspace';
    expect(fixture.componentInstance.valid()).toBeFalse();
    const index = fixture.componentInstance.beginInspection('/workspace/app');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/app',
      sourceType: 'project',
      warnings: [],
      projects: [{
        name: 'app',
        relativePath: '.',
        technology: 'Node.js',
        suggestedKind: 'project',
        evidence: ['package.json', 'Script executável'],
        capabilities: [],
        scripts: ['start'],
        localLinkSuggestion: null,
      }],
    });
    expect(fixture.componentInstance.valid()).toBeTrue();
  });

  it('shows live scan progress while a path is being inspected', () => {
    const index = fixture.componentInstance.beginInspection('/workspace/root');
    fixture.componentInstance.setInspectionProgress(index, {
      requestId: 'scan-1',
      phase: 'scanning',
      percent: 42,
      directoriesScanned: 37,
      projectsFound: 3,
      currentPath: 'apps/checkout',
    });
    fixture.detectChanges();

    const progress = fixture.nativeElement.querySelector(
      '[role="progressbar"]',
    ) as HTMLElement;
    expect(progress.getAttribute('aria-valuenow')).toBe('42');
    expect(fixture.nativeElement.textContent)
      .toContain('37 diretório(s) analisado(s)');
    expect(fixture.nativeElement.textContent)
      .toContain('3 projeto(s) encontrado(s)');
    expect(fixture.nativeElement.textContent).toContain('apps/checkout');
    expect(fixture.componentInstance.valid()).toBeFalse();
  });

  it('emits unified project sources with the reviewed classification', () => {
    spyOn(fixture.componentInstance.saveWorkspace, 'emit');
    fixture.componentInstance.name = 'Workspace';
    const index = fixture.componentInstance.beginInspection('/workspace/root');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'root',
      warnings: [],
      projects: [{
        name: 'app',
        relativePath: 'apps/app',
        technology: 'Node.js',
        suggestedKind: null,
        evidence: ['package.json'],
        capabilities: [],
        scripts: ['start'],
        localLinkSuggestion: null,
      }],
    });
    fixture.componentInstance.setKind(0, 0, 'project');
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.saveWorkspace.emit).toHaveBeenCalledWith({
      name: 'Workspace',
      projectSources: [{
        rootPath: '/workspace/root',
        projects: [{
          relativePath: 'apps/app',
          kind: 'project',
          kindSource: 'user',
        }],
      }],
      environment: 'local',
      nodePolicy: { mode: 'inherit' },
    });
  });

  it('loads existing unified sources for review', () => {
    fixture.componentRef.setInput(
      'workspace',
      snapshotFixture.workspaces[0].workspace,
    );
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.sources.length).toBe(2);
    expect(fixture.componentInstance.sources[0].rootPath)
      .toBe('/workspace/plataforma');
  });

  it('shows new and missing projects before confirming rediscovery', () => {
    fixture.componentRef.setInput('reviewMode', true);
    fixture.componentInstance.name = 'Workspace';
    const index = fixture.componentInstance.beginInspection('/workspace/root');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'root',
      warnings: [],
      projects: [{
        name: 'new-app',
        relativePath: 'apps/new-app',
        technology: 'Node.js',
        suggestedKind: 'project',
        configuredKind: 'project',
        kindSource: 'detected',
        status: 'new',
        evidence: ['package.json', 'Script executável'],
        capabilities: [],
        scripts: ['start'],
        localLinkSuggestion: null,
      }],
    });
    fixture.componentInstance.setMissingProjects([{
      projectId: 'root/old-app',
      name: 'old-app',
      relativePath: 'apps/old-app',
    }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Novo projeto');
    expect(fixture.nativeElement.textContent)
      .toContain('Projetos ausentes na nova análise');
    expect(fixture.nativeElement.textContent).toContain('old-app');
  });

  it('allows a manually classified library to opt into local linking', () => {
    fixture.componentInstance.name = 'Workspace';
    const index = fixture.componentInstance.beginInspection('/workspace/lib');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/lib',
      sourceType: 'project',
      warnings: [],
      projects: [{
        name: 'shared-lib',
        relativePath: '.',
        technology: 'Node.js',
        suggestedKind: null,
        evidence: ['package.json'],
        capabilities: [],
        scripts: ['watch'],
        localLinkSuggestion: null,
      }],
    });
    fixture.componentInstance.setKind(0, 0, 'library');
    fixture.componentInstance.setLinkEnabled(0, 0, true);

    expect(fixture.componentInstance.sources[0].projects[0].localLink)
      .toEqual({
        packageName: 'shared-lib',
        developmentScript: 'watch',
        artifactRelativePath: 'dist/shared-lib',
        preferredLinkScript: 'link:shared',
      });
    expect(fixture.componentInstance.valid()).toBeTrue();
  });

  it('recalculates detected kinds without replacing a user override', () => {
    const index = fixture.componentInstance.beginInspection('/workspace/root');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'project',
      warnings: [],
      projects: [{
        name: 'app',
        relativePath: '.',
        technology: 'Node.js',
        suggestedKind: 'library',
        evidence: ['ng-package'],
        capabilities: [],
        scripts: ['build'],
        localLinkSuggestion: null,
      }],
    });
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'project',
      warnings: [],
      projects: [{
        name: 'app',
        relativePath: '.',
        technology: 'Node.js',
        suggestedKind: 'project',
        evidence: ['Script executável'],
        capabilities: [],
        scripts: ['start'],
        localLinkSuggestion: null,
      }],
    });
    expect(fixture.componentInstance.sources[0].projects[0].kind)
      .toBe('project');

    fixture.componentInstance.setKind(0, 0, 'library');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'project',
      warnings: [],
      projects: [{
        name: 'app',
        relativePath: '.',
        technology: 'Node.js',
        suggestedKind: 'project',
        evidence: ['Script executável'],
        capabilities: [],
        scripts: ['start'],
        localLinkSuggestion: null,
      }],
    });
    expect(fixture.componentInstance.sources[0].projects[0].kind)
      .toBe('library');
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
