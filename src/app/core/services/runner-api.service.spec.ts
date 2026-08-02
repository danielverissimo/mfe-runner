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

  it('loads ngrok status explicitly and forwards identifier-only tunnel requests', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.initialize();
    expect(service.ngrokStatus().version).toBe('3.22.1');
    const domains = await service.refreshNgrokDomains();
    expect(domains.map((domain) => domain.domain)).toEqual(['app.example.com']);

    await service.startNgrokTunnel({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
      domainId: 'rd_123',
      domain: 'app.example.com',
    });
    expect(window.runnerApi?.startNgrokTunnel).toHaveBeenCalledOnceWith({
      workspaceId: 'workspace-1',
      projectId: 'root-1/example',
      domainId: 'rd_123',
      domain: 'app.example.com',
    });
  });

  it('creates ngrok domains from a short name and removes Electron error prefixes', async () => {
    const service = TestBed.inject(RunnerApiService);
    const bridge = window.runnerApi!;
    const createDomain = bridge.createNgrokDomain as jasmine.Spy;
    createDomain.and.resolveTo({
      canceled: false,
      domain: {
        id: 'rd_new',
        domain: 'minha-app.ngrok-free.dev',
        description: 'Runner',
        createdAt: null,
        cnameTarget: null,
        certificateStatus: null,
        dnsStatus: null,
        wildcard: false,
        compatible: true,
      },
    });

    await service.createNgrokDomain(
      'minha-app',
      'ngrok-free.dev',
      'Runner',
    );
    expect(bridge.createNgrokDomain).toHaveBeenCalledOnceWith({
      name: 'minha-app',
      suffix: 'ngrok-free.dev',
      description: 'Runner',
    });

    createDomain.and.rejectWith(new Error(
      "Error invoking remote method 'runner:create-ngrok-domain': Error: Este domínio não está disponível. Escolha outra opção.",
    ));
    await service.createNgrokDomain('ocupado', 'ngrok.app');
    expect(service.ngrokDomainsMessage()).toBe(
      'Este domínio não está disponível. Escolha outra opção.',
    );
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

  it('discovers and manages persistent external services through typed bridge calls', async () => {
    const service = TestBed.inject(RunnerApiService);
    const bridge = window.runnerApi!;
    (bridge.discoverExternalServices as jasmine.Spy).and.resolveTo({
      candidates: [{
        id: 'process:123:9090',
        provider: 'process',
        name: 'java',
        host: 'localhost',
        port: 9090,
        pid: 123,
        canTerminate: true,
        ports: [{ host: 'localhost', port: 9090 }],
      }],
      docker: { available: false, message: 'Docker indisponível.' },
      processMessage: null,
    });

    await service.discoverExternalServices('workspace-1');
    expect(service.externalServicesCatalog().candidates[0].port).toBe(9090);
    await service.addExternalService({
      workspaceId: 'workspace-1',
      candidateId: 'process:123:9090',
      name: 'API',
      scheme: 'http',
      host: 'localhost',
      port: 9090,
    });
    await service.removeExternalService('workspace-1', 'external-service:abc');
    expect(bridge.addExternalService).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      candidateId: 'process:123:9090',
      name: 'API',
      scheme: 'http',
      host: 'localhost',
      port: 9090,
    });
    expect(bridge.removeExternalService).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      serviceId: 'external-service:abc',
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

  it('opens the authoritative ngrok config without sending a renderer path', async () => {
    const service = TestBed.inject(RunnerApiService);
    await service.openNgrokConfig();
    expect(window.runnerApi?.openNgrokConfig).toHaveBeenCalledOnceWith();
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
