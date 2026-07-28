import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { AppComponent } from './app.component';
import { createBridgeFixture, snapshotFixture } from '../testing/runner-fixtures';
import { RunnerSnapshot } from './core/models/runner.models';

describe('AppComponent workspace experience', () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    localStorage.setItem('mfe-runner.language', 'pt-BR');
    window.runnerApi = createBridgeFixture();
    await TestBed.configureTestingModule({ imports: [AppComponent] })
      .compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => delete window.runnerApi);

  it('switches and persists one of the supported interface languages', () => {
    const selector: HTMLSelectElement =
      fixture.nativeElement.querySelector('.language-picker select');
    selector.value = 'en';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.i18n.language()).toBe('en');
    expect(localStorage.getItem('mfe-runner.language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the selector synchronized with the effective language', async () => {
    fixture.componentInstance.i18n.setLanguage('es');
    fixture.detectChanges();
    await fixture.whenStable();

    const selector: HTMLSelectElement =
      fixture.nativeElement.querySelector('.language-picker select');
    expect(selector.value).toBe('es');
    expect(selector.selectedOptions[0].textContent?.trim()).toBe('Español');
  });

  it('opens directly on Projects without legacy navigation', () => {
    expect(fixture.componentInstance.section()).toBe('projects');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Aplicações e projetos descobertos');
    expect(text).not.toContain('Dashboard');
    expect(text).not.toContain('Tenants');
    expect(text).not.toContain('Shells configurados');
    expect(text).not.toContain('Variáveis de Ambiente');
    expect(fixture.componentInstance.navigation.map((item) => item.id))
      .toEqual(['projects', 'workspaces', 'logs', 'settings']);
  });

  it('renders shell first and MFEs in one process table', () => {
    const names = [...fixture.nativeElement.querySelectorAll('.project strong')]
      .map((element: Element) => element.textContent?.trim());
    expect(names).toEqual(['plataforma', 'plataforma-example']);
  });

  it('persists a reordered project list without changing project settings', async () => {
    const catalog = fixture.componentInstance.runner.snapshot().workspaces[0];

    await fixture.componentInstance.moveProject(
      catalog,
      'root-1/example',
      'up',
    );

    expect(window.runnerApi?.updateProjectOrder).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectIds: ['root-1/example', 'shell'],
    });
    expect(window.runnerApi?.updateProject).not.toHaveBeenCalled();
  });

  it('disables reorder controls while project filters are active', () => {
    fixture.componentInstance.projectNameFilter.set('example');
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

  it('renders colored semantic icons in workspace actions and summary', () => {
    const actionIcons = [...fixture.nativeElement.querySelectorAll(
      '.projects-heading svg[data-icon]',
    )].map((icon: SVGElement) => icon.dataset['icon']);
    const summaryIcons = [...fixture.nativeElement.querySelectorAll(
      '.project-summary svg[data-icon]',
    )].map((icon: SVGElement) => icon.dataset['icon']);

    expect(actionIcons).toContain('play');
    expect(actionIcons).toContain('stop');
    expect(actionIcons).toContain('refresh');
    expect(actionIcons).toContain('settings');
    expect(summaryIcons).toEqual([
      'grid',
      'play',
      'warning',
      'diamond',
    ]);
  });

  it('explains that an excluded project can return on workspace rediscovery', async () => {
    const confirmation = spyOn(window, 'confirm').and.returnValue(true);
    const catalog = fixture.componentInstance.runner.snapshot().workspaces[0];
    const project = catalog.projects.find(
      (item) => item.id === 'root-1/example',
    );

    await fixture.componentInstance.excludeProject(catalog, project!.id);

    expect(confirmation).toHaveBeenCalledWith(
      jasmine.stringContaining('adicionado novamente ao redescobrir'),
    );
    expect(window.runnerApi?.excludeProject).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
    });
  });

  it('allows a library to be removed from the workspace without deleting files', async () => {
    const confirmation = spyOn(window, 'confirm').and.returnValue(true);
    const catalog = fixture.componentInstance.runner.snapshot().workspaces[0];
    const library = {
      ...catalog.projects[0],
      id: 'source-library',
      name: 'common-library',
      displayName: 'common-library',
      role: 'library' as const,
      kind: 'library' as const,
    };
    const catalogWithLibrary = {
      ...catalog,
      projects: [library, ...catalog.projects],
    };

    await fixture.componentInstance.excludeProject(
      catalogWithLibrary,
      library.id,
    );

    expect(confirmation).toHaveBeenCalledWith(
      jasmine.stringContaining('Remover biblioteca "common-library"'),
    );
    expect(confirmation).toHaveBeenCalledWith(
      jasmine.stringContaining('nenhum arquivo será apagado'),
    );
    expect(window.runnerApi?.excludeProject).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'source-library',
    });
  });

  it('shows a blocking loading state while the workspace is stopped and removed', async () => {
    const confirmation = spyOn(window, 'confirm').and.returnValue(true);
    let finishRemoval!: (snapshot: RunnerSnapshot) => void;
    const pendingRemoval = new Promise<RunnerSnapshot>((resolve) => {
      finishRemoval = resolve;
    });
    const removeWorkspace = window.runnerApi?.removeWorkspace as jasmine.Spy;
    removeWorkspace.and.returnValue(pendingRemoval);
    const catalog = fixture.componentInstance.runner.snapshot().workspaces[0];

    const removal = fixture.componentInstance.removeWorkspace(catalog);
    fixture.detectChanges();

    const loading: HTMLElement =
      fixture.nativeElement.querySelector('.workspace-removal-loading');
    expect(confirmation).toHaveBeenCalledWith(
      jasmine.stringContaining('Os processos serão parados'),
    );
    expect(removeWorkspace).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
    });
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.textContent).toContain('Removendo workspace');
    expect(loading.textContent).toContain('Workspace');
    expect(loading.textContent)
      .toContain('Nenhum arquivo dos projetos será excluído.');

    finishRemoval({
      ...snapshotFixture,
      workspaces: [],
    });
    await removal;
    fixture.detectChanges();

    expect(fixture.componentInstance.workspaceRemoval()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.workspace-removal-loading'),
    ).toBeNull();
  });

  it('filters the table between all projects and active processes', () => {
    fixture.componentInstance.runner.snapshot.update((snapshot) => ({
      ...snapshot,
      processes: [{
        key: 'workspace-1::root-1/example',
        workspaceId: 'workspace-1',
        projectId: 'root-1/example',
        projectName: 'plataforma-example',
        script: 'start',
        status: 'healthy',
        pid: 123,
        port: 4310,
        startedAt: '2026-07-24T12:00:00.000Z',
        stoppedAt: null,
        exitCode: null,
        message: 'Saudável',
        logs: [],
      }],
    }));
    fixture.componentInstance.projectVisibility.set('running');
    fixture.detectChanges();

    const names = [...fixture.nativeElement.querySelectorAll('.project strong')]
      .map((element: Element) => element.textContent?.trim());
    expect(names).toEqual(['plataforma-example']);
    expect(fixture.nativeElement.textContent).toContain('Em execução 1');

    fixture.componentInstance.projectVisibility.set('all');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.project strong').length)
      .toBe(2);
  });

  it('keeps the active project filter readable in the light theme', async () => {
    const updateSettings = window.runnerApi?.updateSettings as jasmine.Spy;
    updateSettings.and.callFake(async (input) => ({
      ...snapshotFixture,
      config: {
        ...snapshotFixture.config,
        settings: {
          ...snapshotFixture.config.settings,
          ...input,
        },
      },
    }));

    await fixture.componentInstance.updateTheme('light');
    fixture.detectChanges();

    const activeFilter: HTMLButtonElement =
      fixture.nativeElement.querySelector('.process-filter button.active');
    expect(getComputedStyle(activeFilter).color).toBe('rgb(102, 86, 239)');
  });

  it('shows a specific empty state when no project is running', () => {
    fixture.componentInstance.projectVisibility.set('running');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent)
      .toContain('Nenhum projeto está em execução.');
  });

  it('filters projects by partial name without case or accent differences', () => {
    fixture.componentInstance.runner.snapshot.update((snapshot) => ({
      ...snapshot,
      workspaces: snapshot.workspaces.map((catalog) => ({
        ...catalog,
        projects: catalog.projects.map((project) =>
          project.id === 'root-1/example'
            ? { ...project, displayName: 'Plataforma Integrações' }
            : project
        ),
      })),
    }));
    fixture.detectChanges();

    const search: HTMLInputElement =
      fixture.nativeElement.querySelector('.project-search input');
    search.value = 'INTEGRACO';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const names = [...fixture.nativeElement.querySelectorAll('.project strong')]
      .map((element: Element) => element.textContent?.trim());
    expect(names).toEqual(['Plataforma Integrações']);
    expect(fixture.nativeElement.textContent).toContain('Todos 1');
  });

  it('combines the name search with the running-project filter', () => {
    fixture.componentInstance.runner.snapshot.update((snapshot) => ({
      ...snapshot,
      processes: [{
        key: 'workspace-1::root-1/example',
        workspaceId: 'workspace-1',
        projectId: 'root-1/example',
        projectName: 'plataforma-example',
        script: 'start',
        status: 'healthy',
        pid: 123,
        port: 4310,
        startedAt: '2026-07-24T12:00:00.000Z',
        stoppedAt: null,
        exitCode: null,
        message: 'Saudável',
        logs: [],
      }],
    }));
    fixture.componentInstance.projectVisibility.set('running');
    fixture.componentInstance.projectNameFilter.set('valloo');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.project strong').length)
      .toBe(0);
    expect(fixture.nativeElement.textContent)
      .toContain('Nenhum projeto em execução corresponde à busca.');
    expect(fixture.nativeElement.textContent).toContain('Em execução 0');
  });

  it('clears the project name search from its inline action', () => {
    fixture.componentInstance.projectNameFilter.set('example');
    fixture.detectChanges();

    const clear: HTMLButtonElement =
      fixture.nativeElement.querySelector('.project-search button');
    clear.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.projectNameFilter()).toBe('');
    expect(fixture.nativeElement.querySelectorAll('.project strong').length)
      .toBe(2);
  });

  it('runs global lifecycle by workspace identifier', () => {
    const start: HTMLButtonElement = [...fixture.nativeElement.querySelectorAll('button')]
      .find((button: HTMLButtonElement) =>
        button.textContent?.includes('Iniciar todos')) as HTMLButtonElement;
    start.click();
    expect(window.runnerApi?.startWorkspace).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
    });
  });

  it('disables lifecycle actions while the persistent supervisor is disconnected', () => {
    fixture.componentInstance.runner.snapshot.update((snapshot) => ({
      ...snapshot,
      supervisorConnected: false,
    }));
    fixture.detectChanges();

    const start: HTMLButtonElement = [...fixture.nativeElement.querySelectorAll(
      'button',
    )].find((button: HTMLButtonElement) =>
      button.textContent?.includes('Iniciar todos')
    ) as HTMLButtonElement;
    expect(start.disabled).toBeTrue();

    const projectStart: HTMLButtonElement =
      fixture.nativeElement.querySelector('.icon-button--start');
    expect(projectStart.disabled).toBeTrue();
  });

  it('persists the selected safe-exit policy immediately', async () => {
    fixture.componentInstance.selectSection('settings');
    fixture.detectChanges();
    const keepRunning: HTMLInputElement =
      fixture.nativeElement.querySelector('input[value="keep"]');

    keepRunning.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(window.runnerApi?.updateSettings).toHaveBeenCalledOnceWith({
      stopProcessesOnExit: false,
    });
    expect(fixture.componentInstance.runner.notice())
      .toContain('continuarão executando');
  });

  it('persists and immediately applies the selected appearance theme', async () => {
    fixture.componentInstance.selectSection('settings');
    const updateSettings = window.runnerApi?.updateSettings as jasmine.Spy;
    updateSettings.and.callFake(async (input) => ({
      ...snapshotFixture,
      config: {
        ...snapshotFixture.config,
        settings: {
          ...snapshotFixture.config.settings,
          ...input,
        },
      },
    }));
    fixture.detectChanges();
    const lightTheme: HTMLInputElement =
      fixture.nativeElement.querySelector('input[value="light"]');

    lightTheme.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateSettings).toHaveBeenCalledWith({ theme: 'light' });
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.dataset['themePreference']).toBe('light');
    expect(document.body.dataset['theme']).toBe('light');
    expect(document.body.dataset['themePreference']).toBe('light');
    expect(fixture.componentInstance.effectiveTheme()).toBe('light');
    expect(fixture.nativeElement.querySelector('.app-shell--light')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.app-shell[data-theme="light"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.theme-option').length).toBe(3);
    expect(
      fixture.nativeElement.querySelector(
        '.theme-option.active .theme-option__check',
      )?.textContent,
    ).toContain('✓');
    const themeOptions: HTMLElement =
      fixture.nativeElement.querySelector('.theme-options');
    const selectedOption: HTMLElement =
      fixture.nativeElement.querySelector('.theme-option.active');
    const selectedInput: HTMLInputElement =
      selectedOption.querySelector('.theme-option__input')!;
    expect(getComputedStyle(themeOptions).display).toBe('grid');
    expect(getComputedStyle(themeOptions).borderTopWidth).toBe('0px');
    expect(getComputedStyle(selectedOption).display).toBe('grid');
    expect(getComputedStyle(selectedInput).position).toBe('absolute');
    expect(getComputedStyle(selectedInput).opacity).toBe('0');
    expect(getComputedStyle(selectedOption).borderRadius).toBe('12px');
    expect(getComputedStyle(document.body).backgroundColor)
      .toBe('rgb(243, 245, 250)');
    expect(fixture.componentInstance.runner.notice()).toBe('Tema atualizado.');
  });

  it('waits for an executable before persisting an explicit runtime policy', async () => {
    fixture.componentInstance.selectSection('settings');
    const updateSettings = window.runnerApi?.updateSettings as jasmine.Spy;
    updateSettings.calls.reset();

    await fixture.componentInstance.updateGlobalExecutionMode(
      'java-maven',
      'runtime',
      { target: { value: 'explicit' } } as unknown as Event,
    );
    fixture.detectChanges();

    expect(updateSettings).not.toHaveBeenCalled();
    expect(
      fixture.componentInstance.globalExecutionMode(
        'java-maven',
        'runtime',
      ),
    ).toBe('explicit');
    expect(fixture.nativeElement.querySelector(
      '.runtime-card:nth-of-type(2) .runtime-component__explicit',
    )).not.toBeNull();

    fixture.componentInstance.updateGlobalPolicyDraft(
      'java-maven',
      'runtime',
      '/opt/jdk-21',
    );
    await fixture.componentInstance.saveGlobalExecutionPath(
      'java-maven',
      'runtime',
    );

    expect(updateSettings).toHaveBeenCalledOnceWith({
      executionPolicies: {
        node: { runtime: { mode: 'auto' } },
        'java-maven': {
          runtime: { mode: 'explicit', path: '/opt/jdk-21' },
        },
      },
    });
    expect(fixture.componentInstance.runner.error()).toBeNull();
  });

  it('persists automatic runtime detection immediately', async () => {
    const updateSettings = window.runnerApi?.updateSettings as jasmine.Spy;
    updateSettings.calls.reset();
    fixture.componentInstance.pendingExplicitPolicies.set({
      'python:runtime': true,
    });

    await fixture.componentInstance.updateGlobalExecutionMode(
      'python',
      'runtime',
      { target: { value: 'auto' } } as unknown as Event,
    );

    expect(updateSettings).toHaveBeenCalledOnceWith({
      executionPolicies: {
        node: { runtime: { mode: 'auto' } },
        python: { runtime: { mode: 'auto' } },
      },
    });
    expect(
      fixture.componentInstance.globalExecutionMode('python', 'runtime'),
    ).toBe('auto');
  });

  it('detects installed runtimes and accepts a native path selection', async () => {
    fixture.componentInstance.selectSection('settings');
    await fixture.componentInstance.updateGlobalExecutionMode(
      'java-maven',
      'runtime',
      { target: { value: 'explicit' } } as unknown as Event,
    );

    expect(window.runnerApi?.listRuntimeInstallations).toHaveBeenCalledWith({
      ecosystem: 'java-maven',
      component: 'runtime',
    });
    expect(
      fixture.componentInstance.runner.runtimeInstallationCatalog(
        'java-maven',
        'runtime',
      ).installations[0].version,
    ).toBe('21.0.1');

    await fixture.componentInstance.browseRuntimePath(
      'java-maven',
      'runtime',
    );

    expect(window.runnerApi?.chooseRuntimePath).toHaveBeenCalledWith({
      ecosystem: 'java-maven',
      component: 'runtime',
      initialPath: undefined,
    });
    expect(
      fixture.componentInstance.globalPolicyDraft(
        'java-maven',
        'runtime',
      ),
    ).toBe('/opt/runtime/bin/tool');
  });

  it('configures the process log limit and removes the write-boundary card', async () => {
    fixture.componentInstance.selectSection('settings');
    fixture.detectChanges();
    const updateSettings = window.runnerApi?.updateSettings as jasmine.Spy;
    updateSettings.calls.reset();
    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('#log-limit');
    const save: HTMLButtonElement = [...fixture.nativeElement.querySelectorAll(
      'button',
    )].find((button: HTMLButtonElement) =>
      button.textContent?.includes('Salvar limite')
    ) as HTMLButtonElement;

    input.value = '3200';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    save.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateSettings).toHaveBeenCalledOnceWith({ logLimit: 3200 });
    expect(fixture.componentInstance.runner.notice())
      .toBe('Limite de logs atualizado.');
    expect(fixture.nativeElement.textContent)
      .not.toContain('Fronteira de escrita');
  });

  it('rejects a log limit outside the supported range', () => {
    fixture.componentInstance.selectSection('settings');
    fixture.detectChanges();
    const updateSettings = window.runnerApi?.updateSettings as jasmine.Spy;
    updateSettings.calls.reset();
    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('#log-limit');
    const save: HTMLButtonElement = [...fixture.nativeElement.querySelectorAll(
      'button',
    )].find((button: HTMLButtonElement) =>
      button.textContent?.includes('Salvar limite')
    ) as HTMLButtonElement;

    input.value = '100';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(save.disabled).toBeTrue();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('provides a dedicated Workspaces management screen', () => {
    fixture.componentInstance.selectSection('workspaces');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Configuração central');
    expect(text).toContain(
      snapshotFixture.workspaces[0].workspace.projectSources[0].rootPath,
    );
    expect(text).toContain('Abrir projetos');
    expect(text).toContain('Configurar');
    expect(text).toContain('Redescobrir');
    expect(text).toContain('Remover');
  });

  it('returns from Logs to Projects by default', () => {
    fixture.componentInstance.selectSection('logs');
    fixture.componentInstance.backFromLogs();
    expect(fixture.componentInstance.section()).toBe('projects');
  });

  it('keeps a single resize preference for Projects and logs', () => {
    fixture.componentInstance.processAreaPercent.set(74);
    expect(fixture.componentInstance.workspaceRows()).toContain('74fr');
    fixture.componentInstance.resetSplit();
    expect(fixture.componentInstance.processAreaPercent()).toBe(68);
  });

  it('keeps the resizable projects and logs area inside the remaining viewport', () => {
    const content: HTMLElement =
      fixture.nativeElement.querySelector('.content');
    const workspace: HTMLElement =
      fixture.nativeElement.querySelector('.resizable-workspace');

    expect(content.classList).toContain('content--projects');
    expect(getComputedStyle(content).display).toBe('flex');
    expect(getComputedStyle(workspace).minHeight).toBe('0px');
    expect(getComputedStyle(workspace).flexGrow).toBe('1');
  });

  it('renders the completed link summary in the feedback stack', () => {
    fixture.componentInstance.runner.notice.set(
      'Vínculo concluído: 1 concluído, 0 com falha e 0 ignorados.',
    );
    fixture.detectChanges();

    const feedback: HTMLElement =
      fixture.nativeElement.querySelector('.notice-banner');
    expect(feedback.textContent).toContain('Vínculo concluído');
    expect(feedback.closest('.feedback-stack')).not.toBeNull();
    expect(getComputedStyle(feedback).backgroundColor)
      .toBe('rgb(16, 37, 31)');
  });

  it('offers a confirmed download when a new version is available', async () => {
    const confirmation = spyOn(window, 'confirm').and.returnValue(true);
    fixture.componentInstance.runner.updateState.set({
      supported: true,
      userInitiated: true,
      status: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      progress: null,
      checkedAt: '2026-07-26T12:00:00.000Z',
      message: 'A versão 0.2.0 está disponível.',
    });
    fixture.detectChanges();

    const download: HTMLButtonElement =
      fixture.nativeElement.querySelector('.update-banner button');
    download.click();
    await fixture.whenStable();

    expect(confirmation).toHaveBeenCalled();
    expect(window.runnerApi?.downloadUpdate).toHaveBeenCalled();
  });

  it('shows a centered blocking status while the update is being installed', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const installUpdate = window.runnerApi?.installUpdate as jasmine.Spy;
    installUpdate.and.returnValue(new Promise<never>(() => undefined));

    void fixture.componentInstance.confirmInstallUpdate();
    fixture.detectChanges();

    const loading: HTMLElement =
      fixture.nativeElement.querySelector('.app-update-loading');
    expect(fixture.componentInstance.installingUpdate()).toBeTrue();
    expect(loading).not.toBeNull();
    expect(loading.getAttribute('role')).toBe('dialog');
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.textContent).toContain('Atualizando...');
    expect(loading.textContent)
      .toContain('O MFE Runner será reiniciado assim que a instalação terminar.');
    expect(getComputedStyle(loading).position).toBe('fixed');
    expect(fixture.nativeElement.querySelector('.app-update-backdrop'))
      .not.toBeNull();
  });

  it('removes the update loading status when installation cannot start', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const installUpdate = window.runnerApi?.installUpdate as jasmine.Spy;
    installUpdate.and.returnValue(
      Promise.reject(new Error('Falha ao iniciar a atualização.')),
    );

    await fixture.componentInstance.confirmInstallUpdate();
    fixture.detectChanges();

    expect(fixture.componentInstance.installingUpdate()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.app-update-loading'))
      .toBeNull();
    expect(fixture.componentInstance.runner.error())
      .toBe('Falha ao iniciar a atualização.');
  });

  it('shows progress and the result of a user-initiated update check', () => {
    const updateState = fixture.componentInstance.runner.updateState;
    updateState.set({
      supported: true,
      userInitiated: true,
      status: 'checking',
      currentVersion: '0.1.0',
      availableVersion: null,
      progress: null,
      checkedAt: null,
      message: 'Buscando atualizações…',
    });
    fixture.detectChanges();

    let banner: HTMLElement =
      fixture.nativeElement.querySelector('.update-banner');
    expect(banner.textContent).toContain('Buscando atualizações');
    expect(banner.querySelector('.update-spinner')).not.toBeNull();

    updateState.set({
      ...updateState(),
      status: 'not-available',
      checkedAt: '2026-07-26T12:00:00.000Z',
      message: 'Você já está usando a versão mais recente.',
    });
    fixture.detectChanges();

    banner = fixture.nativeElement.querySelector('.update-banner');
    expect(banner.textContent)
      .toContain('Você já está usando a versão mais recente.');
    expect(banner.querySelector('.update-spinner')).toBeNull();
    const close: HTMLButtonElement =
      banner.querySelector('.update-banner__close')!;
    expect(close.getAttribute('aria-label'))
      .toBe('Fechar mensagem de atualização');
    close.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.update-banner')).toBeNull();
  });

  it('automatically dismisses the up-to-date message after five seconds', fakeAsync(() => {
    fixture.componentInstance.runner.updateState.set({
      supported: true,
      userInitiated: true,
      status: 'not-available',
      currentVersion: '0.1.0',
      availableVersion: null,
      progress: null,
      checkedAt: '2026-07-26T12:00:00.000Z',
      message: 'Você já está usando a versão mais recente.',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.update-banner')).not.toBeNull();
    tick(4_999);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.update-banner')).not.toBeNull();

    tick(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.update-banner')).toBeNull();
  }));

  it('does not interrupt the user for an automatic check with no update', () => {
    fixture.componentInstance.runner.updateState.set({
      supported: true,
      userInitiated: false,
      status: 'not-available',
      currentVersion: '0.1.0',
      availableVersion: null,
      progress: null,
      checkedAt: '2026-07-26T12:00:00.000Z',
      message: 'Você já está usando a versão mais recente.',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.update-banner')).toBeNull();
  });

  it('shows update status and manual check in settings', () => {
    fixture.componentInstance.selectSection('settings');
    fixture.detectChanges();

    const card: HTMLElement =
      fixture.nativeElement.querySelector('.update-settings');
    expect(card.textContent).toContain('Atualizações do MFE Runner');
    expect(card.textContent).toContain('Versão instalada');
    expect(card.textContent).toContain('Buscar atualizações');
  });
});

describe('AppComponent persisted language', () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    localStorage.setItem('mfe-runner.language', 'es');
    window.runnerApi = createBridgeFixture();
    await TestBed.configureTestingModule({ imports: [AppComponent] })
      .compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => delete window.runnerApi);

  it('selects the language loaded from persisted settings on startup', () => {
    const selector: HTMLSelectElement =
      fixture.nativeElement.querySelector('.language-picker select');

    expect(fixture.componentInstance.i18n.language()).toBe('es');
    expect(selector.value).toBe('es');
    expect(selector.selectedOptions[0].textContent?.trim()).toBe('Español');
  });
});
