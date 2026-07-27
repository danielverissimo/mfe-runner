import { TestBed } from '@angular/core/testing';
import { RunnerApiService } from './runner-api.service';
import { RunnerBridge } from '../models/runner.models';
import { createBridgeFixture, snapshotFixture } from '../../../testing/runner-fixtures';

describe('RunnerApiService', () => {
  beforeEach(() => {
    window.runnerApi = createBridgeFixture();
    TestBed.configureTestingModule({});
  });

  afterEach(() => delete window.runnerApi);

  it('loads the v4 workspace snapshot through the constrained bridge', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.initialize();
    expect(service.snapshot()).toEqual(snapshotFixture);
    expect(service.workspaces().length).toBe(1);
    expect(window.runnerApi?.onSnapshot).toHaveBeenCalled();
  });

  it('delegates project lifecycle with workspace and project identifiers', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.startProject({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
      script: 'start',
    });
    expect(window.runnerApi?.startProject).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
      script: 'start',
    });
  });

  it('requests external process termination through the constrained bridge', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.terminateExternalProcess(
      'workspace-1',
      'root-1/example',
    );
    expect(window.runnerApi?.terminateExternalProcess)
      .toHaveBeenCalledOnceWith({
        workspaceId: 'workspace-1',
        projectId: 'root-1/example',
      });
  });

  it('delegates workspace lifecycle and project exclusion', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.startWorkspace('workspace-1');
    await service.excludeProject('workspace-1', 'root-1/example');
    expect(window.runnerApi?.startWorkspace).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
    });
    expect(window.runnerApi?.excludeProject).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
    });
  });

  it('passes the current path as the native picker starting directory', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.chooseShellDirectory('/workspace/plataforma');
    await service.chooseMfeDirectory('/workspace/mfes');
    await service.chooseLibraryDirectory('/workspace/web-common');
    expect(window.runnerApi?.chooseShellDirectory).toHaveBeenCalledOnceWith({
      initialPath: '/workspace/plataforma',
    });
    expect(window.runnerApi?.chooseMfeDirectory).toHaveBeenCalledOnceWith({
      initialPath: '/workspace/mfes',
    });
    expect(window.runnerApi?.chooseLibraryDirectory).toHaveBeenCalledOnceWith({
      initialPath: '/workspace/web-common',
    });
  });

  it('inspects and links libraries through identifier-only bridge requests', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.inspectLibraryDirectory('/workspace/web-common');
    await service.linkLibraries({
      workspaceId: 'workspace-1',
      libraryIds: ['web-common'],
      projectIds: ['root-1/example'],
    });

    expect(window.runnerApi?.inspectLibraryDirectory).toHaveBeenCalledOnceWith({
      rootPath: '/workspace/web-common',
    });
    expect(window.runnerApi?.linkLibraries).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      libraryIds: ['web-common'],
      projectIds: ['root-1/example'],
    });
  });

  it('publishes a visible summary after library linking finishes', async () => {
    const bridge = window.runnerApi as jasmine.SpyObj<RunnerBridge>;
    bridge.linkLibraries.and.resolveTo({
      snapshot: snapshotFixture,
      results: [{
        libraryId: 'web-common',
        projectId: 'root-1/example',
        status: 'linked',
        message: 'Vínculo concluído.',
      }],
    });
    const service = TestBed.inject(RunnerApiService);

    await service.linkLibraries({
      workspaceId: 'workspace-1',
      libraryIds: ['web-common'],
      projectIds: ['root-1/example'],
    });

    expect(service.notice()).toContain('Vínculo concluído');
    expect(service.notice()).toContain('1 concluído');
  });

  it('copies text through the constrained Electron bridge', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.copyText('log selecionado');
    expect(window.runnerApi?.copyText).toHaveBeenCalledOnceWith({
      text: 'log selecionado',
    });
  });

  it('delegates developer tools using only workspace and project identifiers', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.openProjectInIde('workspace-1', 'root-1/example');
    await service.openProjectFolder('workspace-1', 'root-1/example');
    await service.openProjectTerminal('workspace-1', 'root-1/example');
    expect(window.runnerApi?.openProjectInIde).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
    });
    expect(window.runnerApi?.openProjectFolder).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
    });
    expect(window.runnerApi?.openProjectTerminal).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
    });
  });

  it('exposes bridge failures as an interface error', async () => {
    const bridge = window.runnerApi as jasmine.SpyObj<RunnerBridge>;
    bridge.refreshWorkspace.and.rejectWith(new Error('Path indisponível'));
    const service = TestBed.inject(RunnerApiService);
    await service.refreshWorkspace('workspace-1');
    expect(service.error()).toBe('Path indisponível');
    expect(service.loading()).toBeFalse();
  });
});
