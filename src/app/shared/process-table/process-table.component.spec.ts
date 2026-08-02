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

  afterEach(() => {
    delete document.documentElement.dataset['theme'];
  });

  it('uses light surfaces for the table and actions in the light theme', () => {
    document.documentElement.dataset['theme'] = 'light';
    fixture.detectChanges();

    const tableShell: HTMLElement =
      fixture.nativeElement.querySelector('.table-shell');
    const tableHeading: HTMLElement =
      fixture.nativeElement.querySelector('th');
    const action: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button');

    expect(getComputedStyle(tableShell).backgroundColor)
      .toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(tableHeading).backgroundColor)
      .not.toBe('rgb(10, 15, 23)');
    expect(getComputedStyle(action).backgroundColor)
      .not.toBe('rgb(18, 25, 37)');
  });

  it('shows discovered port, command and resolved Node version', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('4310');
    expect(text).toContain('npm run start');
    expect(text).toContain('v24.15.0');
  });

  it('shows and opens a dynamic port reported by the supervisor', () => {
    const project = { ...projectFixture, port: null };
    const process = {
      key: 'workspace-1::root-1/example',
      workspaceId: 'workspace-1',
      projectId: project.id,
      projectName: project.name,
      script: 'run',
      commandId: 'flutter:run:web',
      status: 'healthy' as const,
      pid: 123,
      port: 49321,
      startedAt: '2026-08-01T00:00:00.000Z',
      stoppedAt: null,
      exitCode: null,
      message: 'Saudável na porta 49321.',
      logs: [],
      ngrok: null,
    };
    fixture.componentRef.setInput('projects', [project]);
    fixture.componentRef.setInput('processes', [process]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('49321');
    spyOn(fixture.componentInstance.openAddress, 'emit');
    const open: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.icon-button--open',
    );
    open.click();
    expect(fixture.componentInstance.openAddress.emit)
      .toHaveBeenCalledOnceWith(49321);

    fixture.componentRef.setInput('processes', [{
      ...process,
      status: 'stopped' as const,
    }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('49321');
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

  it('offers ngrok only for an active managed process with a known port', () => {
    const process = {
      key: 'workspace-1::root-1/example',
      workspaceId: 'workspace-1',
      projectId: projectFixture.id,
      projectName: projectFixture.name,
      script: 'start',
      status: 'healthy' as const,
      pid: 123,
      port: 4310,
      startedAt: '2026-08-01T00:00:00.000Z',
      stoppedAt: null,
      exitCode: null,
      message: 'Saudável.',
      logs: [],
      ngrok: null,
    };
    fixture.componentRef.setInput('processes', [process]);
    fixture.detectChanges();
    const link: HTMLButtonElement = [...fixture.nativeElement.querySelectorAll('button')]
      .find((button: HTMLButtonElement) => button.title === 'Vincular ngrok');
    expect(link).toBeTruthy();
    spyOn(fixture.componentInstance.linkNgrok, 'emit');
    link.click();
    expect(fixture.componentInstance.linkNgrok.emit)
      .toHaveBeenCalledOnceWith(projectFixture.id);

    fixture.componentRef.setInput('processes', [{
      ...process,
      status: 'stopped' as const,
    }]);
    fixture.detectChanges();
    expect([...fixture.nativeElement.querySelectorAll('button')]
      .some((button: HTMLButtonElement) => button.title === 'Vincular ngrok'))
      .toBeFalse();
  });

  it('renders an external Docker service with only external-service actions', () => {
    const service = {
      id: 'external-service:docker',
      name: 'Docker API',
      scheme: 'http' as const,
      host: 'localhost',
      port: 8080,
      provider: 'docker' as const,
      identity: {
        containerId: 'container-1',
        name: 'api',
        image: 'api:latest',
      },
      logSource: { type: 'docker' as const },
    };
    fixture.componentRef.setInput('externalServices', [service]);
    fixture.componentRef.setInput('processes', [{
      key: 'workspace-1::external-service:docker',
      workspaceId: 'workspace-1',
      projectId: service.id,
      projectName: service.name,
      source: 'external' as const,
      script: 'external',
      status: 'online' as const,
      pid: null,
      port: 8080,
      startedAt: '2026-08-01T00:00:00.000Z',
      stoppedAt: null,
      exitCode: null,
      message: 'Online.',
      logs: [],
      external: {
        scheme: 'http' as const,
        host: 'localhost',
        provider: 'docker' as const,
        identity: service.identity,
        logSource: service.logSource,
        canTerminate: true,
      },
      ngrok: null,
    }]);
    fixture.detectChanges();

    const row: HTMLTableRowElement = fixture.nativeElement.querySelector(
      '.external-row',
    );
    const groups: HTMLElement[] = [
      ...fixture.nativeElement.querySelectorAll('.table-group-row'),
    ];
    expect(groups.map((group) =>
      group.querySelector('span')?.textContent?.trim()
    )).toEqual(['Projetos', 'Serviços externos']);
    expect(groups.map((group) =>
      group.querySelector('small')?.textContent?.trim()
    )).toEqual(['1', '1']);
    expect(row.textContent).toContain('Docker API');
    expect(row.textContent).toContain('Externo');
    expect(row.textContent).toContain('Online');
    expect(row.querySelector('.script-select')).toBeNull();
    expect([...row.querySelectorAll('button')].some((button) =>
      button.title === 'Vincular ngrok'
    )).toBeTrue();
    expect([...row.querySelectorAll('button')].some((button) =>
      button.title === 'Desvincular sem encerrar'
    )).toBeTrue();
  });

  it('shows open, copy and stop actions for an online ngrok tunnel', () => {
    fixture.componentRef.setInput('processes', [{
      key: 'workspace-1::root-1/example',
      workspaceId: 'workspace-1',
      projectId: projectFixture.id,
      projectName: projectFixture.name,
      script: 'start',
      status: 'healthy',
      pid: 123,
      port: 4310,
      startedAt: '2026-08-01T00:00:00.000Z',
      stoppedAt: null,
      exitCode: null,
      message: 'Saudável.',
      logs: [],
      ngrok: {
        status: 'online',
        domainId: 'rd_123',
        domain: 'app.example.com',
        publicUrl: 'https://app.example.com',
        pid: 456,
        exitCode: null,
        startedAt: '2026-08-01T00:00:01.000Z',
        stoppedAt: null,
        message: 'Online.',
      },
    }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('https://app.example.com');
    expect([...fixture.nativeElement.querySelectorAll('button')]
      .some((button: HTMLButtonElement) => button.title === 'Copiar endereço público'))
      .toBeTrue();
    expect([...fixture.nativeElement.querySelectorAll('button')]
      .some((button: HTMLButtonElement) => button.title === 'Encerrar ngrok'))
      .toBeTrue();
    const copyButton: HTMLButtonElement = [...fixture.nativeElement
      .querySelectorAll('button')]
      .find((button: HTMLButtonElement) =>
        button.title === 'Copiar endereço público');
    const stopButton: HTMLButtonElement = [...fixture.nativeElement
      .querySelectorAll('button')]
      .find((button: HTMLButtonElement) => button.title === 'Encerrar ngrok');
    expect(copyButton.querySelector('svg')?.dataset['icon']).toBe('copy');
    expect(stopButton.querySelector('svg')?.dataset['icon']).toBe('stop');
    const uptimeCell: HTMLTableCellElement = fixture.nativeElement
      .querySelector('.uptime-cell');
    expect(getComputedStyle(uptimeCell).whiteSpace).toBe('nowrap');
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
      fixture.nativeElement.querySelector('.script-select select');

    expect(select.value).toBe('node:script:ng');
    expect(fixture.componentInstance.selectedScript(project)).toBe('ng');
  });

  it('groups Flutter commands into Run, Test and Build choices', () => {
    const flutterProject = {
      ...projectFixture,
      ecosystem: 'flutter' as const,
      technology: 'Flutter',
      supportLevel: 'beta' as const,
      commands: [
        { id: 'flutter:run:web', label: 'Flutter · Run Web', category: 'run' as const, longRunning: true, task: 'run', args: [], flutterTarget: 'web' as const },
        { id: 'flutter:run:android', label: 'Flutter · Run Android', category: 'run' as const, longRunning: true, task: 'run', args: [], flutterTarget: 'android' as const },
        { id: 'flutter:run:ios', label: 'Flutter · Run iOS', category: 'run' as const, longRunning: true, task: 'run', args: [], flutterTarget: 'ios' as const },
        { id: 'flutter:test', label: 'Flutter · Test', category: 'test' as const, longRunning: false, task: 'test', args: [], flutterTarget: 'test' as const },
        { id: 'flutter:build:web', label: 'Flutter · Build Web', category: 'build' as const, longRunning: false, task: 'build', args: [], flutterTarget: 'build-web' as const },
        { id: 'flutter:build:android', label: 'Flutter · Build Android', category: 'build' as const, longRunning: false, task: 'build', args: [], flutterTarget: 'build-android' as const },
        { id: 'flutter:build:ios', label: 'Flutter · Build iOS', category: 'build' as const, longRunning: false, task: 'build', args: [], flutterTarget: 'build-ios' as const },
      ],
      commandIds: [
        'flutter:run:web',
        'flutter:run:android',
        'flutter:run:ios',
        'flutter:test',
        'flutter:build:web',
        'flutter:build:android',
        'flutter:build:ios',
      ],
      defaultCommandId: 'flutter:run:ios',
    };
    fixture.componentRef.setInput('projects', [flutterProject]);
    fixture.detectChanges();

    const options: HTMLOptionElement[] = [
      ...fixture.nativeElement.querySelectorAll('.script-select option'),
    ];
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Flutter · Run',
      'Flutter · Test',
      'Flutter · Build',
    ]);
    expect((fixture.nativeElement.querySelector('.script-select select') as HTMLSelectElement).value)
      .toBe('flutter:run:web');
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
      fixture.nativeElement.querySelector('.script-select select');
    select.value = 'node:script:ng';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedScript(project)).toBe('ng');

    fixture.componentRef.setInput('workspaceId', 'workspace-2');
    fixture.detectChanges();
    select = fixture.nativeElement.querySelector('.script-select select');

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

  it('renders the options menu as a viewport overlay and closes it outside', () => {
    const menuButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--more');
    spyOn(menuButton, 'getBoundingClientRect').and.returnValue({
      x: 900,
      y: 240,
      top: 240,
      right: 936,
      bottom: 276,
      left: 900,
      width: 36,
      height: 36,
      toJSON: () => ({}),
    });

    menuButton.click();
    fixture.detectChanges();

    const panel: HTMLElement =
      fixture.nativeElement.querySelector('.tool-menu__panel');
    expect(getComputedStyle(panel).position).toBe('fixed');
    expect(getComputedStyle(panel).zIndex).toBe('10000');
    expect(
      fixture.componentInstance.menuPosition.top ??
      fixture.componentInstance.menuPosition.bottom,
    ).not.toBeNull();
    expect(fixture.componentInstance.menuPosition.right).toBeGreaterThanOrEqual(12);
    expect(fixture.componentInstance.toolsProjectId).toBe(projectFixture.id);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.toolsProjectId).toBeNull();
    expect(fixture.nativeElement.querySelector('.tool-menu__panel')).toBeNull();
  });

  it('closes an open options menu with Escape', () => {
    const menuButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--more');
    menuButton.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    }));
    fixture.detectChanges();

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
