import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkspaceDialogComponent } from './workspace-dialog.component';
import { snapshotFixture } from '../../../testing/runner-fixtures';
import {
  DetectedProjectCandidate,
} from '../../core/models/runner.models';

function candidate(
  overrides: Partial<DetectedProjectCandidate> = {},
): DetectedProjectCandidate {
  return {
    name: 'app',
    relativePath: '.',
    technology: 'Node.js',
    ecosystem: 'node',
    supportLevel: 'stable',
    commands: [{
      id: 'node:script:start',
      label: 'npm run start',
      category: 'run',
      longRunning: true,
      task: 'start',
      args: [],
    }],
    defaultCommandId: 'node:script:start',
    runtimeRequirements: {},
    suggestedKind: 'project',
    evidence: ['package.json'],
    capabilities: [],
    scripts: ['start'],
    localLinkSuggestion: null,
    ...overrides,
  };
}

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
      projects: [candidate({
        name: 'app',
        evidence: ['package.json', 'Script executável'],
      })],
    });
    expect(fixture.componentInstance.valid()).toBeTrue();
  });

  it('explains supported path layouts and the safe analysis flow', () => {
    const guide = fixture.nativeElement.querySelector(
      '.discovery-guide',
    ) as HTMLElement;
    expect(guide).not.toBeNull();
    expect(guide.textContent).toContain('Projeto exato');
    expect(guide.textContent).toContain('Raiz com vários projetos');
    expect(guide.textContent).toContain('Monorepo');
    expect(guide.textContent).toContain('não executa builds ou scripts');
    expect(guide.textContent).toContain('não altera os arquivos dos projetos');
  });

  it('uses the active semantic theme colors in the modal surfaces', () => {
    document.documentElement.dataset['theme'] = 'dark';
    fixture.nativeElement.setAttribute('data-theme', 'light');
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector(
      '.dialog',
    ) as HTMLElement;
    const input = fixture.nativeElement.querySelector(
      'input[name="workspaceName"]',
    ) as HTMLInputElement;
    const guide = fixture.nativeElement.querySelector(
      '.discovery-guide',
    ) as HTMLElement;

    expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(dialog).color).toBe('rgb(24, 32, 51)');
    expect(getComputedStyle(input).backgroundColor).toBe('rgb(247, 248, 251)');
    expect(getComputedStyle(guide).backgroundColor)
      .not.toBe('rgb(18, 24, 34)');

    fixture.nativeElement.removeAttribute('data-theme');
    delete document.documentElement.dataset['theme'];
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
      projects: [candidate({
        relativePath: 'apps/app',
        suggestedKind: null,
      })],
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
      executionPolicies: {
        node: { runtime: { mode: 'inherit' } },
      },
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
      projects: [candidate({
        name: 'new-app',
        relativePath: 'apps/new-app',
        configuredKind: 'project',
        kindSource: 'detected',
        status: 'new',
        evidence: ['package.json', 'Script executável'],
      })],
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
      projects: [candidate({
        name: 'shared-lib',
        suggestedKind: null,
        scripts: ['watch'],
      })],
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

  it('enables linking by default for a confidently detected Node library', () => {
    fixture.componentInstance.name = 'Workspace';
    const index = fixture.componentInstance.beginInspection('/workspace/lib');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/lib',
      sourceType: 'project',
      warnings: [],
      projects: [candidate({
        name: 'web-common-lib',
        suggestedKind: 'library',
        evidence: ['Angular projectType: library', 'ng-package'],
        scripts: ['build', 'watch'],
        localLinkSuggestion: {
          packageName: 'web-common-lib',
          developmentScript: 'watch',
          artifactRelativePath: 'dist/web-common-lib',
          preferredLinkScript: 'link:web-common',
        },
      })],
    });

    const project = fixture.componentInstance.sources[0].projects[0];
    expect(project.linkEnabled).toBeTrue();
    expect(project.localLink?.preferredLinkScript).toBe('link:web-common');
  });

  it('persists an explicit opt-out from linking a detected library', () => {
    fixture.componentInstance.name = 'Workspace';
    const index = fixture.componentInstance.beginInspection('/workspace/lib');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/lib',
      sourceType: 'project',
      warnings: [],
      projects: [candidate({
        name: 'web-common-lib',
        suggestedKind: 'library',
        evidence: ['Angular projectType: library', 'ng-package'],
        scripts: ['build', 'watch'],
        localLinkSuggestion: {
          packageName: 'web-common-lib',
          developmentScript: 'watch',
          artifactRelativePath: 'dist/web-common-lib',
          preferredLinkScript: 'link:web-common',
        },
      })],
    });
    fixture.componentInstance.setLinkEnabled(0, 0, false);
    spyOn(fixture.componentInstance.saveWorkspace, 'emit');

    fixture.componentInstance.submit();

    const saved = (
      fixture.componentInstance.saveWorkspace.emit as jasmine.Spy
    ).calls.mostRecent().args[0];
    expect(saved.projectSources[0].projects[0].localLibraryLink).toEqual({
      enabled: false,
      packageName: 'web-common-lib',
      developmentScript: 'watch',
      artifactRelativePath: 'dist/web-common-lib',
      preferredLinkScript: 'link:web-common',
    });
  });

  it('recalculates detected kinds without replacing a user override', () => {
    const index = fixture.componentInstance.beginInspection('/workspace/root');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'project',
      warnings: [],
      projects: [candidate({
        suggestedKind: 'library',
        evidence: ['ng-package'],
        scripts: ['build'],
      })],
    });
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'project',
      warnings: [],
      projects: [candidate({
        evidence: ['Script executável'],
      })],
    });
    expect(fixture.componentInstance.sources[0].projects[0].kind)
      .toBe('project');

    fixture.componentInstance.setKind(0, 0, 'library');
    fixture.componentInstance.setInspection(index, {
      rootPath: '/workspace/root',
      sourceType: 'project',
      warnings: [],
      projects: [candidate({
        evidence: ['Script executável'],
      })],
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
