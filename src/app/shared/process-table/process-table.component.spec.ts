import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProcessTableComponent } from './process-table.component';
import { projectFixture } from '../../../testing/runner-fixtures';

describe('ProcessTableComponent', () => {
  let fixture: ComponentFixture<ProcessTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProcessTableComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ProcessTableComponent);
    fixture.componentRef.setInput('workspaceId', 'workspace-1');
    fixture.componentRef.setInput('projects', [projectFixture]);
    fixture.detectChanges();
  });

  it('shows discovered port, command and resolved Node version', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('4310');
    expect(text).toContain('npm run start');
    expect(text).toContain('v24.15.0');
  });

  it('provides a tooltip for every visible project action', () => {
    const buttons: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('.actions button'),
    ];

    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.title.trim().length > 0)).toBeTrue();
  });

  it('uses consistent semantic SVG icons for project actions', () => {
    const icons = [...fixture.nativeElement.querySelectorAll(
      '.actions svg[data-icon]',
    )].map((icon: SVGElement) => icon.dataset['icon']);

    expect(icons).toContain('play');
    expect(icons).toContain('restart');
    expect(icons).toContain('terminal');
    expect(icons).toContain('external');
    expect(icons).toContain('more');
    expect(icons).toContain('x');
  });

  it('reserves space for actions without shrinking their click targets', () => {
    const table: HTMLTableElement = fixture.nativeElement.querySelector('table');
    const projectHeading: HTMLTableCellElement =
      fixture.nativeElement.querySelector('th:first-child');
    const actionsHeading: HTMLTableCellElement =
      fixture.nativeElement.querySelector('.actions-heading');
    const action: HTMLButtonElement =
      fixture.nativeElement.querySelector('.actions .icon-button');
    const styles = getComputedStyle(action);

    expect(table.scrollWidth).toBeGreaterThanOrEqual(1178);
    expect(table.scrollWidth).toBeLessThan(1200);
    expect(parseFloat(getComputedStyle(actionsHeading).width))
      .toBeGreaterThan(parseFloat(getComputedStyle(projectHeading).width));
    expect(styles.width).toBe('36px');
    expect(styles.height).toBe('36px');
    expect(styles.flexShrink).toBe('0');
  });

  it('shows compact read-only Git context', () => {
    const git: HTMLElement = fixture.nativeElement.querySelector('.git-context');
    expect(git.textContent).toContain('feature/example');
    expect(git.textContent).toContain('● 2');
    expect(git.textContent).toContain('↑1');
    expect(git.title).toContain('Commit: def456abc123');
  });

  it('keeps the project avatar centered inside its fixed square', () => {
    const avatar: HTMLElement = fixture.nativeElement.querySelector(
      '.project__icon',
    );
    const styles = getComputedStyle(avatar);

    expect(styles.display).toBe('grid');
    expect(styles.placeItems).toBe('center');
    expect(styles.width).toBe('34px');
    expect(styles.height).toBe('34px');
    expect(styles.marginTop).toBe('0px');
  });

  it('keeps full diagnostics accessible while shortening repeated warnings', () => {
    const project = {
      ...projectFixture,
      warnings: ['MFE físico não associado a um manifest descoberto.'],
    };
    fixture.componentRef.setInput('projects', [project]);
    fixture.detectChanges();

    const warning: HTMLElement = fixture.nativeElement.querySelector(
      '.project small',
    );
    expect(warning.textContent).toContain('Não associado a um manifest');
    expect(warning.title).toContain('MFE físico não associado');
  });

  it('emits only project identifiers and the selected package script', () => {
    spyOn(fixture.componentInstance.startProject, 'emit');
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--start');
    button.click();

    expect(fixture.componentInstance.startProject.emit).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
      commandId: 'node:script:start',
      script: 'start',
    });
  });

  it('uses the default command resolved by discovery and project overrides', () => {
    const project = {
      ...projectFixture,
      scripts: {
        ng: 'ng',
        start: 'ng serve',
      },
      scriptNames: ['ng', 'start'],
      defaultScript: 'ng',
      commands: [{
        id: 'node:script:ng',
        label: 'npm run ng',
        category: 'run' as const,
        longRunning: true,
        task: 'ng',
        args: [],
      }, {
        id: 'node:script:start',
        label: 'npm run start',
        category: 'run' as const,
        longRunning: true,
        task: 'start',
        args: [],
      }],
      commandIds: ['node:script:ng', 'node:script:start'],
      defaultCommandId: 'node:script:ng',
    };
    fixture.componentRef.setInput('projects', [project]);
    fixture.detectChanges();

    const select: HTMLSelectElement =
      fixture.nativeElement.querySelector('.script-select');

    expect(select.value).toBe('node:script:ng');
    expect(fixture.componentInstance.selectedScript(project)).toBe('ng');
  });

  it('does not reuse a command selected for another workspace', () => {
    const project = {
      ...projectFixture,
      scripts: {
        ng: 'ng',
        start: 'ng serve',
      },
      scriptNames: ['ng', 'start'],
      defaultScript: 'start',
      commands: [{
        id: 'node:script:ng',
        label: 'npm run ng',
        category: 'run' as const,
        longRunning: true,
        task: 'ng',
        args: [],
      }, {
        id: 'node:script:start',
        label: 'npm run start',
        category: 'run' as const,
        longRunning: true,
        task: 'start',
        args: [],
      }],
      commandIds: ['node:script:ng', 'node:script:start'],
      defaultCommandId: 'node:script:start',
    };
    fixture.componentRef.setInput('projects', [project]);
    fixture.detectChanges();

    let select: HTMLSelectElement =
      fixture.nativeElement.querySelector('.script-select');
    select.value = 'node:script:ng';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedScript(project)).toBe('ng');

    fixture.componentRef.setInput('workspaceId', 'workspace-2');
    fixture.detectChanges();
    select = fixture.nativeElement.querySelector('.script-select');

    expect(select.value).toBe('node:script:start');
    expect(fixture.componentInstance.selectedScript(project)).toBe('start');
  });

  it('opens project configuration from the options menu', () => {
    spyOn(fixture.componentInstance.configureProject, 'emit');
    const menuButton = ([...fixture.nativeElement
      .querySelectorAll('.icon-button')]
      .find((button: HTMLButtonElement) =>
        button.title === 'Ferramentas do projeto'
      )) as HTMLButtonElement;
    menuButton.click();
    fixture.detectChanges();
    const configureButton: HTMLButtonElement = [
      ...fixture.nativeElement.querySelectorAll('.tool-menu__panel button'),
    ].find((button: HTMLButtonElement) =>
      button.textContent.includes('Configurar projeto')
    ) as HTMLButtonElement;

    configureButton.click();

    expect(fixture.componentInstance.configureProject.emit)
      .toHaveBeenCalledOnceWith(projectFixture.id);
    expect(fixture.componentInstance.toolsProjectId).toBeNull();
  });

  it('offers accessible project reordering from the options menu', () => {
    const secondProject = {
      ...projectFixture,
      id: 'root-1/second',
      name: 'second',
      displayName: 'second',
    };
    fixture.componentRef.setInput(
      'projects',
      [projectFixture, secondProject],
    );
    spyOn(fixture.componentInstance.moveProject, 'emit');
    fixture.detectChanges();

    const menus: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('.icon-button--more'),
    ];
    menus[1].click();
    fixture.detectChanges();
    const moveUp: HTMLButtonElement = [
      ...fixture.nativeElement.querySelectorAll('.tool-menu__panel button'),
    ].find((button: HTMLButtonElement) =>
      button.textContent.includes('Mover para cima')
    ) as HTMLButtonElement;

    expect(moveUp.title).toBe('Mover projeto para cima');
    expect(moveUp.disabled).toBeFalse();
    moveUp.click();

    expect(fixture.componentInstance.moveProject.emit)
      .toHaveBeenCalledOnceWith({
        projectId: secondProject.id,
        direction: 'up',
      });
  });

  it('disables reordering while the visible list is filtered', () => {
    fixture.componentRef.setInput('reorderEnabled', false);
    fixture.detectChanges();
    const menu: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--more');
    menu.click();
    fixture.detectChanges();

    const moveButtons: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('.tool-menu__panel button'),
    ].filter((button: HTMLButtonElement) =>
      button.textContent.includes('Mover para')
    );
    expect(moveButtons.every((button) => button.disabled)).toBeTrue();
  });

  it('requests removal of an MFE from the Runner list', () => {
    spyOn(fixture.componentInstance.excludeProject, 'emit');
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--remove');

    expect(button.title).toBe('Remover da lista');
    button.click();

    expect(fixture.componentInstance.excludeProject.emit)
      .toHaveBeenCalledOnceWith(projectFixture.id);
  });

  it('also offers removal for a library', () => {
    const library = {
      ...projectFixture,
      id: 'source-library',
      name: 'common-library',
      displayName: 'common-library',
      role: 'library' as const,
      kind: 'library' as const,
      port: undefined,
    };
    fixture.componentRef.setInput('projects', [library]);
    spyOn(fixture.componentInstance.excludeProject, 'emit');
    fixture.detectChanges();

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--remove');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-label'))
      .toBe('Remover common-library da lista');

    button.click();
    expect(fixture.componentInstance.excludeProject.emit)
      .toHaveBeenCalledOnceWith(library.id);
  });

  it('offers developer tools without emitting a path for executable actions', () => {
    spyOn(fixture.componentInstance.openIde, 'emit');
    const menuButton = ([...fixture.nativeElement
      .querySelectorAll('.icon-button')]
      .find((button: HTMLButtonElement) =>
        button.title === 'Ferramentas do projeto'
      )) as HTMLButtonElement | undefined;
    expect(menuButton).toBeDefined();
    menuButton?.click();
    fixture.detectChanges();
    const actions: HTMLButtonElement[] = [
      ...fixture.nativeElement.querySelectorAll('.tool-menu__panel button'),
    ];
    actions.find((button) => button.textContent.includes('Abrir no IDE'))?.click();
    expect(fixture.componentInstance.openIde.emit)
      .toHaveBeenCalledOnceWith(projectFixture.id);
  });

  it('offers external termination only for a port conflict', () => {
    spyOn(fixture.componentInstance.terminateExternalProcess, 'emit');
    fixture.componentRef.setInput('processes', [{
      key: 'workspace-1::root-1/example',
      workspaceId: 'workspace-1',
      projectId: projectFixture.id,
      projectName: projectFixture.displayName,
      script: 'start',
      status: 'conflict',
      pid: null,
      port: projectFixture.port,
      startedAt: null,
      stoppedAt: null,
      exitCode: null,
      message: 'Porta ocupada por um processo externo.',
      logs: [],
    }]);
    fixture.detectChanges();

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--external');
    expect(button.title).toContain(String(projectFixture.port));
    button.click();

    expect(fixture.componentInstance.terminateExternalProcess.emit)
      .toHaveBeenCalledOnceWith(projectFixture.id);
  });

  it('shows each local library status and emits an identifier-only link request', () => {
    spyOn(fixture.componentInstance.linkLibrary, 'emit');
    const consumer = {
      ...projectFixture,
      libraryLinks: [{
        libraryId: 'web-common',
        libraryName: 'web-common-lib',
        packageName: 'web-common-lib',
        state: 'not-linked' as const,
        script: 'link:web-common',
        message: 'O pacote local ainda não está vinculado.',
      }],
    };
    fixture.componentRef.setInput('projects', [consumer]);
    fixture.detectChanges();

    const menuButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.library-menu > button');
    menuButton.click();
    fixture.detectChanges();
    const linkButton = ([...fixture.nativeElement
      .querySelectorAll('.library-link button')][0]) as HTMLButtonElement;

    expect(fixture.nativeElement.textContent).toContain('Não vinculada');
    linkButton.click();
    expect(fixture.componentInstance.linkLibrary.emit).toHaveBeenCalledOnceWith({
      libraryId: 'web-common',
      projectId: projectFixture.id,
    });
  });

  it('offers linking a library project to every consumer', () => {
    spyOn(fixture.componentInstance.linkLibrary, 'emit');
    const library = {
      ...projectFixture,
      id: 'library:web-common',
      role: 'library' as const,
      libraryLinks: [],
      library: {
        libraryId: 'web-common',
        packageName: 'web-common-lib',
        artifactPath: '/workspace/web-common/dist/web-common-lib',
        artifactRelativePath: 'dist/web-common-lib',
        artifactAvailable: true,
        developmentScript: 'watch',
        preferredLinkScript: 'link:web-common',
      },
    };
    fixture.componentRef.setInput('projects', [library]);
    fixture.detectChanges();

    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--link');
    button.click();

    expect(fixture.componentInstance.linkLibrary.emit)
      .toHaveBeenCalledOnceWith({ libraryId: 'web-common' });
  });
});
