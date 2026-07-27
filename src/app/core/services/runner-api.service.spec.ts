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

  it('persists project order using identifiers only', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.updateProjectOrder('workspace-1', [
      'root-1/example',
      'shell',
    ]);
    expect(window.runnerApi?.updateProjectOrder).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectIds: ['root-1/example', 'shell'],
    });
  });

  it('passes the current path as the generic picker starting directory', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.chooseProjectDirectory('/workspace/plataforma');
    expect(window.runnerApi?.chooseProjectDirectory).toHaveBeenCalledOnceWith({
      initialPath: '/workspace/plataforma',
    });
  });

  it('inspects sources and links libraries through identifier-only bridge requests', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.inspectProjectSource('/workspace/web-common');
    await service.linkLibraries({
      workspaceId: 'workspace-1',
      libraryIds: ['web-common'],
      projectIds: ['root-1/example'],
    });

    expect(window.runnerApi?.inspectProjectSource).toHaveBeenCalledOnceWith({
      rootPath: '/workspace/web-common',
      requestId: jasmine.any(String),
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
    bridge.startWorkspace.and.rejectWith(new Error('Path indisponível'));
    const service = TestBed.inject(RunnerApiService);
    await service.startWorkspace('workspace-1');
    expect(service.error()).toBe('Path indisponível');
    expect(service.loading()).toBeFalse();
  });
});
